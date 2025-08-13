const express = require("express");
const router = express.Router();
const {
  getContainer,
  getDetailsById,
  fetchAllItems,
  getDataByQuery,
  createRecord,
  updateRecord,
  formatDateCustom,
} = require("../services/cosmosService");
const {
  addProductTostores,
  addVariantToAllStores,
  enrichProductCatalogWithStock,
  getCombinedProductInfo,
  getProductAvailability,
} = require("../services/storeService");
const responseModel = require("../models/ResponseModel");
const {
  ContainerIds,
  productMessages,
  commonMessages,
  roles,
  storeMessage,
} = require("../constants");
const { v4: uuidv4 } = require("uuid");
const { authenticateToken, isAuthorizedUser } = require("../middleware/auth");
const {
  productSchema,
  categorySchema,
  variantSchema,
} = require("../models/productSchemas");
const { createDynamicSchema } = require("../models/userSchemas");
const productContainer = getContainer(ContainerIds.Products);
const categoryContainer = getContainer(ContainerIds.Categories);
const { logger } = require("../jobLogger");

router.post("/add", authenticateToken, async (req, res) => {
  try {
    const { id } = req.user;
    const authorized = await isAuthorizedUser(id, [
      roles.SystemAdmin,
      roles.StoreAdmin,
    ]);

    if (!authorized) {
      return res
        .status(400)
        .json(new responseModel(false, commonMessages.unauthorized));
    }

    const result = productSchema.safeParse(req.body); // Compare with req.body

    if (!result.success) {
      const errors = result.error.issues.map((err) => ({
        field: err.path.join("."),
        message: err.message,
      }));
      return res
        .status(400)
        .json(new responseModel(false, commonMessages.invalidFields, errors));
    }

    const {
      name,
      variantName,
      description,
      category,
      subCategory,
      bestSeller = false,
      frozen = false,
      readytoCook = false,
      insale = false,
      active = true,
      type,
      value,
      metrics,
      discount = 0,
      images = [],
      price,
      offerPrice = 0,
      rating = 0,
    } = req.body;

    if (!name || offerPrice === undefined || !images.length)
      return res
        .status(400)
        .json(new responseModel(false, commonMessages.badRequest));

    const newProduct = {
      id: uuidv4(),
      name,
      description,
      category,
      subCategory,
      bestSeller,
      frozen,
      readytoCook,
      insale,
      active,
      storeAdminId: id,
      rating,
      reviews: [],
      createdOn: formatDateCustom(new Date()),
    };

    newProduct.variants = [
      {
        id: uuidv4(),
        name: variantName ?? name,
        images: images,
        type: type,
        value: value,
        metrics,
        discount,
        isdefault: true,
      },
    ];

    const createdProduct = await createRecord(productContainer, newProduct);

    if (!createdProduct) {
      return res
        .status(500)
        .json(new responseModel(false, commonMessages.failed));
    }

    createdProduct.variants[0].price = price;
    createdProduct.variants[0].offerPrice = offerPrice;
    const response = await addProductTostores(createdProduct);
    if (!response.success) {
      return res
        .status(500)
        .json(new responseModel(true, storeMessage.notFound));
    }

    return res
      .status(201)
      .json(new responseModel(true, productMessages.success, createdProduct));
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(500).json(new responseModel(false, error.message));
  }
});

router.put("/update", authenticateToken, async (req, res) => {
  try {
    const authorized = await isAuthorizedUser(req.user.id, [
      roles.SystemAdmin,
      roles.StoreAdmin,
    ]);

    if (!authorized) {
      return res
        .status(400)
        .json(new responseModel(false, commonMessages.unauthorized));
    }

    const result = await createDynamicSchema(productSchema, req.body);

    if (!result.success) return res.status(400).json(result);

    const existingItem = await getDetailsById(productContainer, req.body.id);

    if (existingItem.storeAdminId !== req.user.id)
      return res
        .status(400)
        .json(new responseModel(false, commonMessages.unauthorized));

    Object.keys(req.body).forEach((key) => {
      if (
        ![
          "id",
          "variants",
          "variantName",
          "price",
          "offerPrice",
          "createdOn",
        ].includes(key)
      ) {
        existingItem[key] = req.body[key];
      }
    });

    const item = await updateRecord(productContainer, existingItem);

    return res
      .status(200)
      .json(new responseModel(true, productMessages.product.updated, item));
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(404).json(new responseModel(false, error.message));
  }
});

