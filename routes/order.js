const express = require("express");
const QRCode = require("qrcode");
const path = require("path");
const fs = require("fs");
const { authenticateToken, isAuthorizedUser } = require("../middleware/auth");
const {
  createOrder,
  findOrderByUser,
  findOrder,
  createSubscription,
} = require("../services/orderService");
const {
  getContainer,
  getDetailsById,
  updateRecord,
  getDataByQuery,
} = require("../services/cosmosService");
const responseModel = require("../models/ResponseModel");
const {
  ContainerIds,
  commonMessages,
  orderMessages,
  roles,
} = require("../constants");
const { getNearestStore, getCurentArea } = require("../services/mapService");
const { logger } = require("../jobLogger");
const { convertUTCtoIST } = require("../utils/schedules");

const router = express.Router();
const orderContainer = getContainer(ContainerIds.Order);
const customerContainer = getContainer(ContainerIds.Customers);

router.post("/createOrder", authenticateToken, async (req, res) => {
  try {
    const { id: userId, phone } = req.user;
    const {
      customerAddress,
      scheduledDelivery,
      couponCode = "",
      isSubscription,
      weeksCount,
    } = req.body;
    if (!customerAddress)
      return res
        .status(400)
        .json(new responseModel(false, commonMessages.badRequest));
    let scheduledDate = "";
    if (scheduledDelivery) {
      scheduledDate = convertUTCtoIST(scheduledDelivery);
      if (scheduledDate < new Date().toISOString()) {
        return res
          .status(400)
          .json(new responseModel(false, orderMessages.scheduleMessage));
      }
    }
    const customerDetails = await getDetailsById(customerContainer, userId);
    let address = customerDetails.addresses.find(
      (addr) => addr.origin === customerAddress,
    );
    if (!address) {
      address = await getCurentArea(customerAddress);
    }
    const storeDetails = await getNearestStore(customerAddress);
    if (isSubscription) {
      if (!weeksCount || !scheduledDelivery)
        return res
          .status(400)
          .json(new responseModel(false, commonMessages.badRequest));

      const response = await createSubscription(
        customerDetails,
        storeDetails,
        weeksCount,
        scheduledDate,
        userId,
        phone,
        couponCode,
        address,
      );

      if (response.error)
        return res.status(400).json(new responseModel(false, response));
      return res.status(200).json(response);
    }
    const orderDetails = {
      userId,
      phone,
      customerDetails: {
        customerId: userId,
        address,
        Name: customerDetails.name,
        phone,
      },
      storeDetails: storeDetails,
      subscriptionId: "",
      scheduledDelivery: scheduledDate,
      orderType: orderMessages.types.quick,
      couponCode,
      storeAdminId: storeDetails?.storeAdminId || "",
      createdOn: convertUTCtoIST(new Date().toISOString()),
    };

    const result = await createOrder(orderDetails);
    if (result.error)
      return res.status(400).json(new responseModel(false, result));
    return res.status(200).json(result);
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(500).json(new responseModel(false, error.message));
  }
});

router.get("/getOrders/:role", authenticateToken, async (req, res) => {
  try {
    const role = req.params.role;
    let { page, itemsRequest } = req.query;
    const id = req.user.id;
    page = parseInt(page) || 1;
    itemsRequest = parseInt(itemsRequest) || 10;
    const limit = itemsRequest + 1;
    const offset = (page - 1) * itemsRequest;
    if (!id || !role)
      return res
        .status(400)
        .json(new responseModel(false, commonMessages.badRequest));

    const orderDetails = await findOrderByUser(
      orderContainer,
      id,
      role,
      offset,
      limit,
    );
    if (!orderDetails || orderDetails.length === 0)
      return res
        .status(404)
        .json(new responseModel(false, orderMessages.notFound));
    const hasNextPage = itemsRequest < orderDetails.length;
    let requstedOrders = orderDetails
      ? orderDetails.slice(0, itemsRequest)
      : null;
    return res.status(200).json(
      new responseModel(true, orderMessages.success, {
        currentPage: page,
        hasNextPage: hasNextPage,
        orders: requstedOrders,
      }),
    );
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(500).json(new responseModel(false, error.message));
  }
});

router.get("/getOrder/:id", authenticateToken, async (req, res) => {
  try {
    const id = req.params.id;

    if (!id)
      return res
        .status(400)
        .json(new responseModel(false, commonMessages.badRequest));

    const item = await getDetailsById(orderContainer, id);

    if (!item)
      return res
        .status(404)
        .json(new responseModel(false, orderMessages.orderNotfound));

    return res
      .status(200)
      .json(new responseModel(true, orderMessages.detailsSuccess, item));
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(500).json(new responseModel(false, error.message));
  }
});

