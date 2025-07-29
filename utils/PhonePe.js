const dotenv = require("dotenv");
const {
  StandardCheckoutClient,
  Env,
  CreateSdkOrderRequest,
  RefundRequest,
} = require("pg-sdk-node");
const {
  getContainer,
  getUserDetails,
  getDetailsById,
  formatDateCustom,
} = require("../services/cosmosService");
dotenv.config();
const {
  findOrder,
  getNextOrderId,
  createOrder,
} = require("../services/orderService");
const responseModel = require("../models/ResponseModel");
const {
  subscriptionMessages,
  paymentMessages,
  commonMessages,
  orderMessages,
  authMessage,
} = require("../constants");
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SCERET;
const clientVirtion = 1;
const env = Env.SANDBOX;
const redirectUrl = "http://localhost:3000/api/status";
const { logger } = require("../jobLogger");
const orderContainer = getContainerById("Order");
const subscriptionContainer = getContainerById("Subscriptions");
const storeProductContainer = getContainerById("StoreProduct");
const cartItemContainer = getContainerById("CartItems");
const customerContainer = getContainerById("Customers");

const client = StandardCheckoutClient.getInstance(
  CLIENT_ID,
  CLIENT_SECRET,
  clientVirtion,
  env,
);

async function createPayment(amount, orderId, orderType) {
  const merchantOrderId = orderId;
  const returnUrl = `${redirectUrl}/?orderType=${orderType}&id=${orderId}`;

  try {
    const request = CreateSdkOrderRequest.StandardCheckoutBuilder()
      .merchantOrderId(merchantOrderId)
      .amount(amount)
      .redirectUrl(returnUrl)
      .build();

    const response = await client.createSdkOrder(request);
    return {
      success: true,
      response,
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

const handlePaymentStatus = async (req, res) => {
  try {
    const orderType = req.query.orderType;
    const merchantTransactionId = req.query.id;
    const response = await client.getOrderStatus(merchantTransactionId);
    if (response.state === "COMPLETED") {
      if (orderType === "Subscriptions") {
        const subscription = await getDetailsById(
          subscriptionContainer,
          merchantTransactionId,
        );
        if (!subscription) {
          return res
            .status(404)
            .json(new responseModel(false, subscriptionMessages.notfound));
        }

        const transactionId = response.paymentDetails[0].transactionId;

        if (!Array.isArray(subscription.payments)) {
          subscription.payments = [];
        }
        subscription.payments.push({
          transactionId,
          paymentStatus: "COMPLETED",
          paidAmount: subscription.totalPrice,
          paidOn: new Date().toISOString(),
        });

        for (const deliveryDate of subscription.pendingOrderDates) {
          const orderId = await getNextOrderId();
          const order = {
            id: `Order-${orderId}`,
            customerDetails: subscription.customerDetails,
            productDetails: subscription.products,
            storeDetails: subscription.storeDetails,
            subscriptionId: subscription.id,
            scheduledDelivery: `${deliveryDate}T${subscription.deliveryTime}`,
            status: "New",
            deliveryCharges: 0,
            packagingCharges: 0,
            platformCharges: 0,
            orderPrice: parseFloat(subscription.totalPrice),
            orderType: "Subscription",
            storeAdminId: subscription.storeAdminId || "",
            PaymentDetails: {
              paymentStatus: "COMPLETED",
              transactionId,
            },
            createdOn: formatDateCustom(new Date()),
          };
          await createOrder(order);
          await updateProductQuantities(order);
        }
        subscription.subscriptionOrderDates = [
          ...(subscription.subscriptionOrderDates || []),
          ...subscription.pendingOrderDates,
        ];

        subscription.pendingOrderDates = [];

        await subscriptionContainer
          .item(subscription.id, subscription.id)
          .replace(subscription);
        const cartItems = await getUserDetails(
          cartItemContainer,
          subscription.phone,
        );
        cartItems.products = [];
        await cartItemContainer
          .item(cartItems.id, cartItems.id)
          .replace(cartItems);
        return res
          .status(200)
          .json(
            new responseModel(true, paymentMessages.paymentSuccess, response),
          );
      }

      const order = await findOrder(merchantTransactionId);
      order.PaymentDetails = {
        paymentStatus: response.state,
        transactionId: response.paymentDetails[0].transactionId,
      };
      if (response.state === "COMPLETED") {
        await updateProductQuantities(order);
        await orderContainer.item(order.id, order.id).replace(order);
        const customerDetails = await getDetailsById(
          customerContainer,
          order.customerDetails.customerId,
        );
        const cartItems = await getUserDetails(
          cartItemContainer,
          customerDetails.phone,
        );
        cartItems.products = [];
        await cartItemContainer
          .item(cartItems.id, cartItems.id)
          .replace(cartItems);
      }
      return res
        .status(200)
        .json(
          new responseModel(true, paymentMessages.paymentSuccess, response),
        );
    } else {
      return res
        .status(500)
        .json(
          new responseModel(false, paymentMessages.paymentFailed, response),
        );
    }
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res
      .status(500)
      .json(new responseModel(false, commonMessages.errorOccured));
  }
};

const updateProductQuantities = async (order) => {
  try {
    const { storeDetails, productDetails } = order;
    const querySpec = {
      query: "SELECT * FROM c WHERE c.storeId = @storeId",
      parameters: [{ name: "@storeId", value: storeDetails.id }],
    };

    const { resources } = await storeProductContainer.items
      .query(querySpec)
      .fetchAll();

    if (!resources.length) return;

    const storeDoc = resources[0];
    let updated = false;
    for (const item of productDetails) {
      const { productId, variantId, quantity } = item;
      if (!productId || !quantity) continue;

      const product = storeDoc.products.find((p) => p.productId === productId);
      if (!product) continue;

      if (variantId) {
        const variant = product.variants?.find(
          (v) => v.variantId === variantId,
        );
        if (variant) {
          if (variant.stock >= quantity) {
            variant.stock -= quantity;
            product.stock = product.variants.reduce(
              (sum, v) => sum + v.stock,
              0,
            );

            updated = true;
          } else {
            logger.error(`${orderMessages.outofstock} ${variantId}`);
          }
        }
      } else {
        if (product.stock >= quantity) {
          product.stock -= quantity;
          updated = true;
        } else {
          logger.error(`${orderMessages.outofstock} ${productId}`);
        }
      }
    }

    if (updated) {
      await storeProductContainer
        .item(storeDoc.id, storeDoc.id)
        .replace(storeDoc);
    }
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
  }
};

const refundProcess = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const order = await findOrder(orderId);
    if (!order) {
      return res
        .status(404)
        .json(new responseModel(false, orderMessages.orderNotfound));
    }
    if (req.user.id !== order.storeAdminId) {
      return res
        .status(403)
        .json(new responseModel(false, authMessage.unauthorizedAccess));
    }
    if (order.PaymentDetails.paymentStatus !== "COMPLETED") {
      return res
        .status(400)
        .json(new responseModel(false, paymentMessages.paymentPending));
    }
    const request = RefundRequest.builder()
      .amount(order.orderPrice * 100)
      .merchantRefundId(order.id)
      .originalMerchantOrderId(order.PaymentDetails.transactionId)
      .build();
    const response = await client.refund(request);
    if (response) {
      await orderContainer.item(order.id, order.id).patch([
        {
          op: "add",
          path: "/refundDetails",
          value: {
            transactionId: response.refundId,
            refundStatus: response.state,
            refundedOn: new Date().toISOString(),
          },
        },
      ]);
    } else {
      return res
        .status(500)
        .json(new responseModel(false, paymentMessages.refundFailed, response));
    }

    return res
      .status(200)
      .json(new responseModel(true, paymentMessages.refundSuccess, response));
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(500).json(new responseModel(false, error.message));
  }
};

const refundStatus = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const order = await findOrder(orderId);
    if (!order) {
      return res
        .status(404)
        .json(new responseModel(false, subscriptionMessages.notfound));
    }
    if (req.user.id !== order.customerDetails.customerId) {
      return res
        .status(403)
        .json(new responseModel(false, authMessage.unauthorizedAccess));
    }
    if (order.PaymentDetails.paymentStatus !== "COMPLETED") {
      return res
        .status(400)
        .json(new responseModel(false, paymentMessages.paymentPending));
    }

    const response = await client.getRefundStatus(order.id);
    if (response.state === "COMPLETED") {
      return res
        .status(200)
        .json(new responseModel(true, paymentMessages.refundSuccess, response));
    } else {
      return res
        .status(200)
        .json(new responseModel(false, paymentMessages.refunding, response));
    }
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(500).json(new responseModel(false, error.message));
  }
};

function getContainerById(id) {
  try {
    return getContainer(id);
  } catch (error) {
    logger.error(`Unknown container ID: ${id}`, error);
    throw new Error(`Unknown container ID: ${id}`);
  }
}

module.exports = {
  createPayment,
  handlePaymentStatus,
  refundProcess,
  refundStatus,
};