router.get("/getAll/:storeId", async (req, res) => {
  try {
    const storeId = req.params.storeId;
    const query = fetchProductQuery();
    const products = await getDataByQuery(productContainer, query);
    if (!products) {
      return res
        .status(404)
        .json(new responseModel(false, productMessages.notFound));
    }
    const enrichProducts = await enrichProductCatalogWithStock(
      products,
      storeId,
    );

    if (enrichProducts !== null && enrichProducts.length > 0) {
      return res
        .status(200)
        .json(new responseModel(true, productMessages.success, enrichProducts));
    } else {
      return res
        .status(404)
        .json(new responseModel(false, productMessages.notFound));
    }
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(500).json(new responseModel(false, error.message));
  }
});

router.get("/getDetails/:storeId/:itemId", async (req, res) => {
  try {
    const { itemId, storeId } = req.params;

    const item = await getDetailsById(productContainer, itemId);
    const updatedProduct = await getCombinedProductInfo(item, storeId);

    if (updatedProduct) {
      return res
        .status(200)
        .json(
          new responseModel(
            true,
            productMessages.product.success,
            updatedProduct,
          ),
        );
    } else {
      return res
        .status(404)
        .json(new responseModel(false, productMessages.product.notFound));
    }
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(404).json(new responseModel(false, error.message));
  }
});

router.get("/getCategories", async (req, res) => {
  try {
    const categoryItems = await fetchAllItems(categoryContainer);

    return res
      .status(200)
      .json(
        new responseModel(
          true,
          productMessages.categories.fetched,
          categoryItems,
        ),
      );
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(500).json(new responseModel(false, error.message));
  }
});

router.post("/createCategory", authenticateToken, async (req, res) => {
  try {
    const authorized = await isAuthorizedUser(req.user.id, [
      roles.SystemAdmin,
      roles.StoreAdmin,
    ]);

    if (!authorized) {
      return res
        .status(400)
        .json(new responseModel(false, commonMessages.unauthorized));
    }

    const result = categorySchema.safeParse(req.body); // Compare with req.body

    if (!result.success) {
      const errors = result.error.issues.map((err) => ({
        field: err.path.join("."),
        message: err.message,
      }));
      return res
        .status(400)
        .json(new responseModel(false, commonMessages.invalidFields, errors));
    }

    const { category, backgroundImage, logoImage } = req.body;

    const item = {
      id: uuidv4(),
      category,
      backgroundImage,
      logoImage,
      createdOn: formatDateCustom(new Date()),
    };

    const createdItem = await createRecord(categoryContainer, item);

    return res
      .status(200)
      .json(
        new responseModel(
          true,
          productMessages.categories.created,
          createdItem,
        ),
      );
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(500).json(new responseModel(false, error.message));
  }
});

router.get("/storeInventory/:id", async (req, res) => {
  try {
    const productId = req.params.id;
    if (!productId) {
      return res
        .status(400)
        .json(new responseModel(false, commonMessages.badRequest));
    }
    const productInventroyDetails = await getProductAvailability(productId);
    if (!productInventroyDetails && productInventroyDetails.length <= 0) {
      return res
        .status(500)
        .json(new responseModel(false, commonMessages.failed));
    }
    return res
      .status(200)
      .json(
        new responseModel(
          true,
          commonMessages.success,
          productInventroyDetails,
        ),
      );
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    res.status(500).json(new responseModel(false, commonMessages.error));
  }
});

router.get("/storeAdmin/:id", authenticateToken, async (req, res) => {
  try {
    const storeAdminId = req.params.id;
    const querySpec = {
      query: "SELECT * FROM c WHERE c.storeAdminId = @storeAdminId",
      parameters: [
        {
          name: "@storeAdminId",
          value: storeAdminId,
        },
      ],
    };
    const products = await getDataByQuery(productContainer, querySpec);

    if (products !== null && products.length > 0) {
      return res
        .status(200)
        .json(new responseModel(true, productMessages.success, products));
    } else {
      return res
        .status(404)
        .json(new responseModel(false, productMessages.notFound));
    }
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(500).json(new responseModel(false, error.message));
  }
});

router.get("/byCategory/:category", async (req, res) => {
  try {
    const category = req.params.category;
    const querySpec = {
      query:
        "SELECT c.id, c.name, c.price, c.description, c.stock, c.imageUrl, c.storeAdminId FROM c WHERE c.category = @category",
      parameters: [
        {
          name: "@category",
          value: category,
        },
      ],
    };
    const products = await getDataByQuery(productContainer, querySpec);
    if (products.length > 0) {
      return res.json(
        new responseModel(true, productMessages.success, products),
      );
    } else {
      res.status(404).json(new responseModel(false, productMessages.notFound));
    }
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    res.status(500).json(new responseModel(false, error.message));
  }
});

