const express = require("express");
const router = express.Router();
const responseModel = require("../models/ResponseModel");
const { authenticateToken } = require("../middleware/auth");
const { v4: uuidv4 } = require("uuid");
const bcrypt = require("bcrypt");
const {
  getContainer,
  getDetailsByEmail,
  updateRecord,
  deleteRecord,
  getDataByQuery,
  getDetailsById,
} = require("../services/cosmosService");
const { OTPGeneration } = require("../services/otpService");
const { createReOrder } = require("../services/orderService");
const {
  ContainerIds,
  roles,
  commonMessages,
  userMessages,
  orderMessages,
} = require("../constants");
const { setUserInCache } = require("../services/userService");
const storeManagerContainer = getContainer(ContainerIds.StoreManager);
const orderContainer = getContainer(ContainerIds.Order);
const { logger } = require("../jobLogger");
const { convertUTCtoIST } = require("../utils/schedules");

router.post("/signup", async (req, res) => {
  try {
    const { name = "", email, phone = "", password, storeAdmin } = req.body;

    let user = await getDetailsByEmail(storeManagerContainer, email);

    if (!user) {
      const hashedPassword = await bcrypt.hash(password, 10);

      const newUser = {
        id: uuidv4(),
        name,
        email,
        phone,
        storeAdmin,
        password: hashedPassword,
        createdOn: convertUTCtoIST(new Date().toISOString()),
      };

      user = await setUserInCache(email, roles.StoreManager, newUser);
      if (!user.success) {
        return res
          .status(500)
          .json(new responseModel(false, commonMessages.failed));
      }
    }

    const response = await OTPGeneration(email, roles.StoreManager);

    if (!response.success) {
      return res.status(500).json(new responseModel(false, response.message));
    }
    return res.status(200).json(new responseModel(true, userMessages.success));
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(500).json(new responseModel(false, commonMessages.error));
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const existingUser = await getDetailsByEmail(storeManagerContainer, email);
    if (!existingUser) {
      return res
        .status(400)
        .json(new responseModel(false, userMessages.notfound));
    }

    const isMatch = await bcrypt.compare(password, existingUser.password);

    if (!isMatch) {
      return res
        .status(400)
        .json(new responseModel(false, commonMessages.badRequest));
    }

    const response = await OTPGeneration(email, roles.StoreManager);
    if (!response.success) {
      return res.status(500).json(new responseModel(false, response.message));
    }
    return res.status(200).json(new responseModel(true, userMessages.loggedIn));
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(500).json(new responseModel(false, error.message));
  }
});

router.put("/update", authenticateToken, async (req, res) => {
  const { name, email, phone, password, storeAdmin } = req.body;

  try {
    const existingUser = await getDetailsByEmail(storeManagerContainer, email);
    if (!existingUser) {
      return res
        .status(404)
        .json(new responseModel(false, userMessages.notfound));
    }
    const hashedPassword = password
      ? await bcrypt.hash(password, 10)
      : existingUser.password;

    const updatedUser = {
      ...existingUser,
      name: name || existingUser.name,
      phone: phone || existingUser.phone,
      password: hashedPassword,
      storeAdmin: storeAdmin || existingUser.storeAdmin,
    };

    const resource = await updateRecord(storeManagerContainer, updatedUser);

    return res
      .status(200)
      .json(new responseModel(true, userMessages.updated, resource));
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(500).json(new responseModel(false, error.message));
  }
});

router.delete("/delete/:email", authenticateToken, async (req, res) => {
  try {
    const email = req.params.email;
    const existingUser = await getDetailsByEmail(storeManagerContainer, email);
    if (!existingUser) {
      return res
        .status(404)
        .json(new responseModel(false, userMessages.notfound));
    }
    const response = await deleteRecord(storeManagerContainer, existingUser.id);
    if (!response) {
      return res
        .status(400)
        .json(new responseModel(false, commonMessages.failed, email));
    }
    return res.status(200).json(new responseModel(true, userMessages.success));
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(500).json(new responseModel(false, error.message));
  }
});

router.get("/details/:email", authenticateToken, async (req, res) => {
  try {
    const email = req.params.email;
    if (!email) {
      return res
        .status(404)
        .json(new responseModel(false, commonMessages.badRequest));
    }

    const userDetails = await getDetailsByEmail(storeManagerContainer, email);

    if (!userDetails) {
      return res
        .status(404)
        .json(new responseModel(false, userMessages.notfound));
    }
    return res
      .status(200)
      .json(new responseModel(true, userMessages.notfound, userDetails));
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(500).json(new responseModel(false, error.message));
  }
});

router.get("/getReturnOrders/:storeId", authenticateToken, async (req, res) => {
  const storeId = req.params.storeId;
  try {
    const orderContainer = getContainer(ContainerIds.Order);
    const querySpec = {
      query:
        "SELECT * FROM c WHERE c.storeId = @storeId AND c.returnCause['isApproved'] = false",
      parameters: [{ name: "@storeId", value: storeId }],
    };

    const resources = await getDataByQuery(orderContainer, querySpec);

    if (!resources) {
      res.status(404).json(new responseModel(false, orderMessages.notFound));
    } else {
      res
        .status(200)
        .json(new responseModel(true, orderMessages.success, resources));
    }
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    res.status(500).json(new responseModel(false, commonMessages.error));
  }
});

router.post("/approveOrder/:orderId", authenticateToken, async (req, res) => {
  const orderId = req.params.orderId;
  const { isApproved, acceptCause, storeManager } = req.body;
  try {
    const { resource: order } = await getDetailsById(orderContainer, orderId);

    if (!order) {
      res
        .status(400)
        .json(new responseModel(false, orderMessages.orderNotfound));
    }

    order.returnCause.isApproved = isApproved;
    order.returnCause.storeManager = storeManager;

    if (isApproved) {
      order.acceptCause = acceptCause;
    } else {
      res
        .status(400)
        .json(new responseModel(false, orderMessages.returnDenial));
    }

    const updatedOrder = await updateRecord(orderContainer, order.id);

    if (updatedOrder.orderReattempt) {
      const response = await createReOrder(order);
      res.status(200).json(response);
    } else {
      res.status(200).json(new responseModel(true, orderMessages.returnAccept));
    }
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    res.status(500).json(new responseModel(false, error.message));
  }
});

module.exports = router;
