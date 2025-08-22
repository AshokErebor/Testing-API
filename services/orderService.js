const {
  getContainer,
  getDetailsById,
  getDataByQuery,
  createRecord,
  getUserDetails,
  parseCreatedOn,
} = require("../services/cosmosService");
const {
  applyCouponAndUpdate,
  processCoupon,
} = require("../services/couponService");
const responseModel = require("../models/ResponseModel");
const { getUsersByStoreId } = require("../services/storeService");
const {
  ContainerIds,
  commonMessages,
  orderMessages,
  roles,
  subscriptionMessages,
  orderCategoriesMap,
} = require("../constants");
const { logger } = require("../jobLogger");
const { v4: uuidv4 } = require("uuid");
const dayjs = require("dayjs");
const subscriptionContainer = getContainer(ContainerIds.Subscriptions);

async function findOrderByUser(container, id, role, offset, limit) {
  try {
    let userId;

    switch (role) {
      case roles.Customer:
        userId = "c.customerDetails.customerId";
        break;
      case roles.StoreManager:
        userId = "c.storeDetails.id";
        break;
      case roles.Driver:
        userId = "c.driverDetails.driverId";
        break;
      case roles.StoreAdmin:
        userId = "c.storeAdminId";
        break;

      default:
        return [];
    }
    const querySpec = {
      query: `SELECT * FROM c WHERE ${userId} = @id ORDER BY c.createdOn DESC OFFSET @offset LIMIT @limit`,
      parameters: [
        { name: "@id", value: id },
        { name: "@offset", value: offset },
        { name: "@limit", value: limit },
      ],
    };

    const resources = await getDataByQuery(container, querySpec);
    return resources;
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return [];
  }
}

const findOrder = async (orderId) => {
  try {
    const container = getContainer(ContainerIds.Order);
    const order = await getDetailsById(container, orderId);
    if (!order) {
      return null;
    }
    return order || null;
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return null;
  }
};

async function createOrder(orderDetails) {
  const { createPayment } = require("../utils/PhonePe");
  try {
    const orderContainer = getContainer(ContainerIds.Order);
    if (orderDetails.orderType == orderCategoriesMap.subscriptions) {
      await orderContainer.items.create(orderDetails);
      return new responseModel(true, orderMessages.success, {
        orderId: newOrder.id,
      });
    }

    let discountPrice = { discount: 0 };
    let orderType = orderDetails.orderType;

    if (orderDetails.scheduledDelivery) {
      orderType =
        orderDetails.orderType == orderMessages.types.subscription
          ? orderMessages.types.subscription
          : orderCategoriesMap.scheduled;
    }

    let productDetails = await getProductDetails(
      orderDetails.phone,
      orderDetails.storeDetails.id,
    );

    if (productDetails.products.length === 0)
      return new responseModel(false, orderMessages.outofstock);

    var isOutofStock = productDetails.products.some(
      (p) => p.outOfStock === true,
    );

    if (isOutofStock) return new responseModel(false, orderMessages.outofstock);

    const newOrderId = await getNextOrderId();
    if (!newOrderId) {
      return new responseModel(false, orderMessages.qrFailed);
    }

    if (
      orderDetails.productDetails &&
      Array.isArray(orderDetails.productDetails) &&
      orderDetails.productDetails.length > 0
    ) {
      productDetails.products = orderDetails.productDetails;
      productDetails.subTotal = await calculateTotalPrice(
        productDetails.products,
      );
    }

    if (orderDetails.couponCode != "") {
      discountPrice = await processCoupon(
        orderDetails.couponCode,
        orderDetails.userId,
        productDetails.subTotal,
      );

      if (!discountPrice.success)
        return new responseModel(false, discountPrice.message);
    }

    var deliveryCharges = orderDetails.storeDetails?.deliveryCharges || 0;
    var packagingCharges = orderDetails.storeDetails?.packagingCharges || 0;
    var platformCharges = orderDetails.storeDetails?.platformCharges || 0;
    const price =
      productDetails.subTotal +
      deliveryCharges +
      packagingCharges +
      platformCharges -
      discountPrice.discount;

    const newOrder = {
      id: `${orderType[0]}${newOrderId}`,
      customerDetails: orderDetails.customerDetails,
      productDetails: productDetails.products,
      storeDetails: {
        id: orderDetails.storeDetails.id,
        storeName: orderDetails.storeDetails.storeName,
        phone: orderDetails.storeDetails.phone,
        address: orderDetails.storeAddress,
      },
      subscriptionId: orderDetails.subscriptionId,
      scheduledDelivery: orderDetails.scheduledDelivery,
      status: "New",
      priceDetails: {
        subTotal: productDetails.subTotal,
        deliveryCharges,
        packagingCharges,
        platformCharges,
        discountPrice: discountPrice.discount,
        totalPrice: price,
      },
      couponCode: orderDetails.couponCode,
      orderType,
      createdOn: orderDetails.createdOn,
      PaymentDetails: {
        paymentStatus: orderMessages.types.pending,
        paymentDetails: [],
      },
      storeAdminId: orderDetails.storeDetails.storeAdminId || "",
    };

    const paymentUrl = await createPayment(
      price,
      newOrder.id,
      newOrder.orderType,
    );
    if (!paymentUrl.success) {
      return new responseModel(false, orderMessages.urlFailed);
    }
    await createRecord(orderContainer, newOrder);
    await applyCouponAndUpdate(
      discountPrice,
      orderDetails.customerDetails.customerId,
    );
    return new responseModel(true, orderMessages.orderCreate, {
      orderId: newOrder.id,
      paymentUrl: paymentUrl.response,
    });
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return new responseModel(false, `Failed to create order: ${error.message}`);
  }
}

