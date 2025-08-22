const ContainerIds = {
  SystemAdmin: "Admin",
  CartItems: "CartItems",
  Categories: "Categories",
  CouponCodes: "CouponCodes",
  Customers: "Customers",
  Driver: "Driver",
  FavouriteItems: "FavouriteItems",
  Order: "Order",
  OTP: "OTP",
  Products: "Products",
  StoreAdmins: "StoreAdmins",
  StoreDetails: "StoreDetails",
  StoreManager: "StoreManager",
  StoreProduct: "StoreProduct",
  Subscriptions: "Subscriptions",
  Banners: "Banners",
};

const roles = {
  SystemAdmin: "Admin",
  StoreAdmin: "StoreAdmins",
  StoreManager: "StoreManager",
  Customer: "Customers",
  Driver: "Driver",
};

const otpMessages = {
  verifed: "OTP verified successfully",
  sent: "OTP has sent",
  subject: "Registration From Rooted",
  otp: "{userotp}",
  email: `Hi,\nYour Rooted Registration verification code is {userotp}`,
  expired: "OTP has expired",
  notFound: "OTP record not found",
  success: "OTP Verified Successfully",
  invalid: "Invalid OTP!",
  phone:
    "{userotp} is your verification code. For your security, do not share this code.",
};

const productMessages = {
  success: "Products fetched successfully",
  notFound: "Products not found",
  product: {
    notFound: "Product not found.",
    success: "Product fetched succesfully.",
    updated: "Product is Updated Successfully",
    deleted: "Product is deleted successfully",
    added: "Product added successfully",
    favouriteSuccess: "Product added to favourites successfully",
    favouriteRemove: "Product removed successfully from favourites",
    favouriteFetched: "Favourites fetched successfully",
  },
  categories: {
    fetched: "Categories fetched successfully",
    created: "Category created successfully",
  },
  review: {
    thanks: "Thanks for your review",
    notFound: "Review not found",
    replysuccess: "Thanks for your reply to this review.",
  },
  variant: {
    added: "Variant added successfully",
    notFound: "Variant not found!",
    fetched: "Variant fetched successfully",
    updated: "Variant updated successfully",
    removed: "Variant removed successfully",
  },
};

const commonMessages = {
  success: "Operation completed successfully",
  error: "Something went wrong, Please try again!",
  notFound: "Resources not found",
  failed: "Request failed",
  unauthorized: "Unauthorized access",
  errorOccured: "An error occured:",
  forbidden: "You do not have permission to perform this action",
  badRequest: "Invalid request parameters",
  paymentFailed: "Failed to create payment URL",
  invalidFields: "Invalid Fields",
  days: [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ],
  months: [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ],
};

const userMessages = {
  invalidCredientials: "Invalid Username and Password",
  notfound: "User not found",
  emailExist: "Email already registered",
  passwordUpdated: "Password updated successfully",
  phoneExist: "Phone Number already registered",
  vehicleRCExist: "Vehicle RC already registered",
  drivingLicenseExist: "driving License already registered",
  exist: "User account already exists",
  success: "User created successfully",
  loggedIn: "User Login successfully",
  fetched: "User details fetched successfully",
  updated: "User details updated successfully",
  deleted: "User deleted successfully",
  address: {
    added: "Address Added successfully",
    removed: "Address deleted successfully",
    updated: "Address updated successfully",
    fetched: "Addresses fetched successfully",
    notFound: "Address not found",
  },
  invalid: "Invalid user type",
};

const storeMessage = {
  notFound: "Store not found!",
  success: "Store fetched successfully",
  exist: "Store already registered",
  created: "Store created successfully",
  updated: "Store updated successfully",
  storesFetched: "Stores fetched successfully",
  storeStatus: {
    active: "Active",
    inActive: "InActive",
  },
};