router.post("/addReview", authenticateToken, async (req, res) => {
  try {
    const { id, reviewUser, comment, rating } = req.body;

    const product = await getDetailsById(productContainer, id);

    if (!product) {
      return res
        .status(404)
        .json(new responseModel(false, productMessages.product.notFound));
    }

    if (!product.reviews) {
      product.reviews = [];
    }

    const newReview = {
      reviewId: uuidv4(),
      rating,
      reviewUser,
      commentDate: formatDateCustom(new Date()),
      helpfulreviewCount: 0,
      unhelpfulreviewCount: 0,
      comment,
    };

    product.reviews.push(newReview);

    if (!product.rating) {
      product.rating = 0;
    }

    const productRatings = product.reviews.map((item) => item.rating);
    const total = productRatings.reduce(
      (sum, productRatings) => sum + productRatings,
      0,
    );

    const averageRating = (total / productRatings.length).toFixed(1);

    product.rating = averageRating;

    const updatedProduct = await updateRecord(productContainer, product);
    if (!updatedProduct) {
      return res
        .status(500)
        .json(new responseModel(false, commonMessages.failed));
    }

    return res
      .status(201)
      .json(
        new responseModel(true, productMessages.review.thanks, updatedProduct),
      );
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(500).json(new responseModel(false, error.message));
  }
});

router.post("/addReplyToReview", authenticateToken, async (req, res) => {
  try {
    const { id, reviewId, replyUser, comment } = req.body;

    const product = await getDetailsById(productContainer, id);

    if (!product) {
      return res
        .status(404)
        .json(new responseModel(false, productMessages.product.notFound));
    }

    const targetReview = product.reviews.find((r) => r.reviewId === reviewId);

    if (!targetReview) {
      return res
        .status(404)
        .json(new responseModel(false, productMessages.review.notFound));
    }

    if (!targetReview.reply) {
      targetReview.reply = [];
    }

    const newReply = {
      replyId: uuidv4(),
      replyUser,
      commentDate: formatDateCustom(new Date()),
      comment,
    };

    targetReview.reply.push(newReply);

    const updatedProduct = await updateRecord(productContainer, product);

    return res
      .status(201)
      .json(
        new responseModel(
          true,
          productMessages.review.replysuccess,
          updatedProduct,
        ),
      );
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(500).json(new responseModel(false, error.message));
  }
});

router.post("/addVoteToReview", authenticateToken, async (req, res) => {
  try {
    const { id, reviewId, userName, helpful, unhelpful } = req.body;

    const product = await getDetailsById(productContainer, id);

    if (!product) {
      return res
        .status(404)
        .json(new responseModel(false, productMessages.product.notFound));
    }

    const targetReview = product.reviews.find((r) => r.reviewId === reviewId);

    if (!targetReview) {
      return res
        .status(404)
        .json(new responseModel(false, productMessages.review.notFound));
    }

    if (helpful && unhelpful) {
      return res
        .status(404)
        .json(new responseModel(false, commonMessages.forbidden));
    }
    const vote = {
      voteId: uuidv4(),
      userName,
      voteTime: formatDateCustom(new Date()),
    };

    const hasVotedHelpful = targetReview.helpful.some(
      (r) => r.userName === userName,
    );
    const hasVotedUnhelpful = targetReview.unhelpful.some(
      (r) => r.userName === userName,
    );

    if (helpful) {
      if (hasVotedUnhelpful) {
        targetReview.unhelpful = targetReview.unhelpful.filter(
          (r) => r.userName !== userName,
        );
        targetReview.unhelpfulreviewCount--;
      }

      if (!hasVotedHelpful) {
        targetReview.helpful.push(vote);
        targetReview.helpfulreviewCount++;
      }
    } else if (unhelpful) {
      if (hasVotedHelpful) {
        targetReview.helpful = targetReview.helpful.filter(
          (r) => r.userName !== userName,
        );
        targetReview.helpfulreviewCount--;
      }

      if (!hasVotedUnhelpful) {
        targetReview.unhelpful.push(vote);
        targetReview.unhelpfulreviewCount++;
      }
    } else {
      if (hasVotedHelpful) {
        targetReview.helpful = targetReview.helpful.filter(
          (r) => r.userName !== userName,
        );
        targetReview.helpfulreviewCount--;
      }
      if (hasVotedUnhelpful) {
        targetReview.unhelpful = targetReview.unhelpful.filter(
          (r) => r.userName !== userName,
        );
        targetReview.unhelpfulreviewCount--;
      }
    }
    const updatedProduct = await updateRecord(productContainer, product);

    return res
      .status(201)
      .json(
        new responseModel(true, productMessages.review.thanks, updatedProduct),
      );
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(500).json(new responseModel(false, error.message));
  }
});

