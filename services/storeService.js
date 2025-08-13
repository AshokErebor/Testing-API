const {
  getContainer,
  fetchAllItems,
  getDataByQuery,
  createRecord,
  updateRecord,
  getDetailsById,
} = require("../services/cosmosService");
const responseModel = require("../models/ResponseModel");
const {
  ContainerIds,
  productMessages,
  commonMessages,
} = require("../constants");
const { logger } = require("../jobLogger");

const addProductTostores = async (product) => {
  try {
    const storeProductContainer = await getContainer(ContainerIds.StoreProduct);
    const storeProducts = await fetchAllItems(storeProductContainer);
    if (!storeProducts) {
      return new responseModel(false, commonMessages.failed);
    }

    for (const storeProduct of storeProducts) {
      storeProduct.products.push({
        productId: product.id,
        stock: 0,
        variants: product.variants.map((variant) => ({
          variantId: variant.id,
          stock: 0,
          price: variant.price,
          offerPrice: variant.offerPrice || 0,
        })),
      });
      const updatedItem = await updateRecord(
        storeProductContainer,
        storeProduct,
      );
      if (!updatedItem) {
        return new responseModel(false, commonMessages.failed);
      }
    }

    return new responseModel(true, commonMessages.success);
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return new responseModel(false, commonMessages.error);
  }
};

const addStoreProducts = async (storeId) => {
  try {
    const storeProductContainer = getContainer(ContainerIds.StoreProduct);
    const productContainer = getContainer(ContainerIds.Products);
    const products = await fetchAllItems(productContainer);

    const storeProducts = {
      storeId: storeId,
      products: products.map((product) => ({
        productId: product.id,
        stock: 0,
        variants: product.variants.map((variant) => ({
          variantId: variant.id,
          stock: 0,
          price: variant.price || 0,
          offerPrice: variant.offerPrice || 0,
        })),
      })),
    };
    const createdStoreProducts = await createRecord(
      storeProductContainer,
      storeProducts,
    );
    if (!createdStoreProducts) {
      return new responseModel(false, "Unable to create the storeProduct");
    }
    return new responseModel(
      true,
      productMessages.success,
      createdStoreProducts,
    );
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return new responseModel(false, error.message);
  }
};

const getUsersByStoreId = async (containerId, storeId) => {
  try {
    const container = getContainer(containerId);
    const querySpec = {
      query: "SELECT * FROM c WHERE c.storeId = @storeId",
      parameters: [{ name: "@storeId", value: storeId }],
    };

    const resources = await getDataByQuery(container, querySpec);
    return resources;
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return null;
  }
};

const addVariantToAllStores = async (newVariant) => {
  try {
    const storeProductContainer = getContainer(ContainerIds.StoreProduct);
    const storeProducts = await fetchAllItems(storeProductContainer);
    if (!storeProducts) {
      return new responseModel(false, commonMessages.errorOccured);
    }

    for (const storeProduct of storeProducts) {
      const product = storeProduct.products.find(
        (r) => r.productId === newVariant.productId,
      );
      if (!product) {
        return new responseModel(false, productMessages.product.notFound);
      }
      product.variants.push({
        variantId: newVariant.id,
        stock: 0,
        price: newVariant.price,
        offerPrice: newVariant.offerPrice,
      });
      const update = await updateRecord(storeProductContainer, storeProduct);
      if (!update) {
        return new responseModel(false, commonMessages.failed);
      }
    }
    return new responseModel(true, commonMessages.success);
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return new responseModel(false, error.message);
  }
};

async function enrichProductCatalogWithStock(productCatalog, storeId) {
  try {
    const stores = await getUsersByStoreId(ContainerIds.StoreProduct, storeId);

    if (!stores || stores.length === 0) {
      return null;
    }

    const store = stores[0];

    const inventoryMap = new Map();

    store.products.forEach((product) => {
      inventoryMap.set(product.productId, {
        productStock: Number(product.stock),
        variants: new Map(
          product.variants.map((v) => [
            v.variantId,
            {
              stock: Number(v.stock),
              price: v.price,
              offerPrice: v.offerPrice,
            },
          ]),
        ),
      });
    });

    const enrichedCatalog = productCatalog.map((product) => {
      const inv = inventoryMap.get(product.id);
      const variantsArray = product.variants || product.Variants || [];

      if (!inv) {
        return {
          ...product,
          productStock: 0,
          variants: variantsArray.map((variant) => ({
            ...variant,
            stock: 0,
            price: variant.price || 0,
            offerPrice: variant.offerPrice || 0,
          })),
        };
      }

      return {
        ...product,
        productStock: inv.productStock,
        variants: variantsArray.map((variant) => {
          const variantId = variant.variantId || variant.id;
          const invVariant = inv.variants.get(variantId);
          return {
            ...variant,
            stock: invVariant ? invVariant.stock : 0,
            price: invVariant ? invVariant.price : variant.price || 0,
            offerPrice: invVariant
              ? invVariant.offerPrice
              : variant.offerPrice || 0,
          };
        }),
      };
    });

    return enrichedCatalog;
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return null;
  }
}

