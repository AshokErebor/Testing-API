const express = require("express");
const router = express.Router();
const { v4: uuidv4 } = require("uuid"); // to generate unique ids
const { authenticateToken, isAuthorizedUser } = require("../middleware/auth");
const {
  getContainer,
  getUserDetails,
  getDetailsByEmail,
  createRecord,
  getDetailsById,
  fetchAllItems,
  updateRecord,
} = require("../services/cosmosService");
const {
  addStoreProducts,
  getStoresByStoreAdminId,
} = require("../services/storeService");
const {
  ContainerIds,
  userMessages,
  commonMessages,
  storeMessage,
  roles,
} = require("../constants");
const responseModel = require("../models/ResponseModel");
const storeContainer = getContainer(ContainerIds.StoreDetails);
const { storeSchema } = require("../models/storeSchemas");
const { createDynamicSchema } = require("../models/userSchemas");
const { logger } = require("../jobLogger");
const { convertUTCtoIST } = require("../utils/schedules");

router.post("/create", authenticateToken, async (req, res) => {
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

    const result = storeSchema.safeParse(req.body); // Compare with req.body

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
      storeName,
      email,
      phone,
      address = {},
      storeManagerDetails = {},
      GSTIN,
      GSTCertificate,
      CIN,
      CINCertificate,
      workingDays,
      workingStartTime,
      workingEndTime,
      deliveryCharges = 0,
      packagingCharges = 0,
      platformCharges = 0,
      deliveryRange = 0,
      freeDeliveryRange = 0,
    } = req.body;

    const storeAdminId = req.user.id;

    const existingStore = await getDetailsByEmail(storeContainer, email);

    let duplicateFields = [];

    if (existingStore)
      duplicateFields.push({
        field: "email",
        message: userMessages.emailExist,
      });

    let user = await getUserDetails(storeContainer, phone);

    if (user)
      duplicateFields.push({
        field: "phone",
        message: userMessages.phoneExist,
      });

    if (duplicateFields.length > 0)
      return res
        .status(400)
        .json(
          new responseModel(
            false,
            commonMessages.invalidFields,
            duplicateFields,
          ),
        );

    const newStore = {
      id: uuidv4(),
      storeName,
      email,
      phone,
      address: {
        address: address.address || "",
        coordinates: address.coordinates || "",
      },
      storeAdminId,
      storeManagerDetails,
      GSTIN,
      GSTCertificate,
      CIN,
      CINCertificate,
      storeStatus: req.body.storeStatus
        ? req.body.storeStatus
        : storeMessage.storeStatus.active,
      workingDays,
      workingStartTime,
      workingEndTime,
      deliveryCharges,
      packagingCharges,
      platformCharges,
      freeDeliveryRange,
      deliveryRange,
      isAuthorized: req.body.isAuthorized ? req.body.isAuthorized : "Approved",
      createdOn: convertUTCtoIST(new Date().toISOString()),
    };

    const store = await createRecord(storeContainer, newStore);

    if (store) {
      const response = await addStoreProducts(store.id);
      if (response.success) {
        return res
          .status(200)
          .json(new responseModel(true, storeMessage.created, store));
      }
    }
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(500).json(new responseModel(false, error.message));
  }
});

router.put("/update", authenticateToken, async (req, res) => {
  try {
    const result = await createDynamicSchema(
      storeSchema,
      req.body.storeDetails,
    );

    if (!result.success) return res.status(400).json(result);

    const { storeId, storeDetails } = req.body;

    const store = await getDetailsById(storeContainer, storeId);

    if (!store || store.length === 0)
      return res
        .status(404)
        .json(new responseModel(false, storeMessage.notFound));

    if (store.storeAdminId !== req.user.id)
      return res
        .status(400)
        .json(new responseModel(false, commonMessages.unauthorized));

    const updatedStore = { ...store, ...storeDetails };
    if (store.storeManagerDetails) {
      updatedStore.storeManagerDetails = {
        ...store.storeManagerDetails,
        ...(storeDetails.storeManagerDetails || {}),
      };
    }

    const storeUpdated = await updateRecord(storeContainer, updatedStore);

    if (!storeUpdated)
      return res
        .status(500)
        .json(new responseModel(false, commonMessages.failed));

    return res
      .status(200)
      .json(new responseModel(true, storeMessage.updated, storeUpdated));
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(500).json(new responseModel(false, error.message));
  }
});

router.get("/getStoreDetails/:storeId", authenticateToken, async (req, res) => {
  try {
    const id = req.params.storeId;
    const store = await getDetailsById(storeContainer, id);

    if (!store || store.length === 0)
      return res.status(404).json(
        new responseModel(false, commonMessages.badRequest, {
          field: "storeId",
          message: storeMessage.notFound,
        }),
      );

    return res
      .status(200)
      .json(new responseModel(true, storeMessage.success, store));
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(500).json(new responseModel(false, error.message));
  }
});

router.get("/getAll", authenticateToken, async (req, res) => {
  try {
    const stores = await fetchAllItems(storeContainer);

    if (!stores || stores.length === 0)
      return res
        .status(404)
        .json(new responseModel(false, storeMessage.notFound));

    return res
      .status(200)
      .json(new responseModel(true, storeMessage.storesFetched, stores));
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(500).json(new responseModel(false, error.message));
  }
});

router.get("/getStoresByStoreAdminId", authenticateToken, async (req, res) => {
  try {
    const storeAdminId = req.user.id;

    if (!storeAdminId)
      return res
        .status(400)
        .json(new responseModel(false, commonMessages.badRequest));

    const stores = await getStoresByStoreAdminId(storeContainer, storeAdminId);

    if (!stores || stores.length === 0)
      return res
        .status(404)
        .json(new responseModel(false, storeMessage.notFound));

    return res
      .status(200)
      .json(new responseModel(true, storeMessage.storesFetched, stores));
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(500).json(new responseModel(false, error.message));
  }
});

module.exports = router;