const orderMessages = {
  notFound: "Orders not found",
  success: "Orders fetched successfully",
  types: {
    pending: "Pending",
    new: "New",
    delivered: "Delivered",
    cancelled: "Canceled",
    quick: "Quick",
    subscription: "Subscription",
  },
  orderNotfound: "Order not found",
  detailsSuccess: "Order Details Fetched Successfully",
  statusUpdated: "Order status updated",
  qrFailed: "QR code generation failed",
  placed: "Order placed successfully",
  reOrderSuccess: "Order reordered successfully",
  returnSubmit: "Product return request has submitted",
  returnAccept: "Product return has accepted",
  returnDenial: "Unable to accept the product return",
  outofstock: "Some products are out of stock. Please check your cart.",
  noProductinCart: "No products found in cart. Please add.",
  updateFailed: "Unable to update the order details",
  deliveryCharges: "deliveryCharges",
  packagingCharges: "packagingCharges",
  platformCharges: "platformCharges",
  subTotal: "subTotal",
  total: "total",
  couponDiscount: "couponDiscount",
  urlFailed: "Failed to create payment URL",
  orderCreate: "Order created successfully",
  scheduleMessage: "Schedule Delivery Should be in Future",
  addressNotFound: "Address Not Found",
};

const couponMessages = {
  exist: "Coupon already exists",
  invalid: "Invalid coupon",
  notfound: "Coupon not found",
  invalidDate: "Expiry date should not be in the past",
  success: "Coupon created successfully",
  valid: "Coupon is valid",
  fetched: "Coupons fetched successfully",
  invalidTotal: "Invalid cart total",
  used: "Coupon already used by this user",
  outofReach: "Coupon usage limit reached",
  discountType: {
    percentage: "percentage",
  },
  minimumAmount: "Minimum order amount should be greater than ",
};

const authMessage = {
  invalidToken: "Invalid token",
  tokenExpire: "Token is expired",
  accessDenied: "Access denied. No token provided.",
  expiredError: "TokenExpiredError",
  invalidPayload: "Invalid expired token payload.",
  authKey: "authorization",
  unauthorizedAccess: "You are not authorized to access this resource",
};

const mapMessage = {
  dataFetched: "Data fetched successfully",
  locality: "locality",
  sublocality: "sublocality",
  neighbourhood: "neighborhood",
};

const subscriptionMessages = {
  created: "Subscription created successfully",
  notfound: "Unable to find the subscription",
  renewal: "Subscription renewed successfully",
  rescheduled: "Subscription rescheduled successfully",
  fetched: "Subscriptions fetched successfully",
  order: "Subscription Orders fetched successfully",
};

const paymentMessages = {
  paymentSuccess: "Payment completed successfully",
  paymentFailed: "Payment failed",
  paymentPending: "Payment is pending",
  paymentUrl: "Payment URL created successfully",
  paymentDetails: "Payment details fetched successfully",
  paymentNotFound: "Payment details not found",
  refundSuccess: "Refund request submitted successfully",
  refundFailed: "Refund request failed",
  refunding: "Refund is in process",
};

const orderTypesMap = {
  active: [
    "New",
    "Accepted",
    "Order packed",
    "Driver assigned",
    "Driver accepted",
    "Order picked up",
    "Out for delivery",
  ],
  cancelled: ["Cancelled", "Rejected"],
  delivered: ["Delivered"],
};

const orderCategoriesMap = {
  quick: "Quick",
  scheduled: "Scheduled",
  subscriptions: "Subscriptions",
};

const payments = {
  callBackUrl: "https://rooted-staging.up.railway.app/api/phonepe/webhook",
};

const bannerMessages = {
  created: "Banner created successfully",
  updated: "Banner updated successfully",
  deleted: "Banner deleted successfully",
  fetched: "Banners fetched successfully",
  notFound: "Banner not found",
};

module.exports = {
  ContainerIds,
  otpMessages,
  productMessages,
  commonMessages,
  userMessages,
  roles,
  storeMessage,
  orderMessages,
  couponMessages,
  mapMessage,
  subscriptionMessages,
  authMessage,
  paymentMessages,
  orderTypesMap,
  orderCategoriesMap,
  payments,
  bannerMessages,
};
