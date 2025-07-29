const {
  getContainer,
  getDataByQuery,
  fetchAllItems,
  updateRecord,
} = require("../services/cosmosService");
const {
  ContainerIds,
  commonMessages,
  couponMessages,
} = require("../constants");
const { logger } = require("../jobLogger");
const responseModel = require("../models/ResponseModel");

const getCoupons = async () => {
  try {
    const container = await getContainer(ContainerIds.CouponCodes);
    const now = new Date().toISOString();
    const querySpec = {
      query: "SELECT * FROM c WHERE c.expiryDate <= @date",
      parameters: [{ name: "@date", value: now }],
    };

    const { resources } = await getDataByQuery(container, querySpec);
    return resources;
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return [];
  }
};

const getAllCoupons = async () => {
  try {
    const container = getContainer(ContainerIds.CouponCodes);
    const resources = await fetchAllItems(container);
    if (resources.length > 0) {
      return resources;
    }
    return null;
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return null;
  }
};

const findCoupon = async (container, couponName) => {
  try {
    const querySpec = {
      query: "SELECT * FROM c WHERE LOWER(c.couponName) = @couponName",
      parameters: [{ name: "@couponName", value: couponName.toLowerCase() }],
    };
    const resources = await getDataByQuery(container, querySpec);
    return resources ? resources[0] : null;
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return null;
  }
};

async function applyCouponAndUpdate(details, customerId) {
  try {
    if (!details.success) {
      return new responseModel(false, commonMessages.badRequest);
    }

    const { discount, couponDetails, alreadyUsed, container } = details;

    if (!alreadyUsed) {
      if (!couponDetails.id) {
        return new responseModel(false, commonMessages.badRequest);
      }

      couponDetails.usedBy.push(customerId);
      const updatedCoupon = await updateRecord(container, couponDetails);
      if (updatedCoupon) {
        return new responseModel(false, commonMessages.failed);
      }
    }

    return { success: true, discount };
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return new responseModel(false, commonMessages.failed);
  }
}

async function processCoupon(couponName, customerId, cartTotal) {
  try {
    const container = getContainer(ContainerIds.CouponCodes);
    const couponDetails = await findCoupon(container, couponName);

    if (!couponDetails) {
      return new responseModel(false, couponMessages.notfound);
    }

    if (cartTotal < (couponDetails.minOrderAmount || 0)) {
      return {
        success: false,
        message: couponMessages.minimumAmount + couponDetails.minOrderAmount,
      };
    }
    if (!Array.isArray(couponDetails.usedBy)) {
      couponDetails.usedBy = [];
    }

    const alreadyUsed = couponDetails.usedBy.includes(customerId);

    if (!couponDetails.multiUse && alreadyUsed) {
      return new responseModel(false, couponMessages.used);
    }

    let discount =
      couponDetails.discountType === couponMessages.discountType.percentage
        ? (cartTotal * couponDetails.discountValue) / 100
        : couponDetails.discountValue;
    if (
      couponDetails.maxCouponAmount &&
      discount > couponDetails.maxCouponAmount
    ) {
      discount = couponDetails.maxCouponAmount;
    }

    return {
      success: true,
      discount,
      couponDetails,
      alreadyUsed,
      container,
    };
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return new responseModel(false, error.message);
  }
}

module.exports = {
  getCoupons,
  getAllCoupons,
  findCoupon,
  applyCouponAndUpdate,
  processCoupon,
};
