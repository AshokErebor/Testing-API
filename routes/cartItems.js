const express = require("express");
const {
  getUserDetails,
  createRecord,
  updateRecord,
  getContainer,
} = require("../services/cosmosService");
const { processCoupon } = require("../services/couponService");
const { getProductDetails } = require("../services/orderService");
const { getUsersByStoreId } = require("../services/storeService");
const { authenticateToken } = require("../middleware/auth");
const responseModel = require("../models/ResponseModel");
const { getDetailsById } = require("../services/cosmosService");
const router = express.Router();
const { logger } = require("../jobLogger");
const {
  commonMessages,
  ContainerIds,
  productMessages,
  userMessages,
} = require("../constants");
const storeProduct = "StoreProduct";
const cartItemContainer = getContainer(ContainerIds.CartItems);

router.post("/add", authenticateToken, async (req, res) => {
  try {
    const { productId, variantId, storeId } = req.body;

    const phone = req.user.phone;

    if (!phone || !productId || !variantId || !storeId)
      return res
        .status(400)
        .json(new responseModel(false, commonMessages.badRequest));

    const storeProducts = await getUsersByStoreId(storeProduct, storeId);
    const storeProductDetails = storeProducts[0].products.find(
      (p) => p.productId === productId,
    );

    if (!storeProductDetails)
      return res
        .status(404)
        .json(new responseModel(false, productMessages.product.notFound));

    const variant = storeProductDetails?.variants?.find(
      (v) => v.variantId === variantId,
    );

    if (!variant || variant.stock <= 0)
      return res.status(200).json(new responseModel(false, "Out of Stock"));

    const user = await getUserDetails(cartItemContainer, phone);

    const newProductEntry = {
      productId,
      variantId,
      quantity: 1,
    };

    if (!user) {
      const productDetails = {
        phone,
        products: [newProductEntry],
      };

      const updatedCart = await createRecord(cartItemContainer, productDetails);
      if (!updatedCart) {
        return res
          .status(500)
          .json(new responseModel(false, commonMessages.failed));
      }

      return res
        .status(200)
        .json(new responseModel(true, "Product added successfully"));
    } else {
      const existingIndex = user.products.findIndex(
        (p) => p.productId === productId && p.variantId === variantId,
      );

      if (existingIndex !== -1) {
        if (user.products[existingIndex].quantity >= variant.stock)
          return res
            .status(200)
            .json(
              new responseModel(
                false,
                "Only " + variant.stock + " items available",
              ),
            );
        user.products[existingIndex].quantity += 1;
      } else {
        user.products.push(newProductEntry);
      }

      await cartItemContainer.item(user.id, user.id).replace(user);
      return res
        .status(200)
        .json(new responseModel(true, "Product added to cart successfully"));
    }
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(500).json(new responseModel(false, error.message));
  }
});

//API to decrease product quantity in cart
router.post("/remove", authenticateToken, async (req, res) => {
  try {
    const { productId, variantId } = req.body;
    const phone = req.user.phone;

    if (!phone || !productId || !variantId)
      return res
        .status(400)
        .json(new responseModel(false, commonMessages.badRequest));

    const user = await getUserDetails(cartItemContainer, phone);

    if (!user || !Array.isArray(user.products)) {
      return res.status(404).json(new responseModel(false, "Cart not found"));
    }

    const productIndex = user.products.findIndex(
      (p) => p.productId === productId && p.variantId === variantId,
    );

    if (productIndex === -1) {
      return res
        .status(404)
        .json(new responseModel(false, "Product not found in cart"));
    }

    const existing = user.products[productIndex];

    if (existing.quantity <= 1) {
      user.products.splice(productIndex, 1);
    } else {
      existing.quantity -= 1;
      user.products[productIndex] = existing;
    }

    const updatedCart = await updateRecord(cartItemContainer, user);
    if (!updatedCart) {
      return res
        .status(500)
        .json(new responseModel(false, "Unable update the cart"));
    }
    return res
      .status(200)
      .json(new responseModel(true, "Cart updated successfully"));
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(500).json(new responseModel(false, error.message));
  }
});