router.post("/:id/variant/add", authenticateToken, async (req, res) => {
  try {
    const authorized = await isAuthorizedUser(req.user.id, [
      roles.SystemAdmin,
      roles.StoreAdmin,
    ]);

    if (!authorized) {
      return res
        .status(400)
        .json(new responseModel(false, commonMessages.unauthorized));
    }

    const result = variantSchema.safeParse(req.body); // Compare with req.body

    if (!result.success) {
      const errors = result.error.issues.map((err) => ({
        field: err.path.join("."),
        message: err.message,
      }));
      return res
        .status(400)
        .json(new responseModel(false, commonMessages.invalidFields, errors));
    }

    const productId = req.params.id;

    const {
      name,
      price,
      offerPrice,
      images = [],
      type,
      value,
      metrics,
      discount,
    } = req.body;

    const product = await getDetailsById(productContainer, productId);

    if (!product) {
      return res
        .status(404)
        .json(new responseModel(false, productMessages.product.notFound));
    }

    if (product.storeAdminId !== req.user.id)
      return res
        .status(400)
        .json(new responseModel(false, commonMessages.unauthorized));

    if (!product.variants) {
      product.variants = [];
    }

    const variant = {
      id: uuidv4(),
      name,
      images,
      type,
      value,
      metrics,
      discount,
      isdefault: false,
    };

    product.variants.push(variant);
    product.stock = product.variants.reduce(
      (total, variant) => total + variant.stock,
      0,
    );

    const updatedProduct = await updateRecord(productContainer, product);

    if (updatedProduct) {
      variant.productId = productId;
      variant.price = price;
      variant.offerPrice = offerPrice;
      const response = await addVariantToAllStores(variant);
      if (!response.success) {
        return res.status(500).json(response);
      }
    }
    return res
      .status(200)
      .json(
        new responseModel(true, productMessages.variant.added, updatedProduct),
      );
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(500).json(new responseModel(false, error.message));
  }
});

router.get("/:productId/variants/:variantId", async (req, res) => {
  try {
    const { productId, variantId } = req.params;

    const product = await getDetailsById(productContainer, productId);

    if (!product) {
      return res
        .status(404)
        .json(new responseModel(false, productMessages.product.notFound));
    }
    const variant = product.variants.filter((r) => r.id == variantId);

    if (!variant) {
      return res
        .status(404)
        .json(new responseModel(false, productMessages.variant.notFound));
    }
    return res
      .status(200)
      .json(new responseModel(true, productMessages.variant.fetched, variant));
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(500).json(new responseModel(false, error.message));
  }
});

router.get("/:productId/variants", async (req, res) => {
  try {
    const productId = req.params.productId;

    const querySpec = {
      query: "SELECT c.variants FROM c WHERE c.id = @productId",
      parameters: [{ name: "@productId", value: productId }],
    };

    const variants = await getDataByQuery(productContainer, querySpec);

    if (Array.isArray(variants) && variants.length === 0) {
      return res
        .status(404)
        .json(new responseModel(false, productMessages.variant.notFound));
    }

    return res
      .status(200)
      .json(new responseModel(true, productMessages.variant.fetched, variants));
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(500).json(new responseModel(false, error.message));
  }
});

router.put(
  "/:productId/variants/:variantId/update",
  authenticateToken,
  async (req, res) => {
    try {
      const authorized = await isAuthorizedUser(req.user.id, [
        roles.SystemAdmin,
        roles.StoreAdmin,
      ]);

      if (!authorized) {
        return res
          .status(400)
          .json(new responseModel(false, commonMessages.unauthorized));
      }

      const result = await createDynamicSchema(variantSchema, req.body);

      if (!result.success) return res.status(400).json(result);

      const { productId, variantId } = req.params;
      const productItem = await getDetailsById(productContainer, productId);

      if (!productItem)
        return res
          .status(404)
          .json(new responseModel(false, productMessages.product.notFound));

      if (productItem.storeAdminId !== req.user.id)
        return res
          .status(400)
          .json(new responseModel(false, commonMessages.unauthorized));

      const variantItem = productItem.variants.find((r) => r.id === variantId);

      Object.keys(req.body).forEach((key) => {
        if (key !== "id") {
          variantItem[key] = req.body[key];
        }
      });

      productItem.stock = productItem.variants.reduce(
        (total, variant) => total + variant.stock,
        0,
      );

      const item = await updateRecord(productContainer, productItem);

      return res
        .status(200)
        .json(new responseModel(true, productMessages.variant.updated, item));
    } catch (error) {
      logger.error(commonMessages.errorOccured, error);
      return res.status(500).json(new responseModel(false, error.message));
    }
  },
);