router.post("/status", authenticateToken, async (req, res) => {
  try {
    const { id, status, driverDetails = {} } = req.body;

    if (!id)
      return res
        .status(400)
        .json(new responseModel(false, commonMessages.badRequest));

    const order = await findOrder(id);

    if (!order)
      return res
        .status(404)
        .json(new responseModel(false, orderMessages.orderNotfound));

    const qrCodePath = driverDetails.driverId
      ? await generateQRCode(driverDetails, id, req)
      : order.qrCodePath;

    const updatedOrder = {
      ...order,
      status: status || order.status,
      driverDetails: {
        driverId: driverDetails.driverId || order.driverDetails?.driverId,
        contactDetails: driverDetails.phone || order.driverDetails?.phone,
        comission: driverDetails.comission || order.driverDetails?.comission,
      },
      qrCodePath,
    };

    const orderUpdated = await updateRecord(orderContainer, updatedOrder);

    return res.status(200).json(
      new responseModel(true, orderMessages.statusUpdated, {
        QRCode: qrCodePath,
        order: orderUpdated,
      }),
    );
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(500).json(new responseModel(false, error.message));
  }
});

router.post("/return/:orderId", authenticateToken, async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const { orderReturn, reorder = false, image, reason, status } = req.body;
    const item = await getDetailsById(orderContainer, orderId);

    if (!item) {
      return res
        .status(404)
        .json(new responseModel(false, orderMessages.orderNotfound));
    }

    item.returnOrder = orderReturn;
    const returnCause = {
      isApproved: false,
      damagedImage: image,
      returnReason: reason,
    };

    item.returnCause = returnCause;
    item.orderReattempt = reorder;
    item.returnOn = convertUTCtoIST(new Date());
    item.status = status;

    const updatedOrder = await updateRecord(orderContainer, item);
    return res
      .status(200)
      .json(new responseModel(true, orderMessages.returnSubmit, updatedOrder));
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(500).json(new responseModel(false, error.message));
  }
});

async function generateQRCode(driverDetails, orderId, req) {
  try {
    const fileName = `qr_${orderId}.png`;
    const qrDir = path.join(__dirname, "..", "uploads", "qrs");
    const filePath = path.join(qrDir, fileName);

    if (!fs.existsSync(qrDir)) {
      fs.mkdirSync(qrDir, { recursive: true });
    }

    await QRCode.toFile(filePath, JSON.stringify(driverDetails));

    return `${req.protocol}://${req.get("host")}/uploads/qrs/${fileName}`;
  } catch (error) {
    logger.error(orderMessages.qrFailed, error);
    throw new Error(orderMessages.qrFailed);
  }
}

router.get("/transactions", authenticateToken, async (req, res) => {
  try {
    const { id } = req.user;

    let { page, itemsRequest } = req.query;
    page = parseInt(page) || 1;
    itemsRequest = parseInt(itemsRequest) || 10;
    const limit = itemsRequest + 1;
    const offset = (page - 1) * itemsRequest;
    const authorized = await isAuthorizedUser(id, [
      roles.StoreAdmin,
      roles.SystemAdmin,
    ]);

    if (!authorized) {
      return res
        .status(403)
        .json(new responseModel(false, commonMessages.unauthorized));
    }

    const querySpec = {
      query: `
        SELECT 
          c.id AS orderId, 
          c.createdOn, 
          c.PaymentDetails,
          c.orderPrice
        FROM c
        WHERE c.storeAdminId = @userId
        ORDER BY c.createdOn DESC
        OFFSET @offset LIMIT @limit
      `,
      parameters: [
        { name: "@userId", value: id },
        { name: "@offset", value: offset },
        { name: "@limit", value: limit },
      ],
    };

    const resources = await getDataByQuery(orderContainer, querySpec);
    const hasNextPage = itemsRequest < resources.length;
    const requestedTransactions = resources
      ? resources.slice(0, itemsRequest)
      : null;

    return res.status(200).json(
      new responseModel(true, commonMessages.success, {
        currentPage: page,
        hasNextPage: hasNextPage,
        transactions: requestedTransactions,
      }),
    );
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(500).json(new responseModel(false, error.message));
  }
});

module.exports = router;
