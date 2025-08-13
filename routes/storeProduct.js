const express = require("express");
const router = express.Router();
const { getContainer, updateRecord } = require("../services/cosmosService");
const {
  addStoreProducts,
  getUsersByStoreId,
} = require("../services/storeService");
const {
  ContainerIds,
  storeMessage,
  commonMessages,
  productMessages,
} = require("../constants");
const { authenticateToken } = require("../middleware/auth");
const { storeProductSchema } = require("../models/productSchemas");
const storeProductId = "StoreProduct";
const storeProductContainer = getContainer(ContainerIds.StoreProduct);
const responseModel = require("../models/ResponseModel");
const { logger } = require("../jobLogger");

router.post("/create/:id", authenticateToken, async (req, res) => {
  try {
    const storeId = req.params.id;
    const response = await addStoreProducts(storeId);
    if (!response.success) {
      return res
        .status(200)
        .json(
          new responseModel(true, productMessages.product.added, response.data),
        );
    }
    return res.status(201).json(new responseModel(false, response.message));
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(500).json(new responseModel(false, error.message));
  }
});

router.put("/updateVariant", authenticateToken, async (req, res) => {
  try {
    const result = storeProductSchema.safeParse(req.body); // Compare with req.body

    if (!result.success) {
      const errors = result.error.issues.map((err) => ({
        field: err.path.join("."),
        message: err.message,
      }));
      return res
        .status(400)
        .json(new responseModel(false, commonMessages.invalidFields, errors));
    }

    const { storeId, productId, variantId, stock, offerPrice, price } =
      req.body;

    const resources = await getUsersByStoreId(storeProductId, storeId);

    if (resources.length === 0) {
      return res
        .status(404)
        .json(new responseModel(false, storeMessage.notFound));
    }

    const store = resources[0];
    const product = store.products.find((p) => p.productId === productId);

    if (!product) {
      return res
        .status(404)
        .json(new responseModel(false, productMessages.product.notFound));
    }

    const variant = product.variants.find((v) => v.variantId === variantId);

    if (!variant) {
      return res
        .status(404)
        .json(new responseModel(false, productMessages.variant.notFound));
    }

    variant.stock = stock ?? variant.stock;
    variant.offerPrice = offerPrice ?? variant.offerPrice;
    variant.price = price ?? variant.price;

    product.stock = product.variants.reduce(
      (total, variant) => total + variant.stock,
      0,
    );

    const resource = await updateRecord(storeProductContainer, store);
    if (!resource) {
      return res
        .status(500)
        .json(new responseModel(false, commonMessages.failed));
    }
    return res
      .status(200)
      .json(new responseModel(true, productMessages.variant.updated));
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(500).json(new responseModel(false, error.message));
  }
});

module.exports = router;