async function getNextOrderId() {
  try {
    const container = getContainer(ContainerIds.Order);
    const counterId = "Orders";
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const { resource: counterDoc } = await container
      .item(counterId, counterId)
      .read();

    let nextId;
    if (!counterDoc) {
      nextId = 1;
      const newCounter = {
        id: counterId,
        type: "counter",
        date: today,
        value: nextId,
      };
      await container.items.create(newCounter);
    } else {
      if (counterDoc.date === today) {
        nextId = counterDoc.value + 1;
      } else {
        nextId = 1;
        counterDoc.date = today;
      }
      counterDoc.value = nextId;
      await container.item(counterId, counterId).replace(counterDoc);
    }
    const orderId = `${today}ORD${nextId}`;
    return orderId;
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return null;
  }
}

async function getProductDetails(phone, storeId) {
  try {
    const cartContainer = getContainer(ContainerIds.CartItems);
    const { products = [] } = await getUserDetails(cartContainer, phone);

    return await getEnrichedProductDetails(products, storeId);
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
  }
}

async function getEnrichedProductDetails(products, storeId) {
  try {
    let subTotal = 0;

    if (!products.length) return { products: [], subTotal };

    const storeDetails = await getUsersByStoreId(
      ContainerIds.StoreProduct,
      storeId,
    );
    const storeProducts = storeDetails[0]?.products || [];

    if (!storeProducts.length) return { products: [], subTotal };

    const itemTotals = await Promise.all(
      products.map(async (item) => {
        const storeProductDetails = storeProducts.find(
          (p) => p.productId === item.productId,
        );
        const storeVariantDetails = storeProductDetails?.variants?.find(
          (v) => v.variantId === item.variantId,
        );

        const productsContainer = getContainer(ContainerIds.Products);
        const productDetails = await getDetailsById(
          productsContainer,
          item.productId,
        );
        const variantDetails = productDetails?.variants?.find(
          (v) => v.id === item.variantId,
        );

        if (!storeVariantDetails || !variantDetails) return 0;

        let price =
          parseFloat(storeVariantDetails.offerPrice) > 0
            ? parseFloat(storeVariantDetails.offerPrice)
            : parseFloat(storeVariantDetails.price);
        item.productName = productDetails.name;
        item.variantName = variantDetails.name;
        item.productImage = variantDetails.images[0];
        item.type = variantDetails.type;
        item.value = variantDetails.value;
        item.metrics = variantDetails.metrics;
        item.price = storeVariantDetails.price;
        item.offerPrice = storeVariantDetails.offerPrice;
        item.stock = storeVariantDetails.stock;

        if (item.quantity > storeVariantDetails?.stock) {
          item.outOfStock = true;
          return 0;
        }

        return !isNaN(price) && !isNaN(item.quantity)
          ? price * item.quantity
          : 0;
      }),
    );

    subTotal = itemTotals.reduce((sum, total) => sum + total, 0);

    return {
      products,
      subTotal,
    };
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return `${commonMessages.errorOccured} ${error.message}`;
  }
}

