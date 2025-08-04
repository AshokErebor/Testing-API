require("dotenv").config();
const redis = require("redis");
const responseModel = require("../models/ResponseModel");
const { getContainer, getDataByQuery } = require("../services/cosmosService");
const { commonMessages, ContainerIds } = require("../constants");
const {
  getOrderStatusCounts,
  getProductCountBystoreAdmin,
} = require("../services/orderService");
const { getIdbyStoreadmin } = require("../services/storeService");
const { logger } = require("../jobLogger");
const client = redis.createClient({
  username: "default",
  password: process.env.REDIS_PASSWORD,
  socket: {
    host: process.env.REDIS_HOST,
    port: Number(process.env.REDIS_PORT),
    tls: true,
    connectTimeout: 10000,
  },
});

(async () => {
  if (!client.isOpen) {
    try {
      await client.connect();
    } catch (error) {
      logger.error(commonMessages.error, error);
    }
  }
})();

const setUserInCache = async (userId, role, data) => {
  try {
    if (!userId || !role || !data)
      return new responseModel(false, commonMessages.badRequest);

    const key = `${role}:${userId}`;
    const value = JSON.stringify(data);
    const cacheresponse = await setCache(key, value);
    if (!cacheresponse.success) {
      return new responseModel(false, commonMessages.failed);
    }

    return new responseModel(true, commonMessages.success);
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return new responseModel(false, commonMessages.error);
  }
};

const getUserCache = async (userId, role) => {
  try {
    const key = `${role}:${userId}`;
    const cacheData = await getCache(key);

    if (!cacheData) return new responseModel(false, commonMessages.notFound);

    const parsed = JSON.parse(cacheData.data);
    return new responseModel(true, commonMessages.success, parsed);
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return new responseModel(false, commonMessages.error);
  }
};

const setCache = async (key, value, ttlSeconds = 3600) => {
  try {
    if (!key || value === undefined || value === null)
      return new responseModel(false, commonMessages.badRequest);

    const stringValue =
      typeof value === "string" ? value : JSON.stringify(value);

    if (!client.isOpen) {
      await client.connect();
    }
    await client.setEx(key, ttlSeconds, stringValue);

    return new responseModel(true, commonMessages.success);
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return new responseModel(false, commonMessages.error);
  }
};

async function deleteCache(key) {
  try {
    if (!client.isOpen) {
      await client.connect();
    }
    if (!key) return new responseModel(false, commonMessages.badRequest);
    const result = await client.del(key);
    if (result === 1) {
      return new responseModel(true, commonMessages.success);
    } else {
      new responseModel(false, commonMessages.failed);
    }
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return new responseModel(false, commonMessages.error);
  }
}

const getCache = async (key) => {
  try {
    if (!key) return new responseModel(false, commonMessages.badRequest);

    if (!client.isOpen) {
      await client.connect();
    }

    const data = await client.get(key);
    if (!data) return new responseModel(false, commonMessages.failed);

    return new responseModel(true, commonMessages.success, data);
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return new responseModel(false, commonMessages.error);
  }
};

const getDriversByStoreAdmin = async (storeIdsList) => {
  try {
    const driverContainer = getContainer(ContainerIds.Driver);
    const querySpec = {
      query: `SELECT c.status FROM c WHERE ARRAY_CONTAINS(@storeIdList, c.storeId)`,
      parameters: [
        {
          name: "@storeIdList",
          value: storeIdsList,
        },
      ],
    };
    const driverCount = await getDataByQuery(driverContainer, querySpec);
    const statusCount = {};
    driverCount.forEach((item) => {
      const status = item.status;
      statusCount[status] = (statusCount[status] || 0) + 1;
    });
    statusCount.total = Object.values(statusCount).reduce(
      (sum, value) => sum + value,
      0
    );
    return statusCount;
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return null;
  }
};

const getManagersByStoreAdmin = async (storeAdminId) => {
  try {
    const managerContainer = getContainer(ContainerIds.StoreManager);
    const querySpec = {
      query: "SELECT VALUE COUNT(1) FROM c WHERE c.storeAdmin = @storeAdmin",
      parameters: [{ name: "@storeAdmin", value: storeAdminId }],
    };
    const resources = await getDataByQuery(managerContainer, querySpec);
    if (!resources || resources[0] < 0) {
      return null;
    }
    return resources[0];
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return null;
  }
};

const getAnalysticsByStoreAdmin = async (storeAdminId) => {
  try {
    const orderStatusCounts = await getOrderStatusCounts(storeAdminId);
    const storeIds = await getIdbyStoreadmin(storeAdminId);
    const storeIdsList = storeIds.map((store) => store.id);

    //store count
    const statusCounts = storeIds.reduce((acc, store) => {
      const status = store.storeStatus;
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});
    statusCounts.total = Object.values(statusCounts).reduce(
      (sum, value) => sum + value,
      0
    );
    return {
      orderStatusCounts,
      driversStatusCount: await getDriversByStoreAdmin(storeIdsList),
      totalManagerCount: await getManagersByStoreAdmin(storeAdminId),
      storeStatusCount: statusCounts,
      productCount: await getProductCountBystoreAdmin(storeAdminId),
    };
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return null;
  }
};

module.exports = {
  setUserInCache,
  getUserCache,
  deleteCache,
  setCache,
  getCache,
  getAnalysticsByStoreAdmin,
  getDriversByStoreAdmin,
  getManagersByStoreAdmin,
};
