const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../middleware/auth");
const responseModel = require("../models/ResponseModel");
const {
  getContainer,
  getDetailsByEmail,
  getUsersByRole,
  getDetailsById,
  getUserDetails,
  getDataByQuery,
  updateRecord,
} = require("../services/cosmosService");
const bcrypt = require("bcrypt");
const { commonMessages, userMessages } = require("../constants");
const { logger } = require("../jobLogger");

router.get("/getUserDetails/:role", authenticateToken, async (req, res) => {
  try {
    const id = req.user.id;

    if (!id)
      return res
        .status(400)
        .json(new responseModel(false, commonMessages.badRequest));

    const { role } = req.params;
    const container = getContainer(role);
    const userDetails = await getDetailsById(container, id);
    return res
      .status(200)
      .json(new responseModel(true, userMessages.fetched, userDetails));
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(500).json(new responseModel(false, error.message));
  }
});

router.get("/getUsers/:role", authenticateToken, async (req, res) => {
  try {
    const { role } = req.params;
    const userDetails = await getUsersByRole(role);
    return res
      .status(200)
      .json(new responseModel(true, commonMessages.success, userDetails));
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(500).json(new responseModel(false, error.message));
  }
});

router.post("/resetPassword", async (req, res) => {
  try {
    const { email, role, oldPassword, newPassword } = req.body;
    const container = await getContainer(role);
    const existingUser = await getDetailsByEmail(container, email);
    if (!existingUser)
      return res
        .status(404)
        .json(new responseModel(false, userMessages.notfound));

    const isMatch = await bcrypt.compare(oldPassword, existingUser.password);
    if (!isMatch)
      return res
        .status(401)
        .json(new responseModel(false, userMessages.invalidCredientials));

    const updatedUser = {
      ...existingUser,
      password: await bcrypt.hash(newPassword, 10),
    };

    const updatedData = await updateRecord(container, updatedUser);

    if (updatedData == null)
      return res
        .status(500)
        .json(new responseModel(false, commonMessages.failed));

    return res
      .status(200)
      .json(new responseModel(true, userMessages.passwordUpdated));
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(500).json(new responseModel(false, error.message));
  }
});

router.post("/forgotPassword", async (req, res) => {
  try {
    const { email, role, newPassword } = req.body;

    if (!email || !role || !newPassword) {
      return res
        .status(400)
        .json(new responseModel(false, commonMessages.badRequest));
    }

    const container = await getContainer(role);
    const user = await getDetailsByEmail(container, email);

    if (!user) {
      return res
        .status(404)
        .json(new responseModel(false, userMessages.notfound));
    }

    // Hash and update the password
    user.password = await bcrypt.hash(newPassword, 10);

    const updatedUser = await updateRecord(container, user);

    if (!updatedUser) {
      return res
        .status(500)
        .json(new responseModel(false, commonMessages.failed));
    }

    return res
      .status(200)
      .json(new responseModel(true, userMessages.passwordUpdated));
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(500).json(new responseModel(false, error.message));
  }
});

router.post("/verifydetails", async (req, res) => {
  try {
    const {
      role,
      email = "",
      phone = "",
      drivingLicense = "",
      vehicleRC = "",
    } = req.body;

    const container = await getContainer(role);
    const existingUser = await getUserDetails(
      container,
      phone,
      email,
      drivingLicense,
      vehicleRC,
    );

    if (existingUser) {
      return res.status(200).json(new responseModel(true, userMessages.exist));
    } else {
      return res
        .status(404)
        .json(new responseModel(false, userMessages.notfound));
    }
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(500).json(new responseModel(false, error.message));
  }
});

router.get("/countbyUser/:role", authenticateToken, async (req, res) => {
  try {
    const role = req.params.role;
    if (!role) {
      return res
        .status(400)
        .json(new responseModel(false, commonMessages.badRequest));
    }
    const container = getContainer(role);
    const querySpec = {
      query: "SELECT VALUE COUNT(1) FROM c",
    };
    const count = await getDataByQuery(container, querySpec);
    if (count !== null && !isNaN(count[0])) {
      return res
        .status(200)
        .json(new responseModel(true, commonMessages.success, count[0]));
    }
  } catch (error) {
    console.error(error.message);
    return res.status(500).json(new responseModel(false, commonMessages.error));
  }
});

module.exports = router;