const getStoresByStoreAdminId = async (container, storeAdminId) => {
  try {
    const querySpec = {
      query: "SELECT * FROM c WHERE c.storeAdminId = @storeAdminId",
      parameters: [{ name: "@storeAdminId", value: storeAdminId }],
    };

    const resources = await getDataByQuery(container, querySpec);
    return resources;
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return [];
  }
};

async function getCombinedProductInfo(product, storeId) {
  try {
    const inventories = await getUsersByStoreId(
      ContainerIds.StoreProduct,
      storeId,
    );

    if (!inventories || inventories.length === 0) {
      return null;
    }

    const inventoryProduct = inventories[0]?.products?.find(
      (p) => p.productId === product.id,
    );

    if (!inventoryProduct) return null;

    return mergeProductWithInventory(product, inventoryProduct);
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return null;
  }
}

async function getProductAvailability(productId) {
  try {
    const storeContainer = getContainer(ContainerIds.StoreDetails);
    const inventoryContainer = getContainer(ContainerIds.StoreProduct);
    const productDetailsContainer = getContainer(ContainerIds.Products);

    const [stores, inventories, productMeta] = await Promise.all([
      fetchAllItems(storeContainer),
      fetchAllItems(inventoryContainer),
      getDetailsById(productDetailsContainer, productId),
    ]);

    const variantMetaMap = new Map();
    productMeta.variants.forEach((v) => {
      variantMetaMap.set(v.id, v);
    });

    const availability = [];

    inventories.forEach((storeInventory) => {
      const product = storeInventory.products.find(
        (p) => p.productId === productId,
      );

      if (product) {
        const storeDetails = stores.find(
          (s) => s.id === storeInventory.storeId,
        );

        if (storeDetails) {
          const variantList = product.variants.map((variant) => {
            const meta = variantMetaMap.get(variant.variantId) || {};
            return {
              variantId: variant.variantId,
              name: meta?.name ?? "",
              price: variant.price,
              offerPrice: variant.offerPrice,
              images: meta?.images,
              stock: variant.stock,
              type: meta?.type,
              value: meta?.value,
              metrics: meta?.metrics,
              isdefault: meta?.isdefault ?? false,
            };
          });

          availability.push({
            storeId: storeDetails.id,
            storeName: storeDetails.storeName,
            variants: variantList,
          });
        }
      }
    });

    return {
      productId: productMeta.id,
      productName: productMeta.name,
      category: productMeta.category,
      subCategory: productMeta.subCategory,
      description: productMeta.description,
      bestSeller: productMeta.bestSeller,
      frozen: productMeta.frozen,
      readytoCook: productMeta.readytoCook,
      insale: productMeta.insale,
      active: productMeta.active,
      createdOn: productMeta.createdOn,
      productStock: productMeta.stock,
      availability,
    };
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return null;
  }
}

function mergeProductWithInventory(product, inventoryProduct) {
  try {
    const mergedVariants = product.variants.map((variant) => {
      const invVariant = inventoryProduct?.variants?.find(
        (v) => v.variantId === variant.id,
      );

      return {
        id: variant.id,
        name: variant.name,
        price: invVariant?.price ?? null,
        offerPrice: invVariant?.offerPrice ?? null,
        stock: invVariant?.stock ?? 0,
        isDefault: variant.isDefault ?? false,
        images: variant.images,
        type: variant.type ?? null,
        value: variant.value ?? null,
        metrics: variant.metrics ?? null,
      };
    });

    return {
      id: product.id,
      name: product.name,
      description: product.description,
      category: product.category,
      subCategory: product.subCategory,
      readyToCook: product.readyToCook,
      bestSeller: product.bestSeller,
      frozen: product.frozen,
      readytoCook: product.readytoCook,
      insale: product.insale,
      createdOn: product.createdOn,
      totalStock: inventoryProduct?.stock ?? 0,
      variants: mergedVariants,
    };
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
  }
}

const getIdbyStoreadmin = (storeAdminId) => {
  try {
    const storeContainer = getContainer(ContainerIds.StoreDetails);
    const querySpec = {
      query:
        "SELECT c.id, c.storeStatus FROM c WHERE c.storeAdminId = @storeAdminId",
      parameters: [{ name: "@storeAdminId", value: storeAdminId }],
    };

    const storeIds = getDataByQuery(storeContainer, querySpec);
    if (storeIds && storeIds.length === 0) {
      return null;
    }
    return storeIds;
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return null;
  }
};

module.exports = {
  addProductTostores,
  addStoreProducts,
  getUsersByStoreId,
  addVariantToAllStores,
  enrichProductCatalogWithStock,
  getStoresByStoreAdminId,
  getCombinedProductInfo,
  getProductAvailability,
  getIdbyStoreadmin,
};