const calculateTotalPrice = async (productDetails) => {
  return productDetails.reduce((total, item) => total + item.price, 0);
};

const updateProductPrices = async (productDetails) => {
  try {
    const container = getContainer(ContainerIds.Products);
    const updatedProductDetails = [];

    for (const item of productDetails) {
      const product = await getDetailsById(container, item.productId);

      if (!product) {
        logger.info(`Product not found for ID: ${item.productId}`);
        updatedProductDetails.push(item);
        continue;
      }

      const updatedItem = { ...item };

      if (item.variantId && Array.isArray(product.variants)) {
        const matchedVariant = product.variants.find(
          (v) => v.id === item.variantId,
        );
        if (matchedVariant) {
          updatedItem.price = item.quantity * product.price;
        } else {
          logger.warn(commonMessages.errorOccured, item.variantId);
        }
      } else {
        updatedItem.price = item.quantity * product.price;
      }

      updatedProductDetails.push(updatedItem);
    }
    return updatedProductDetails;
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
  }
};

const scheduledDelivery = async (container, date) => {
  try {
    const querySpec = {
      query:
        'SELECT * FROM c WHERE c.scheduledDelivery <= @date AND c.status = "New"',
      parameters: [{ name: "@date", value: date }],
    };

    const { resources } = await container.items.query(querySpec).fetchAll();
    return resources;
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return new responseModel(
      false,
      `${commonMessages.errorOccured} ${error.message}`,
    );
  }
};

async function getOrderStatusCounts(storeAdminId) {
  try {
    const container = getContainer(ContainerIds.Order);

    const querySpec = {
      query: `
        SELECT c.status AS status, COUNT(1) AS count, c.orderPrice, c.createdOn
        FROM c
        WHERE IS_DEFINED(c.status) AND c.storeAdminId = @storeAdmin
        GROUP BY c.status, c.orderPrice, c.createdOn
      `,
      parameters: [{ name: "@storeAdmin", value: storeAdminId }],
    };

    const resources = await getDataByQuery(container, querySpec);

    const statusCounts = {};
    for (const row of resources) {
      if (row.status) {
        statusCounts[row.status] = (statusCounts[row.status] || 0) + row.count;
      }
    }
    statusCounts.total = Object.values(statusCounts).reduce(
      (sum, value) => sum + value,
      0,
    );

    const now = new Date();
    const todayDate = now.getDate();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    let todayPayments = 0;
    let currentMonthPayments = 0;
    let currentYearPayments = 0;
    let totalPayments = 0;

    const allOrdersQuery = {
      query: `
        SELECT c.orderPrice, c.createdOn, c.PaymentDetails, c.refundDetails
        FROM c
        WHERE c.storeAdminId = @storeAdmin
        AND c.PaymentDetails.paymentStatus = "COMPLETED"
        AND (
        NOT IS_DEFINED(c.refundDetails) 
        OR c.refundDetails.refundStatus != "COMPLETED"
      )
      `,
      parameters: [{ name: "@storeAdmin", value: storeAdminId }],
    };

    const allOrders = await getDataByQuery(container, allOrdersQuery);

    allOrders.forEach((tx) => {
      if (!tx.createdOn) return;

      const createdOnDate = parseCreatedOn(tx.createdOn);
      if (!createdOnDate) return;

      const orderPrice = tx.orderPrice || 0;
      totalPayments += orderPrice;
      currentYearPayments += orderPrice;

      if (
        createdOnDate.getFullYear() === currentYear &&
        createdOnDate.getMonth() === currentMonth
      ) {
        currentMonthPayments += orderPrice;

        if (createdOnDate.getDate() === todayDate) {
          todayPayments += orderPrice;
        }
      }
    });

    return {
      statusCounts,
      todayPayments,
      currentMonthPayments,
      currentYearPayments,
      totalPayments,
    };
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return null;
  }
}

const getProductCountBystoreAdmin = async (storeAdminId) => {
  try {
    const productContainer = getContainer(ContainerIds.Products);
    const querySpec = {
      query:
        "SELECT c.active, COUNT(1) AS count FROM c WHERE c.storeAdminId = @storeAdminId GROUP BY c.active",
      parameters: [{ name: "@storeAdminId", value: storeAdminId }],
    };
    const resources = await getDataByQuery(productContainer, querySpec);
    if (!resources || resources[0] < 0) {
      return null;
    }
    const result = {};
    resources.forEach((item) => {
      result[item.active] = item.count;
    });
    result.total = Object.values(result).reduce((sum, value) => sum + value, 0);
    return result;
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return null;
  }
};

