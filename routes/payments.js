// routes/payment.js
const express = require("express");
const router = express.Router();
const {
  handlePaymentStatus,
  refundProcess,
  refundStatus,
} = require("../utils/PhonePe");
const { authenticateToken } = require("../middleware/auth");

router.post("/phonepe/webhook", handlePaymentStatus);
router.get("/refund/:orderId", authenticateToken, refundProcess);
router.get("/refundStatus/:orderId", authenticateToken, refundStatus);

module.exports = router;