router.get("/paginated/:storeId", async (req, res) => {
  try {
    let { page, limit } = req.body;
    const storeId = req.params.storeId;
    page = parseInt(req.query.page) || 1;
    limit = parseInt(req.query.limit) | 10;

    if (!storeId) {
      return res
        .status(404)
        .json(new responseModel(false, commonMessages.badRequest));
    }

    const productQuery = await fetchProductQuery();

    const querySpec = {
      query: `${productQuery} OFFSET @offset LIMIT @limit`,
      parameters: [
        { name: "@offset", value: (page - 1) * limit },
        { name: "@limit", value: limit },
      ],
    };

    let paginatedProducts = await getDataByQuery(productContainer, querySpec);

    if (!global.productCountCache) {
      global.productCountCache = {};
    }
    const cacheKey = "totalProductCount";
    let totalProducts;
    const now = Date.now();
    const cacheEntry = global.productCountCache[cacheKey];

    if (cacheEntry && now - cacheEntry.timestamp < 2 * 60 * 60 * 1000) {
      totalProducts = cacheEntry.value;
    } else {
      const countQuery = {
        query: "SELECT VALUE COUNT(1) FROM c",
      };

      const totalCountArr = await getDataByQuery(productContainer, countQuery);
      totalProducts = totalCountArr[0] || 0;
      global.productCountCache[cacheKey] = {
        value: totalProducts,
        timestamp: now,
      };
    }
    const totalPages = Math.ceil(totalProducts / limit);
    const hasNextPage = page < totalPages;

    if (paginatedProducts.length === 0 && !hasNextPage) {
      return res
        .status(404)
        .json(new responseModel(false, productMessages.notFound));
    }

    paginatedProducts = await enrichProductCatalogWithStock(
      paginatedProducts,
      storeId,
    );

    return res.status(200).json(
      new responseModel(true, productMessages.success, {
        products: paginatedProducts,
        page,
        limit,
        totalProducts,
        totalPages,
        hasNextPage,
      }),
    );
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(500).json(new responseModel(false, commonMessages.error));
  }
});

router.post("/getProducts", async (req, res) => {
  try {
    let { page, itemsRequest, name, categories = [], storeId } = req.body;
    page = parseInt(page) || 1;
    itemsRequest = parseInt(itemsRequest) || 10;
    name = name ? name.trim().toLowerCase() : null;
    const limit = itemsRequest + 1;
    if (!storeId) {
      return res
        .status(404)
        .json(new responseModel(false, commonMessages.badRequest));
    }

    if (categories) {
      if (typeof categories === "string") {
        categories = categories.split(",").map((c) => c.trim());
      }
    } else {
      categories = [];
    }

    const productQuery = fetchProductQuery();
    let query = `${productQuery} WHERE 1=1`;
    const params = [];

    if (name) {
      query += " AND CONTAINS(LOWER(c.name), @name)";
      params.push({ name: "@name", value: name });
    }

    if (categories.length > 0) {
      const categoryParams = categories.map((cat, idx) => {
        const paramName = `@category${idx}`;
        params.push({ name: paramName, value: cat });
        return paramName;
      });
      query += ` AND c.category IN (${categoryParams.join(", ")})`;
    }

    query += " OFFSET @offset LIMIT @limit";
    params.push({ name: "@offset", value: (page - 1) * limit });
    params.push({ name: "@limit", value: limit });

    const querySpec = { query, parameters: params };
    const products = await getDataByQuery(productContainer, querySpec);

    const hasNextPage = itemsRequest < products.length;
    let requstedProducts = products ? products.slice(0, itemsRequest) : null;
    requstedProducts = await enrichProductCatalogWithStock(
      requstedProducts,
      storeId,
    );

    return res.status(200).json(
      new responseModel(true, productMessages.success, {
        products: requstedProducts,
        page,
        hasNextPage,
      }),
    );
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(500).json(new responseModel(false, error.message));
  }
});

const fetchProductQuery = () => {
  const query =
    "SELECT c.id, c.name, c.description, c.category, c.discount, c.subCategory, c.bestSeller, c.frozen, c.readytoCook, c.insale, c.rating, c.variants FROM c";
  return query;
};

module.exports = router;