//API to remove entire product from cart
router.post("/delete", authenticateToken, async (req, res) => {
  try {
    const { productId, variantId } = req.body;
    const phone = req.user.phone;

    if (!phone || !productId || !variantId)
      return res
        .status(400)
        .json(new responseModel(false, commonMessages.badRequest));

    const user = await getUserDetails(cartItemContainer, phone);
    if (!user || !Array.isArray(user.products)) {
      return res.status(404).json(new responseModel(false, "Cart not found"));
    }

    const filteredProducts = user.products.filter(
      (p) => !(p.productId === productId && p.variantId === variantId),
    );

    user.products = filteredProducts;

    const updatedCart = await updateRecord(cartItemContainer, user);
    if (!updatedCart) {
      return res
        .status(500)
        .json(new responseModel(false, "Unable to delete the cart"));
    }
    return res
      .status(200)
      .json(new responseModel(true, "Product deleted successfully"));
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(500).json(new responseModel(false, error.message));
  }
});

//API to get cart details specific based on storeId
router.get("/view/:storeId", authenticateToken, async (req, res) => {
  try {
    const phone = req.user.phone;

    const storeId = req.params.storeId;

    if (!phone)
      return res
        .status(400)
        .json(new responseModel(false, commonMessages.badRequest));

    const productsList = await getProductDetails(phone, storeId);

    return res
      .status(200)
      .json(
        new responseModel(
          true,
          "Cart items fetched successfully",
          productsList,
        ),
      );
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(500).json(new responseModel(false, error.message));
  }
});

//API to clear entire cart
router.post("/clear", authenticateToken, async (req, res) => {
  try {
    const phone = req.user.phone;

    if (!phone)
      return res
        .status(400)
        .json(new responseModel(false, commonMessages.badRequest));

    const user = await getUserDetails(cartItemContainer, phone);

    if (user) {
      user.products = [];

      const clearCart = await updateRecord(cartItemContainer, user);
      if (!clearCart) {
        return res
          .status(500)
          .json(new responseModel(false, "Unable to clear the cart"));
      }

      return res
        .status(200)
        .json(new responseModel(true, "Cart items cleared successfully"));
    } else {
      return res
        .status(200)
        .json(new responseModel(false, userMessages.notfound));
    }
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(500).json(new responseModel(false, error.message));
  }
});

router.get("/orderCharges", authenticateToken, async (req, res) => {
  try {
    const phone = req.user.phone;
    const { couponCode, storeId } = req.body;
    let coupondiscount = 0;
    if (!phone) {
      return res
        .status(400)
        .json(new responseModel(false, commonMessages.badRequest));
    }
    const storeContainer = getContainer(ContainerIds.StoreDetails);
    const store = await getDetailsById(storeContainer, storeId);
    const productsList = await getProductDetails(phone, storeId);
    if (!productsList || !productsList.subTotal) {
      return res
        .status(404)
        .json(new responseModel(false, "No products found in cart"));
    }
    if (couponCode) {
      coupondiscount = await processCoupon(
        couponCode,
        phone,
        productsList.subTotal,
      );
    }
    const chargesList = [
      { item: "couponDiscount", value: coupondiscount.discount || 0 },
      { item: "deliveryCharges", value: store.deliveryCharges || 0 },
      { item: "packagingCharges", value: store.packagingCharges || 0 },
      { item: "platformCharges", value: store.platformCharges || 0 },
      { item: "subTotal", value: productsList.subTotal },
      { item: "total", value: productsList.total },
    ];
    return res
      .status(200)
      .json(
        new responseModel(true, "Charges fetched successfully", chargesList),
      );
  } catch (error) {
    return res.status(500).json(new responseModel(false, error.message));
  }
});

module.exports = router;
