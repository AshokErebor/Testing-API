const express = require("express");
const router = express.Router();
const { logger } = require("../jobLogger");
const {
  getContainer,
  createRecord,
  deleteRecord,
  getDetailsById,
} = require("../services/cosmosService");
const { getProductDetails } = require("../services/orderService");
const { convertUTCtoIST } = require("../utils/schedules");
const {
  findCoupon,
  getAllCoupons,
  processCoupon,
} = require("../services/couponService");
const {
  ContainerIds,
  roles,
  commonMessages,
  couponMessages,
} = require("../constants");
const { authenticateToken, isAuthorizedUser } = require("../middleware/auth");
const responseModel = require("../models/ResponseModel");
const container = getContainer(ContainerIds.CouponCodes);

router.post("/createcoupon", authenticateToken, async (req, res) => {
  try {
    const authorized = await isAuthorizedUser(req.user.id, [
      roles.StoreAdmin,
      roles.SystemAdmin,
    ]);

    if (!authorized) {
      return res
        .status(401)
        .json(new responseModel(false, commonMessages.forbidden));
    }

    const {
      couponName,
      discountType,
      description,
      discountValue,
      multiUse,
      minOrderAmount,
      maxCouponAmount,
    } = req.body;

    if (!couponName || !discountType || discountValue == null)
      return res
        .status(400)
        .json(new responseModel(false, commonMessages.badRequest));

    const existingCoupon = await findCoupon(container, couponName);

    if (existingCoupon)
      return res
        .status(409)
        .json(new responseModel(false, couponMessages.exist));

    const today = convertUTCtoIST(new Date().toISOString());
    const newCoupon = {
      id: couponName.toUpperCase(),
      couponName: couponName.toUpperCase(),
      discountType,
      description,
      discountValue,
      multiUse,
      minOrderAmount,
      usedBy: [],
      status: "Active",
      createdDate: today,
      maxCouponAmount,
    };

    const createdCoupon = await createRecord(container, newCoupon);
    if (!createdCoupon) {
      return res
        .status(500)
        .json(new responseModel(false, commonMessages.failed));
    }

    return res
      .status(201)
      .json(
        new responseModel(
          true,
          commonMessages.success,
          createdCoupon.couponName,
        ),
      );
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(500).json(new responseModel(false, error.message));
  }
});

router.post("/apply", authenticateToken, async (req, res) => {
  try {
    const { id, phone } = req.user;

    if (!id || !phone)
      return res
        .status(400)
        .json(new responseModel(false, commonMessages.badRequest));

    const { couponName, storeId } = req.body;

    if (!couponName || !storeId)
      return res
        .status(400)
        .json(new responseModel(false, commonMessages.badRequest));

    const cartTotal = await getProductDetails(phone, storeId);

    if (!cartTotal || !cartTotal.subTotal)
      return res
        .status(400)
        .json(new responseModel(false, couponMessages.invalidTotal));

    const result = await processCoupon(couponName, id, cartTotal.subTotal);

    if (!result.success)
      return res.status(400).json(new responseModel(false, result.message));

    return res
      .status(200)
      .json(new responseModel(true, couponMessages.valid, result.discount));
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(500).json(new responseModel(false, error.message));
  }
});

router.get("/getcoupons", authenticateToken, async (req, res) => {
  try {
    const coupons = await getAllCoupons();
    return res
      .status(200)
      .json(new responseModel(true, couponMessages.fetched, coupons));
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(500).json(new responseModel(false, error.message));
  }
});

router.post("/deleteCoupon/:couponId", authenticateToken, async (req, res) => {
  try {
    const { couponId } = req.params;
    const authorized = await isAuthorizedUser(req.user.id, [
      roles.StoreAdmin,
      roles.SystemAdmin,
    ]);
    if (!authorized) {
      return res
        .status(403)
        .json(new responseModel(false, commonMessages.forbidden));
    }
    const couponDetails = await getDetailsById(container, couponId);
    if (!couponDetails) {
      return res
        .status(404)
        .json(new responseModel(false, couponMessages.failed));
    }
    const deleteCoupon = await deleteRecord(container, couponDetails.id);
    if (!deleteCoupon) {
      return res
        .status(500)
        .json(new responseModel(false, commonMessages.failed));
    }
    return res
      .status(200)
      .json(new responseModel(true, commonMessages.success));
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(500).json(new responseModel(false, error.message));
  }
});

module.exports = router;
