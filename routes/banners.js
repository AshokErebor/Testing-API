const express = require("express");
const router = express.Router();
const { logger } = require("../jobLogger");
const { bannerSchema } = require("../models/productSchemas");
const {
  commonMessages,
  ContainerIds,
  roles,
  bannerMessages,
} = require("../constants");
const {
  createRecord,
  updateRecord,
  deleteRecord,
  getContainer,
  getDetailsById,
} = require("../services/cosmosService");
const path = require("path");
const { deleteFile } = require("../services/userService");
const bannerContainer = getContainer(ContainerIds.Banners);
const responseModel = require("../models/ResponseModel");
const { v4: uuidv4 } = require("uuid");
const { convertUTCtoIST } = require("../utils/schedules");
const { authenticateToken, isAuthorizedUser } = require("../middleware/auth");

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

    const result = bannerSchema.safeParse(req.body); // Compare with req.body

    if (!result.success) {
      const errors = result.error.issues.map((err) => ({
        field: err.path.join("."),
        message: err.message,
      }));

      return res
        .status(400)
        .json(new responseModel(false, commonMessages.invalidFields, errors));
    }

    const { bannerName, image, screenName, params, dynamic, isActive } =
      result.data;

    const newBanner = {
      id: uuidv4(),
      bannerName,
      image,
      screenName,
      params,
      dynamic,
      isActive,
      storeAdminId: id,
      createdOn: convertUTCtoIST(new Date().toISOString()),
    };

    const isCreated = await createRecord(bannerContainer, newBanner);

    if (!isCreated) {
      return res
        .status(500)
        .json(new responseModel(false, commonMessages.failed));
    }

    return res
      .status(201)
      .json(new responseModel(true, bannerMessages.created));
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(500).json(new responseModel(false, error.message));
  }
});

router.post("/update", authenticateToken, async (req, res) => {
  try {
    const { id } = req.user;

    const authorized = await isAuthorizedUser(id, [
      roles.SystemAdmin,
      roles.StoreAdmin,
    ]);

    if (!authorized)
      return res
        .status(400)
        .json(new responseModel(false, commonMessages.unauthorized));

    const result = bannerSchema.safeParse(req.body); // Compare with req.body

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
      id: bannerId,
      bannerName,
      image,
      screenName,
      params,
      dynamic,
      isActive,
    } = result.data;

    const existingBanner = await getDetailsById(bannerContainer, bannerId);

    if (!existingBanner) {
      return res
        .status(404)
        .json(new responseModel(false, bannerMessages.notFound));
    }

    if (existingBanner.storeAdminId !== id)
      return res
        .status(400)
        .json(new responseModel(false, commonMessages.unauthorized));

    const updatedBanner = {
      ...existingBanner,
      bannerName,
      image,
      screenName,
      params,
      dynamic,
      isActive,
    };

    const isUpdated = await updateRecord(bannerContainer, updatedBanner);

    if (!isUpdated) {
      return res
        .status(400)
        .json(new responseModel(false, commonMessages.failed));
    }

    return res
      .status(200)
      .json(new responseModel(true, bannerMessages.updated));
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(500).json(new responseModel(false, error.message));
  }
});

router.get("/delete/:id", authenticateToken, async (req, res) => {
  try {
    const { id } = req.user;
    const authorized = await isAuthorizedUser(id, [
      roles.StoreAdmin,
      roles.SystemAdmin,
    ]);

    if (!authorized) {
      return res
        .status(403)
        .json(new responseModel(false, commonMessages.forbidden));
    }

    const { id: bannerId } = req.params;

    const bannerDetails = await getDetailsById(bannerContainer, bannerId);

    if (!bannerDetails)
      return res
        .status(404)
        .json(new responseModel(false, bannerMessages.notFound));

    if (bannerDetails.storeAdminId !== id)
      return res
        .status(400)
        .json(new responseModel(false, commonMessages.unauthorized));

    const fileName = path.basename(bannerDetails.image);

    const isFileDeleted = await deleteFile(fileName);

    if (!isFileDeleted)
      return res
        .status(500)
        .json(new responseModel(false, commonMessages.failed));

    const deleteBanner = await deleteRecord(bannerContainer, bannerDetails.id);

    if (!deleteBanner)
      return res
        .status(500)
        .json(new responseModel(false, commonMessages.failed));

    return res
      .status(200)
      .json(new responseModel(true, bannerMessages.deleted));
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(500).json(new responseModel(false, error.message));
  }
});

router.get("/getAllBanners", async (req, res) => {
  try {
    const querySpec = {
      query:
        "SELECT c.id, c.bannerName, c.image, c.params, c.screenName, c.dynamic, c.isActive FROM c",
    };

    const { resources } = await bannerContainer.items
      .query(querySpec)
      .fetchAll();

    return res
      .status(200)
      .json(new responseModel(true, bannerMessages.fetched, resources));
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(500).json(new responseModel(false, error.message));
  }
});

router.get("/getActiveBanners", async (req, res) => {
  try {
    const querySpec = {
      query:
        "SELECT c.id, c.bannerName, c.image, c.params, c.screenName, c.dynamic, c.isActive FROM c WHERE c.isActive = true",
    };

    const { resources } = await bannerContainer.items
      .query(querySpec)
      .fetchAll();

    return res
      .status(200)
      .json(new responseModel(true, bannerMessages.fetched, resources));
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(500).json(new responseModel(false, error.message));
  }
});

router.get("/getBannerById/:id", async (req, res) => {
  try {
    const querySpec = {
      query:
        "SELECT c.id, c.bannerName, c.image, c.screenName, c.dynamic, c.isActive FROM c where c.id = @id",
      parameters: [
        {
          name: "@id",
          value: req.params.id,
        },
      ],
    };

    const { resources } = await bannerContainer.items
      .query(querySpec)
      .fetchAll();

    return res
      .status(200)
      .json(new responseModel(true, bannerMessages.fetched, resources));
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(500).json(new responseModel(false, error.message));
  }
});

module.exports = router;