async function createSubscription(
  customerDetails,
  storeDetails,
  weeksCount,
  scheduledDelivery,
  userId,
  phone,
  couponCode,
  address,
) {
  const { createPayment } = require("../utils/PhonePe");
  const { convertUTCtoIST } = require("../utils/schedules");
  try {
    // Validate inputs
    if (
      (!customerDetails || !storeDetails || !weeksCount || !scheduledDelivery,
      !userId || !phone)
    ) {
      return new responseModel(false, commonMessages.badRequest);
    }

    const dt = dayjs(scheduledDelivery);
    const day = dt.format("dddd");
    const weekdays = commonMessages.days;
    const selectedDay = weekdays.indexOf(day.toLowerCase());

    if (selectedDay === -1) {
      return new responseModel(false, commonMessages.badRequest);
    }

    const date = new Date();

    // Get product details for this user from cart/store
    const productDetails = await getProductDetails(phone, storeDetails.id);

    if (!productDetails || !productDetails.products) {
      return new responseModel(false, orderMessages.noProductinCart);
    }

    // Validate stock
    const isOutOfStock = productDetails.products.some(
      (p) => p.outOfStock === true,
    );
    if (isOutOfStock) {
      return new responseModel(false, orderMessages.outofstock);
    }

    if (productDetails.products.length === 0) {
      return new responseModel(false, orderMessages.noProductinCart);
    }

    // Generate next N weekly dates matching selected weekday
    const pendingDates = [];
    while (pendingDates.length < weeksCount) {
      if (date.getDay() === selectedDay) {
        const newDate = new Date(date).toISOString().slice(0, 10);
        pendingDates.push(newDate);
      }
      date.setDate(date.getDate() + 1);
    }
    let discountPrice = { discount: 0 };
    if (couponCode != "") {
      discountPrice = await processCoupon(
        couponCode,
        userId,
        productDetails.subTotal,
      );

      if (!discountPrice.success)
        return new responseModel(false, discountPrice.message);
    }
    const totalPrice =
      productDetails.subTotal * weeksCount - discountPrice.discount;
    const today = convertUTCtoIST(new Date().toISOString());
    const deliveryTime = dt.format("HH:mm:ss");
    const newSubscription = {
      id: uuidv4(),
      phone,
      products: productDetails.products,
      storeDetails: {
        id: storeDetails.id,
        storeName: storeDetails.storeName,
        phone: storeDetails.phone,
        address: storeDetails.storeAddress,
      },
      customerDetails: {
        customerId: userId,
        address,
        Name: customerDetails.name,
        phone,
      },
      subscriptionOrderDates: [],
      pendingOrderDates: pendingDates,
      canceledOrderDates: [],
      day: selectedDay,
      weeksCount,
      deliveryTime,
      payments: [],
      couponCode,
      priceDetails: {
        discountPrice: discountPrice.discount,
        subTotal: `${productDetails.subTotal} * ${weeksCount}`,
        deliveryCharges: 0,
        packagingCharges: 0,
        platformCharges: 0,
        totalPrice,
      },
      storeAdminId: storeDetails?.storeAdminId || "",
      createdDate: today,
    };

    // Create payment request
    const paymentUrl = await createPayment(
      totalPrice,
      newSubscription.id,
      orderCategoriesMap.subscriptions,
    );

    if (!paymentUrl || !paymentUrl.success) {
      return new responseModel(false, commonMessages.paymentFailed);
    }

    // Save in CosmosDB
    const createdSub = await createRecord(
      subscriptionContainer,
      newSubscription,
    );
    if (!createdSub) {
      return new responseModel(false, commonMessages.failed);
    }

    // Success response
    return new responseModel(true, subscriptionMessages.created, {
      subscriptionsId: newSubscription.id,
      paymentUrl: paymentUrl,
    });
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return new responseModel(false, error.message);
  }
}

module.exports = {
  findOrderByUser,
  findOrder,
  createOrder,
  getProductDetails,
  updateProductPrices,
  scheduledDelivery,
  getNextOrderId,
  getEnrichedProductDetails,
  getOrderStatusCounts,
  getProductCountBystoreAdmin,
  createSubscription,
};
