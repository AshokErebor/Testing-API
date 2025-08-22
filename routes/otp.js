const express = require("express");
const router = express.Router();
const {
  getContainer,
  createRecord,
  getDetailsByEmail,
  getUserDetails,
} = require("../services/cosmosService");
const {
  VerifyOtp,
  generateToken,
  OTPGeneration,
} = require("../services/otpService");
const responseModel = require("../models/ResponseModel");
const { userMessages, commonMessages, roles } = require("../constants");
const { getUserCache, deleteCache } = require("../services/userService");
const { logger } = require("../jobLogger");

router.post("/verifyUser", async (req, res) => {
  try {
    const { user, role, otp } = req.body;

    if (!user || !role || !otp)
      return res
        .status(400)
        .json(new responseModel(false, commonMessages.badRequest));

    const otpVerified = await VerifyOtp(user, role, otp);
    if (!otpVerified.success) {
      return res.status(500).json(otpVerified);
    }
    let userData = null;
    const container = getContainer(role);
    switch (role) {
      case roles.Customer:
      case roles.Driver:
        userData = await getUserDetails(container, user);
        break;
      case roles.SystemAdmin:
      case roles.StoreAdmin:
      case roles.StoreManager:
        userData = await getDetailsByEmail(container, user);
        break;
      default:
        return null;
    }
    if (!userData) {
      const userCache = await getUserCache(user, role);
      if (!userCache.success) {
        return res
          .status(404)
          .json(new responseModel(false, userMessages.notfound));
      }
      userCache.data.verified = true;
      userData = await createRecord(container, userCache.data);
    }
    if (!userData) {
      return res
        .status(500)
        .json(new responseModel(false, commonMessages.failed));
    }
    deleteCache(`${role}:${user}`);
    const token = await generateToken(userData);
    return res
      .status(200)
      .json(new responseModel(true, userMessages.success, { token, userData }));
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(500).json(new responseModel(false, commonMessages.error));
  }
});

router.post("/sendOtp", async (req, res) => {
  try {
    const { user, role } = req.body;

    if (!user || !role)
      return res
        .status(400)
        .json(new responseModel(false, commonMessages.badRequest));
    const container = await getContainer(role);
    const existingUser = await getDetailsByEmail(container, user);

    if (!existingUser) {
      return res
        .status(404)
        .json(new responseModel(false, userMessages.notfound));
    }
    const response = await OTPGeneration(user, role);

    if (!response.success)
      return res.status(500).json(new responseModel(false, response.message));

    return res.status(200).json(new responseModel(true, response.message));
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(500).json(new responseModel(false, error.message));
  }
});

module.exports = router;
