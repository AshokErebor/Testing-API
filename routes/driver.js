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
const {
  ContainerIds,
  roles,
  userMessages,
  commonMessages,
} = require("../constants");
const { OTPGeneration } = require("../services/otpService");
const { setUserInCache } = require("../services/userService");
const responseModel = require("../models/ResponseModel");
const driverContainer = getContainer(ContainerIds.Driver);
const { driverSchema, createDynamicSchema } = require("../models/userSchemas");
const { convertUTCtoIST } = require("../utils/schedules");

router.post("/signup", async (req, res) => {
  try {
    const result = driverSchema.safeParse(req.body); // Compare with req.body

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
      storeId = "",
      drivingLicense = {},
      vehicleRC = {},
      workingDays = [],
      workingTimings = [],
      isAuthorized = "Pending",
    } = req.body;

    let user = await getUserDetails(driverContainer, phone);

    if (!user) {
      const newUser = {
        id: uuidv4(), // or UUID
        phone,
        name,
        email,
        profilePicture,
        storeId,
        drivingLicense,
        vehicleRC,
        workingDays,
        workingTimings,
        status: false,
        verified: false,
        feedBack: "",
        isAuthorized,
        createdOn: convertUTCtoIST(new Date().toISOString()),
      };

      user = await setUserInCache(phone, roles.Driver, newUser);
      if (!user.success) {
        return res
          .status(500)
          .json(new responseModel(false, commonMessages.failed));
      }
      var userMessage = userMessages.success;
    } else {
      userMessage = userMessages.exist;
    }

    const response = await OTPGeneration(phone, roles.Driver);
    if (!response.success) {
      return response;
    }

    return res.status(200).json(new responseModel(true, userMessage));
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(500).json(new responseModel(false, error.message));
  }
});

router.post("/update", authenticateToken, async (req, res) => {
  try {
    const phone = req.user.phone;

    const result = createDynamicSchema(driverSchema, req.body);

    if (!result.success) return res.status(400).json(result);

    if (!phone)
      return res.status(400).json(
        new responseModel(false, commonMessages.badRequest, {
          field: "phone",
          message: commonMessages.badRequest,
        }),
      );

    if (
      ("storeId" in req.body && req.body.storeId === "") ||
      ("drivingLicense" in req.body && req.body.drivingLicense?.id === "") ||
      ("vehicleRC" in req.body && req.body.vehicleRC?.id === "")
    )
      return res
        .status(400)
        .json(new responseModel(false, commonMessages.badRequest));

    const existingUser = await getUserDetails(driverContainer, phone);

    if (!existingUser)
      return res
        .status(404)
        .json(new responseModel(false, userMessages.notfound));

    let duplicateFields = [];

    const existingUsers = await getUsers(
      driverContainer,
      "",
      req.body?.email,
      req.body?.drivingLicense?.Id,
      req.body?.vehicleRC?.Id,
    );

    if (existingUsers.length > 0) {
      if (
        req.body?.email !== undefined &&
        existingUsers.some(
          (user) =>
            user.email === req.body.email && user.id !== existingUser.id,
        )
      )
        duplicateFields.push({
          field: "email",
          message: userMessages.emailExist,
        });

      if (
        req.body?.drivingLicense?.id !== undefined &&
        existingUsers.some(
          (user) =>
            user.drivingLicense?.id === req.body?.drivingLicense?.id &&
            user.id !== existingUser.id,
        )
      )
        duplicateFields.push({
          field: "drivingLicense",
          message: userMessages.drivingLicenseExist,
        });

      if (
        req.body?.vehicleRC?.id !== undefined &&
        existingUsers.some(
          (user) =>
            user.vehicleRC?.id === req.body?.vehicleRC?.id &&
            user.id !== existingUser.id,
        )
      )
        duplicateFields.push({
          field: "vehicleRC",
          message: userMessages.vehicleRCExist,
        });
    }

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

    Object.keys(req.body).forEach((key) => {
      if (
        !["id", "phone", "isAuthorized", "feedBack", "createdOn"].includes(key)
      ) {
        existingUser[key] = req.body[key];
      }
    });

    const updatedDriver = await updateRecord(driverContainer, existingUser);
    if (!updatedDriver) {
      return res
        .status(500)
        .json(new responseModel(false, commonMessages.failed));
    }

    return res.status(200).json(new responseModel(true, userMessages.updated));
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(500).json(new responseModel(false, error.message));
  }
});

module.exports = router;
