const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../middleware/auth");
const { v4: uuidv4 } = require("uuid");
const { logger } = require("../jobLogger");
const {
  getContainer,
  getUserDetails,
  updateRecord,
  getUsers,
} = require("../services/cosmosService");
const { OTPGeneration } = require("../services/otpService");
const { setUserInCache } = require("../services/userService");
const responseModel = require("../models/ResponseModel");
const {
  ContainerIds,
  roles,
  userMessages,
  commonMessages,
} = require("../constants");
const {
  customerSchema,
  addressSchema,
  createDynamicSchema,
} = require("../models/userSchemas");
const { convertUTCtoIST } = require("../utils/schedules");
const customerContainer = getContainer(ContainerIds.Customers);

router.post("/signup", async (req, res) => {
  try {
    const result = customerSchema.safeParse(req.body); // Compare with req.body

    if (!result.success) {
      const errors = result.error.issues.map((err) => ({
        field: err.path.join("."),
        message: err.message,
      }));
      return res
        .status(400)
        .json(new responseModel(false, commonMessages.invalidFields, errors));
    }

    const {
      name = "",
      phone,
      email = "",
      profilePicture = "",
      dateOfBirth,
    } = req.body;

    let user = await getUserDetails(customerContainer, phone);

    if (!user) {
      const newUser = {
        id: uuidv4(),
        name,
        phone,
        email,
        profilePicture,
        onboard: false,
        addresses: [],
        verified: false,
        dateOfBirth,
        createdOn: convertUTCtoIST(new Date().toISOString()),
      };

      user = await setUserInCache(phone, roles.Customer, newUser);
      if (!user.success) {
        return res
          .status(500)
          .json(new responseModel(false, commonMessages.failed));
      }
      var userMessage = userMessages.success;
    } else {
      userMessage = userMessages.exist;
    }

    const response = await OTPGeneration(phone, roles.Customer);

    if (!response.success) {
      return res.status(500).json(response);
    }
    return res.status(200).json(new responseModel(true, userMessage));
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(500).json(new responseModel(false, error.message));
  }
});

router.post("/update", authenticateToken, async (req, res) => {
  try {
    const { id, phone } = req.user;

    const result = createDynamicSchema(customerSchema, req.body);

    if (!result.success) return res.status(400).json(result);

    if (!phone)
      return res.status(400).json(
        new responseModel(false, commonMessages.badRequest, {
          field: "phone",
          message: commonMessages.badRequest,
        }),
      );

    const duplicateRecords = await getUsers(
      customerContainer,
      "",
      req.body.email,
    );

    if (
      duplicateRecords &&
      duplicateRecords.some(
        (user) => user.email === req.body.email && user.id !== id,
      )
    )
      return res.status(409).json(
        new responseModel(false, commonMessages.invalidFields, {
          field: "email",
          message: userMessages.emailExist,
        }),
      );

    const existingUser = await getUserDetails(customerContainer, phone);

    if (!existingUser)
      return res
        .status(404)
        .json(new responseModel(false, userMessages.notfound));

    const updatedUser = {
      ...existingUser,
    };

    Object.keys(req.body).forEach((key) => {
      if (!["id", "phone", "createdOn"].includes(key)) {
        updatedUser[key] = req.body[key];
      }
    });

    const updatedDetails = await updateRecord(customerContainer, updatedUser);

    if (!updatedDetails)
      return res
        .status(500)
        .json(new responseModel(false, commonMessages.failed));

    return res
      .status(200)
      .json(new responseModel(true, userMessages.updated, updatedDetails));
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(500).json(new responseModel(false, error.message));
  }
});

//API to Add address by Phone Number
router.post("/addAddress", authenticateToken, async (req, res) => {
  try {
    const result = addressSchema.safeParse(req.body.address); // Compare with req.body

    if (!result.success) {
      const errors = result.error.issues.map((err) => ({
        field: err.path.join("."),
        message: err.message,
      }));
      return res
        .status(400)
        .json(new responseModel(false, commonMessages.invalidFields, errors));
    }

    const { address } = req.body;

    const phone = req.user.phone;

    if (!phone || !address)
      return res
        .status(400)
        .json(new responseModel(false, commonMessages.badRequest));

    address.id = uuidv4();
    const user = await getUserDetails(customerContainer, phone);

    user.address = user.addresses.push(address);

    const updatedDetails = await updateRecord(customerContainer, user);
    if (!updatedDetails) {
      return res
        .status(500)
        .json(new responseModel(false, commonMessages.failed));
    }
    return res
      .status(201)
      .json(new responseModel(true, userMessages.address.added));
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(500).json(new responseModel(false, error.message));
  }
});

//API to update address by Phone Number
router.post("/updateAddress", authenticateToken, async (req, res) => {
  try {
    const result = addressSchema.safeParse(req.body.address); // Compare with req.body

    if (!result.success) {
      const errors = result.error.issues.map((err) => ({
        field: err.path.join("."),
        message: err.message,
      }));
      return res
        .status(400)
        .json(new responseModel(false, commonMessages.invalidFields, errors));
    }

    const { address } = req.body;

    const phone = req.user.phone;

    if (!phone || !address)
      return res
        .status(400)
        .json(new responseModel(false, commonMessages.badRequest));

    const user = await getUserDetails(customerContainer, phone);

    const addressIndex = user.addresses.findIndex((a) => a.id === address.id);

    user.addresses[addressIndex] = address;

    const updatedDetails = await updateRecord(customerContainer, user);

    if (!updatedDetails)
      return res
        .status(500)
        .json(new responseModel(false, commonMessages.failed));

    return res
      .status(200)
      .json(new responseModel(true, userMessages.address.updated));
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(500).json(new responseModel(false, error.message));
  }
});

router.post(
  "/deleteAddress/:addressId",
  authenticateToken,
  async (req, res) => {
    try {
      const { addressId } = req.params;
      const phone = req.user.phone;
      const user = await getUserDetails(customerContainer, phone);
      const updatedaddresses = user.addresses.filter((a) => a.id !== addressId);

      user.addresses = updatedaddresses;
      const updatedDetails = await updateRecord(customerContainer, user);
      if (!updatedDetails) {
        return res
          .status(500)
          .json(new responseModel(false, commonMessages.failed));
      }

      return res
        .status(200)
        .json(new responseModel(true, userMessages.address.removed));
    } catch (error) {
      logger.error(commonMessages.errorOccured, error);
      return res.status(500).json(new responseModel(false, error.message));
    }
  },
);

router.get("/view", authenticateToken, async (req, res) => {
  try {
    const phone = req.user.phone;

    const { addresses } = await getUserDetails(customerContainer, phone);

    return res
      .status(200)
      .json(new responseModel(true, userMessages.address.fetched, addresses));
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(500).json(new responseModel(false, error.message));
  }
});

router.get(
  "/getAddressById/:addressId",
  authenticateToken,
  async (req, res) => {
    try {
      const phone = req.user.phone;

      const { addressId } = req.params;

      if (!phone || !addressId)
        return res
          .status(400)
          .json(new responseModel(false, commonMessages.badRequest));

      const { addresses } = await getUserDetails(customerContainer, phone);

      const address = addresses.find((a) => a.id === addressId);

      if (address)
        return res
          .status(200)
          .json(new responseModel(true, userMessages.address.fetched, address));
      else
        return res
          .status(404)
          .json(new responseModel(false, userMessages.address.notFound));
    } catch (error) {
      logger.error(commonMessages.errorOccured, error);
      return res.status(500).json(new responseModel(false, error.message));
    }
  },
);

module.exports = router;
