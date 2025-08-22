const express = require("express");
const router = express.Router();
const {
  getContainer,
  getDetailsById,
  updateRecord,
} = require("../services/cosmosService");
const {
  createOrder,
  getEnrichedProductDetails,
} = require("../services/orderService");
const {
  getSubscriptionOrderByDate,
  getCustomerSubscriptionsList,
  getCustomerSubscriptionOrdersList,
  getNextNDaysSubscriptions,
} = require("../services/subscriptionService");
const {
  ContainerIds,
  commonMessages,
  orderMessages,
  subscriptionMessages,
} = require("../constants");
const { createPayment } = require("../utils/PhonePe");
const subscriptionContainer = getContainer(ContainerIds.Subscriptions);
const orderContainer = getContainer(ContainerIds.Order);
const { authenticateToken } = require("../middleware/auth");
const responseModel = require("../models/ResponseModel");
const { logger } = require("../jobLogger");

router.post("/renewSubscription", authenticateToken, async (req, res) => {
  try {
    const { subscriptionId, weeksCount } = req.body;

    const phone = req.user.phone;
    const userId = req.user.id;

    if (!phone && !userId)
      return res
        .status(400)
        .json(new responseModel(false, commonMessages.badRequest));

    const details = await getDetailsById(subscriptionContainer, subscriptionId);
    if (!details) {
      return res
        .status(500)
        .json(new responseModel(false, subscriptionMessages.notfound));
    }

    let lastDate =
      details.subscriptionOrderDates[details.subscriptionOrderDates.length - 1];

    let date = new Date(lastDate);
    date.setDate(date.getDate() + 1);
    const todayDate = new Date();

    if (date < todayDate) date = todayDate;

    const pendingOrderDates = [];
    const existingDates = new Set(details.pendingOrderDates || []);
    const weeksToAdd = parseInt(weeksCount); // weeksCount coming from request
    // Start from today

    while (pendingOrderDates.length < weeksToAdd) {
      if (date.getDay() === details.day) {
        const newDate = date.toISOString().slice(0, 10);
        if (!existingDates.has(newDate)) {
          pendingOrderDates.push(newDate);
        }
      }
      date.setDate(date.getDate() + 1);
    }

    details.pendingOrderDates = pendingOrderDates;

    details.weeksCount =
      parseInt(details.weeksCount) + pendingOrderDates.length;
    const price = await getEnrichedProductDetails(
      details.products,
      details.storeDetails.id,
    );
    if (!price.subTotal || price.products.length === 0) {
      return res
        .status(500)
        .json(new responseModel(false, "your cart is empty"));
    }
    const paymentUrl = await createPayment(
      price.subTotal * weeksCount,
      details.id,
      "Subscriptions",
    );
    if (!paymentUrl || !paymentUrl.url) {
      return res
        .status(500)
        .json(new responseModel(false, commonMessages.failed));
    }
    const updatedSubscription = await updateRecord(
      subscriptionContainer,
      details,
    );
    if (!updatedSubscription) {
      return res
        .status(500)
        .json(new responseModel(false, commonMessages.failed));
    }

    return res
      .status(200)
      .json(
        new responseModel(true, subscriptionMessages.renewal, paymentUrl.url),
      );
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(500).json(new responseModel(false, error.message));
  }
});

router.post("/rescheduleSubscription", authenticateToken, async (req, res) => {
  try {
    const { subscriptionId, cancelDate } = req.body;

    const phone = req.user.phone;
    const userId = req.user.id;

    if (!phone && !userId)
      return res
        .status(400)
        .json(new responseModel(false, commonMessages.badRequest));

    const details = await getDetailsById(subscriptionContainer, subscriptionId);

    if (
      !details.subscriptionOrderDates.includes(cancelDate) &&
      details.canceledOrderDates.includes(cancelDate)
    )
      return res
        .status(500)
        .json(new responseModel(false, commonMessages.badRequest));

    let newDateTime = new Date(
      details.subscriptionOrderDates[details.subscriptionOrderDates.length - 1],
    );

    newDateTime.setDate(newDateTime.getDate() + 7);

    var newDate = newDateTime.toISOString().slice(0, 10);

    details.subscriptionOrderDates = details.subscriptionOrderDates.filter(
      (d) => d !== cancelDate,
    );

    details.canceledOrderDates.push(cancelDate);

    details.subscriptionOrderDates.push(newDate);

    const updatedSubscription = await updateRecord(
      subscriptionContainer,
      details,
    );
    if (!updatedSubscription) {
      return res
        .status(500)
        .json(new responseModel(false, commonMessages.failed));
    }

    var orderDetails = await getSubscriptionOrderByDate(
      orderContainer,
      subscriptionId,
      cancelDate,
    );

    orderDetails.status = orderMessages.types.cancelled;

    const updatedOrder = await updateRecord(orderContainer, orderDetails);
    if (!updatedOrder) {
      return res
        .status(500)
        .json(new responseModel(false, orderMessages.updateFailed));
    }

    var newOrder = {
      userId,
      phone,
      customerAddress: details.customerAddress,
      storeId: details.storeId,
      subscriptionId: details.id,
      deliveryCharges: 0,
      packagingCharges: 0,
      platformCharges: 0,
      scheduledDelivery: {
        deliveryDate: newDate,
        deliveryTime: details.deliveryTime,
      },
      orderType: orderMessages.types.subscription,
    };

    await createOrder(newOrder);

    return res
      .status(200)
      .json(new responseModel(true, subscriptionMessages.rescheduled));
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(500).json(new responseModel(false, error.message));
  }
});

router.get("/getCustomerSubscriptions", authenticateToken, async (req, res) => {
  try {
    const phone = req.user.phone;

    const subscriptionContainer = await getContainer(
      ContainerIds.Subscriptions,
    );
    const result = await getCustomerSubscriptionsList(
      subscriptionContainer,
      phone,
    );
    const today = new Date().toISOString().slice(0, 10);

    const updatedResult = result.map((subscription) => {
      let subscriptionStatus = "inactive";

      if (subscription.subscriptionDates?.length > 0) {
        const lastDate =
          subscription.subscriptionDates[
            subscription.subscriptionDates.length - 1
          ];

        if (lastDate.slice(0, 10) <= today) {
          subscriptionStatus = "active";
        }
      }
      return {
        ...subscription,
        subscriptionStatus,
      };
    });

    return res
      .status(200)
      .json(
        new responseModel(true, subscriptionMessages.fetched, updatedResult),
      );
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(500).json(new responseModel(false, error.message));
  }
});

router.get(
  "/getCustomerOrdersBySubscriptionId/:subscriptionId",
  authenticateToken,
  async (req, res) => {
    try {
      const subscriptionId = req.params.subscriptionId;

      const userId = req.user.id;

      const result = await getCustomerSubscriptionOrdersList(
        orderContainer,
        subscriptionId,
        userId,
      );

      return res
        .status(200)
        .json(new responseModel(true, subscriptionMessages.order, result));
    } catch (error) {
      logger.error(commonMessages.errorOccured, error);
      return res.status(500).json(new responseModel(false, error.message));
    }
  },
);

router.get(
  "/getNextNDaysSubscriptions",
  authenticateToken,
  async (req, res) => {
    try {
      const { storeId, days = 7 } = req.body;

      const result = await getNextNDaysSubscriptions(
        orderContainer,
        storeId,
        days,
      );

      return res
        .status(200)
        .json(new responseModel(true, subscriptionMessages.fetched, result));
    } catch (error) {
      logger.error(commonMessages.errorOccured, error);
      return res.status(500).json(new responseModel(false, error.message));
    }
  },
);

module.exports = router;
