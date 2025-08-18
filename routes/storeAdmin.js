const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../middleware/auth");
const responseModel = require("../models/ResponseModel");
const { adminSchema } = require("../models/storeSchemas");
const { createDynamicSchema } = require("../models/userSchemas");
const { v4: uuidv4 } = require("uuid");
const { logger } = require("../jobLogger");
const {
  getContainer,
  getDetailsByEmail,
  getDetailsById,
  getUserDetails,
  getUsers,
  updateRecord,
} = require("../services/cosmosService");
const {
  ContainerIds,
  userMessages,
  commonMessages,
  roles,
} = require("../constants");
const { OTPGeneration } = require("../services/otpService");
const {
  setUserInCache,
  getAnalysticsByStoreAdmin,
} = require("../services/userService");
const { getUsersByStoreId } = require("../services/storeService");
const bcrypt = require("bcrypt");
const { convertUTCtoIST } = require("../utils/schedules");
const storeAdminContainer = getContainer(ContainerIds.StoreAdmins);

router.post("/signup", async (req, res) => {
  try {
    const result = adminSchema.safeParse(req.body); // Compare with req.body

    if (!result.success) {
      const errors = result.error.issues.map((err) => ({
        field: err.path.join("."),
        message: err.message,
      }));
      return res
        .status(400)
        .json(new responseModel(false, commonMessages.invalidFields, errors));
    }

    const { name, email, phone, password } = req.body;

    const existingUser = await getDetailsByEmail(storeAdminContainer, email);

    let duplicateFields = [];

    if (existingUser)
      duplicateFields.push({
        field: "email",
        message: userMessages.emailExist,
      });

    let user = await getUserDetails(storeAdminContainer, phone);

    if (user)
      duplicateFields.push({
        field: "phone",
        message: userMessages.phoneExist,
      });

    if (duplicateFields.length > 0)
      return res
        .status(400)
        .json(
          new responseModel(
            false,
            commonMessages.invalidFields,
            duplicateFields,
          ),
        );

    if (!user || !existingUser) {
      const hashedPassword = await bcrypt.hash(password, 10);

      const newUser = {
        id: uuidv4(), // or UUID
        name,
        email,
        phone,
        verified: false,
        password: hashedPassword,
        createdOn: convertUTCtoIST(new Date().toISOString()),
      };

      user = await setUserInCache(email, roles.StoreAdmin, newUser);
      if (!user.success) {
        return res
          .status(500)
          .json(new responseModel(false, commonMessages.failed));
      }
    }

    const response = await OTPGeneration(email, roles.StoreAdmin);

    if (!response.success)
      return res.status(500).json(new responseModel(false, response.message));

    return res.status(200).json(new responseModel(true, userMessages.success));
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(500).json(new responseModel(false, error.message));
  }
});

router.post("/login", async (req, res) => {
  try {
    const result = await createDynamicSchema(adminSchema, req.body);

    if (!result.success) return res.status(400).json(result);

    const { email, password } = req.body;

    const existingUser = await getDetailsByEmail(storeAdminContainer, email);

    if (!existingUser) {
      return res
        .status(400)
        .json(new responseModel(false, userMessages.notfound));
    }

    const isMatch = await bcrypt.compare(password, existingUser.password);

    if (!isMatch)
      return res
        .status(400)
        .json(new responseModel(false, userMessages.invalidCredientials));

    const response = await OTPGeneration(email, roles.StoreAdmin);

    if (!response.success) return res.status(500).json(response);

    return res.status(200).json(new responseModel(true, userMessages.loggedIn));
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(500).json(new responseModel(false, commonMessages.error));
  }
});

router.post("/update", authenticateToken, async (req, res) => {
  try {
    const result = await createDynamicSchema(adminSchema, req.body);

    if (!result.success) return res.status(400).json(result);

    const id = req.user.id;

    const { name, phone } = req.body;

    const existingUser = await getDetailsById(storeAdminContainer, id);

    if (!existingUser)
      return res
        .status(404)
        .json(new responseModel(false, userMessages.notfound));

    const duplicateRecords = await getUsers(storeAdminContainer, phone);

    if (
      duplicateRecords &&
      duplicateRecords.some((user) => user.phone === phone && user.id !== id)
    )
      return res.status(409).json(
        new responseModel(false, commonMessages.invalidFields, {
          field: "phone",
          message: userMessages.phoneExist,
        }),
      );

    const updatedUser = {
      ...existingUser,
      name: name || existingUser.name,
      phone: phone || existingUser.phone,
    };

    await updateRecord(storeAdminContainer, updatedUser);

    return res.status(200).json(new responseModel(true, userMessages.updated));
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(500).json(new responseModel(false, error.message));
  }
});

router.get(
  "/getDriversByStoreId/:storeId",
  authenticateToken,
  async (req, res) => {
    try {
      const storeId = req.params.storeId;
      if (!storeId)
        return res
          .status(400)
          .json(new responseModel(false, commonMessages.badRequest));

      const drivers = await getUsersByStoreId(roles.Driver, storeId);

      if (!drivers || drivers.length === 0)
        return res
          .status(404)
          .json(new responseModel(false, "No drivers found for this Store Id"));

      return res
        .status(200)
        .json(new responseModel(true, "Driver fetch successful", drivers));
    } catch (error) {
      logger.error(commonMessages.errorOccured, error);
      return res.status(500).json(new responseModel(false, error.message));
    }
  },
);

router.get("/statistics", authenticateToken, async (req, res) => {
  try {
    const storeAdminId = req.user.id;
    const analystics = await getAnalysticsByStoreAdmin(storeAdminId);
    return res
      .status(200)
      .json(new responseModel(true, commonMessages.success, analystics));
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(500).json(new responseModel(false, error.message));
  }
});

module.exports = router;
