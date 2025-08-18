const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../middleware/auth");
const { v4: uuidv4 } = require("uuid");
const { adminSchema } = require("../models/storeSchemas");
const { createDynamicSchema } = require("../models/userSchemas");
const {
  getContainer,
  getDetailsByEmail,
  getDetailsById,
  getUsers,
  updateRecord,
} = require("../services/cosmosService");
const {
  ContainerIds,
  roles,
  userMessages,
  commonMessages,
} = require("../constants");
const { OTPGeneration } = require("../services/otpService");
const { logger } = require("../jobLogger");
const bcrypt = require("bcrypt");
const responseModel = require("../models/ResponseModel");
const { setUserInCache } = require("../services/userService");
const { convertUTCtoIST } = require("../utils/schedules");
const systemAdminContainer = getContainer(ContainerIds.SystemAdmin);

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

    let user = await getDetailsByEmail(systemAdminContainer, email);

    if (!user) {
      const hashedPassword = await bcrypt.hash(password, 10);
      const newUser = {
        id: uuidv4(),
        name,
        email,
        phone,
        verified: false,
        password: hashedPassword,
        createdOn: convertUTCtoIST(new Date().toISOString()),
      };

      user = await setUserInCache(email, roles.SystemAdmin, newUser);
      if (!user.success) {
        return res
          .status(500)
          .json(new responseModel(false, commonMessages.failed));
      }
      var message = userMessages.success;
    } else {
      message = userMessages.exist;
    }

    const response = await OTPGeneration(email, roles.SystemAdmin);

    if (response.success) {
      return res.status(200).json(new responseModel(true, message));
    } else {
      return res.status(500).json(response);
    }
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
    const existingUser = await getDetailsByEmail(systemAdminContainer, email);
    if (!existingUser) {
      return res
        .status(400)
        .json(new responseModel(false, userMessages.notfound));
    }

    const isMatch = await bcrypt.compare(password, existingUser.password);
    if (!isMatch) {
      return res
        .status(400)
        .json(new responseModel(false, userMessages.invalidCredientials));
    }

    const response = await OTPGeneration(email, roles.SystemAdmin);

    if (response.success) {
      return res
        .status(200)
        .json(new responseModel(true, response.message, existingUser));
    } else {
      return res.status(500).json(response);
    }
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(500).json(new responseModel(false, error.message));
  }
});

router.post("/update", authenticateToken, async (req, res) => {
  try {
    const result = await createDynamicSchema(adminSchema, req.body);

    if (!result.success) return res.status(400).json(result);

    const id = req.user.id;

    const { name, phone } = req.body;

    const duplicateRecords = await getUsers(systemAdminContainer, phone);

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

    const existingUser = await getDetailsById(systemAdminContainer, id);

    if (!existingUser)
      return res
        .status(404)
        .json(new responseModel(false, userMessages.notfound));

    const updatedUser = {
      ...existingUser,
      name: name || existingUser.name,
      phone: phone || existingUser.phone,
    };

    await updateRecord(systemAdminContainer, updatedUser);

    return res.status(200).json(new responseModel(true, userMessages.updated));
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(500).json(new responseModel(false, error.message));
  }
});

router.post("/signupRequestApproval", authenticateToken, async (req, res) => {
  try {
    const { id, isAuthorized, role, feedBack = "" } = req.body;

    const container = await getContainer(role);

    if (!id && !isAuthorized) {
      return res
        .status(400)
        .json(new responseModel(false, commonMessages.badRequest));
    }

    const details = await getDetailsById(container, id);
    details.isAuthorized = isAuthorized;
    details.feedBack = feedBack;
    const { response: updateDetails } = await container
      .item(details.id, details.id)
      .replace(details);

    return res
      .status(200)
      .json(new responseModel(true, userMessages.updated, updateDetails));
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(500).json(new responseModel(false, error.message));
  }
});

module.exports = router;
