require("dotenv").config();
// const { CosmosClient } = require("@azure/cosmos");
// const cron = require("node-cron");
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");
const { requestLogger } = require("./jobLogger");
// const {
//   updateDriverDetails,
//   updateCouponDetails,
//   updateScheduledDeliveries,
// } = require("./utils/schedules");
const timeout = require("connect-timeout");

const uploadRoutes = require("./routes/upload"); // Import upload.js
const productRoutes = require("./routes/products"); // Import product routes
const authRoutes = require("./routes/user"); // Import auth routes
const otps = require("./routes/otp");
const cartItemsRoutes = require("./routes/cartItems"); //Import cart items routes
const favouriteItemsRoutes = require("./routes/favouriteItems"); //Import favourite items routes
const storeProduct = require("./routes/storeProduct"); //Import store product routes
const storeDetails = require("./routes/storeDetails"); //Import store admin routes
const customer = require("./routes/customer"); //Import store admin routes
const map = require("./routes/map");
const admin = require("./routes/systemAdmin"); //Import store admin routes
const driver = require("./routes/driver"); //Import store admin routes
const storeAdmin = require("./routes/storeAdmin"); //Import store admin routes
const storeManager = require("./routes/storeManager"); //Import store manager routes
const order = require("./routes/order");
const couponCodes = require("./routes/coupon");
const subscriptionRoutes = require("./routes/subscriptions");
const payments = require("./routes/payments");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(requestLogger);
app.use(express.json());
app.use(cors());
app.use(timeout("90s"));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// CORS & Headers Setup
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  next();
});

// Routes
app.get("/", (req, res) => res.send("🚀 API Running Successfully!"));
app.use("/api/products", productRoutes); // API for product handling
app.use("/api/uploads", uploadRoutes); // API for image upload
app.use("/api", authRoutes, payments); // API for authentication
app.use("/api/user", authRoutes); // API for list
app.use("/api", otps); //Api for Get & Verify otps
app.use("/api/cartItems", cartItemsRoutes); //API for cart items
app.use("/api/favouriteItems", favouriteItemsRoutes); //API for favourite items
app.use("/api/storeProducts", storeProduct); //API for store Product items
app.use("/api/store", storeDetails); //API for stroreAdmin
app.use("/api/map", map);
app.use("/api/customer", customer); // API for customers
app.use("/api/admin", admin); // API for admin
app.use("/api/driver", driver); // API for driver
app.use("/api/storeAdmin", storeAdmin); //API for storeAdmin
app.use("/api/storeManager", storeManager); //API for storeManager
app.use("/api/order", order);
app.use("/api/coupon", couponCodes);
app.use("/api/subscriptions", subscriptionRoutes);
// Serve uploaded images publicly
app.use("/uploads", express.static("uploads"));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// cron.schedule('*/05 * * * *', updateUserDetails); // This schedule runs for every 5 minutes
// cron.schedule('0 0 * * *', updateDriverDetails); // This schedule runs every day at midnight (00:00)
// cron.schedule('0 0 * * *', updateCouponDetails);
// cron.schedule('0 * * * *', updateScheduledDeliveries);
// Start Server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Server running on port ${PORT}`);
});
