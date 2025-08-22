const driverContainer = "Driver";
const couponContainer = "CouponCodes";
const { DateTime } = require("luxon");
const { logger } = require("../jobLogger");
const { commonMessages } = require("../constants");

const {
  getContainer,
  getUsersByExpiryDate,
} = require("../services/cosmosService");
const { getCoupons } = require("../services/couponService");
const { scheduledDelivery } = require("../services/orderService");

async function updateDriverDetails() {
  try {
    const container = await getContainer(driverContainer);
    const date = new Date();

    //update user authorization to suspended for expired users.
    date.setDate(date.getDate() - 1);
    const expiredUsers = await getUsersByExpiryDate(
      driverContainer,
      date.toISOString().split("T")[0],
    );

    if (expiredUsers.length > 1) {
      expiredUsers.map((user) => {
        user.isAuthorized = "Suspended";
        return container.item(user.id, user.id).replace(user);
      });
    }

    //Send Notifications to users expiring in next 7 days.
    // date.setDate(date.getDate() + 7);
    // const usersExpiresin7days = await getUsersByExpiryDate(driverContainer, date.toISOString().split('T')[0]);
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
  }
}

async function updateCouponDetails() {
  try {
    const container = getContainer(couponContainer);
    const expiredCoupons = await getCoupons();

    if (expiredCoupons.length === 0) {
      return;
    }
    const partitionKeyName = "couponName";

    const deletePromises = expiredCoupons.map(async (coupon) => {
      if (!coupon.id) {
        return null;
      }
      const item = container.item(coupon.id, coupon[partitionKeyName]);
      const { resource } = await item.read();
      if (!resource) {
        return null;
      }

      await item.delete();
      return true;
    });
    return await Promise.all(deletePromises);
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
  }
}

async function updateScheduledDeliveries() {
  try {
    const container = await getContainer("Order");
    const date = new Date();
    const today = date.toISOString().slice(0, 16);
    const timeDate = convertUTCtoIST(today);
    const scheduledOrders = await scheduledDelivery(container, timeDate);

    if (scheduledOrders.length >= 1) {
      for (const order of scheduledOrders) {
        order.status = "Accepted";
        await container.item(order.id, order.id).replace(order);
      }
    }
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
  }
}

function convertUTCtoIST(dateStr) {
  try {
    let dt = DateTime.fromISO(dateStr, { setZone: true });
    if (dt.zoneName === "UTC" || dt.offset === 0) {
      return dt.setZone("Asia/Kolkata").toISO({ suppressMilliseconds: false });
    } else {
      return dt.toISO({ suppressMilliseconds: false });
    }
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return null;
  }
}

module.exports = {
  updateDriverDetails,
  updateCouponDetails,
  updateScheduledDeliveries,
  convertUTCtoIST,
};
