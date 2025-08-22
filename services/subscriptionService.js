const { commonMessages } = require("../constants");
const { getDataByQuery } = require("../services/cosmosService");
const { logger } = require("../jobLogger");

const getCustomerSubscriptionOrdersList = async (
  container,
  subscriptionId,
  userId,
) => {
  try {
    const querySpec = {
      query:
        "SELECT * FROM c WHERE c.subscriptionId = @subscriptionId AND c.customerDetails.customerId = @userId",
      parameters: [
        { name: "@subscriptionId", value: subscriptionId },
        { name: "@userId", value: userId },
      ],
    };

    const resources = await getDataByQuery(container, querySpec);
    return resources;
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
  }
};

const getCustomerSubscriptionsList = async (container, phone) => {
  try {
    const querySpec = {
      query:
        "SELECT * FROM c WHERE c.phone = @phone ORDER BY c.createdDate DESC",
      parameters: [{ name: "@phone", value: phone }],
    };

    const resources = await getDataByQuery(container, querySpec);
    return resources;
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
  }
};

const getNextNDaysSubscriptions = async (container, storeId, days) => {
  try {
    const today = new Date();
    const nextNDays = new Date();
    nextNDays.setDate(today.getDate() + days);

    const querySpec = {
      query:
        "SELECT * FROM c WHERE c.storeDetails.id = @storeId AND (c.scheduledDelivery >= @startDate AND c.scheduledDelivery <= @endDate)",
      parameters: [
        { name: "@storeId", value: storeId },
        { name: "@startDate", value: today.toISOString().slice(0, 16) },
        { name: "@endDate", value: nextNDays.toISOString().slice(0, 16) },
      ],
    };

    const resources = await getDataByQuery(container, querySpec);
    return resources;
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return [];
  }
};

const getSubscriptionOrderByDate = async (container, subscriptionId, date) => {
  try {
    const querySpec = {
      query:
        "SELECT * FROM c WHERE c.subscriptionId = @subscriptionId AND STARTSWITH(c.scheduledDelivery, @date)",
      parameters: [
        { name: "@subscriptionId", value: subscriptionId },
        { name: "@date", value: date },
      ],
    };

    const resources = await getDataByQuery(container, querySpec);
    return resources[0];
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return [];
  }
};

module.exports = {
  getCustomerSubscriptionOrdersList,
  getCustomerSubscriptionsList,
  getNextNDaysSubscriptions,
  getSubscriptionOrderByDate,
};
