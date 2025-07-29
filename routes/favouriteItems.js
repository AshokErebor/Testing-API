const express = require("express");
const router = express.Router();
const { authenticateToken } = require("../middleware/auth");
const { logger } = require("../jobLogger");
const {
  getContainer,
  getUserDetails,
  createRecord,
  updateRecord,
} = require("../services/cosmosService");
const responseModel = require("../models/ResponseModel");
const {
  ContainerIds,
  commonMessages,
  productMessages,
} = require("../constants");
const favouriteitemsContainer = getContainer(ContainerIds.FavouriteItems);

//API to add the Product to cart (or) increase product quantity in cart.
router.post("/add", authenticateToken, async (req, res) => {
  try {
    const { productId } = req.body;

    const phone = req.user.phone;

    if (phone === "" || productId === "")
      return res
        .status(400)
        .json(new responseModel(false, commonMessages.badRequest));

    const user = await getUserDetails(favouriteitemsContainer, phone);

    if (!user) {
      const productDetails = {
        phone: phone,
        products: [productId],
      };

      const createdItem = await createRecord(
        favouriteitemsContainer,
        productDetails,
      );
      if (!createdItem) {
        return res
          .status(500)
          .json(new responseModel(false, commonMessages.failed));
      }

      return res
        .status(200)
        .json(
          new responseModel(true, productMessages.product.favouriteSuccess),
        );
    } else {
      if (!user.products.includes(productId)) {
        user.products.push(productId);
        const updatedItem = await updateRecord(favouriteitemsContainer, user);
        if (!updatedItem) {
          return res
            .status(500)
            .json(new responseModel(false, commonMessages.failed));
        }

        return res
          .status(200)
          .json(
            new responseModel(true, productMessages.product.favouriteSuccess),
          );
      }
    }
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(500).json(new responseModel(false, error.message));
  }
});

//API to decrease product quantity in cart
router.post("/remove", authenticateToken, async (req, res) => {
  try {
    const { productId } = req.body;

    const phone = req.user.phone;

    if (phone === "" || productId === "")
      return res
        .status(400)
        .json(new responseModel(false, commonMessages.badRequest));

    const user = await getUserDetails(favouriteitemsContainer, phone);

    user.products = user.products.filter((item) => item !== productId);

    const resource = await updateRecord(favouriteitemsContainer, user);
    if (!resource) {
      return res
        .status(500)
        .json(new responseModel(false, commonMessages.failed));
    }

    return res
      .status(200)
      .json(
        new responseModel(
          true,
          productMessages.product.favouriteRemove,
          resource.products,
        ),
      );
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(500).json(new responseModel(false, error.message));
  }
});

//API to get favourites details specific to user
router.get("/view", authenticateToken, async (req, res) => {
  try {
    const phone = req.user.phone;

    if (phone === "")
      return res
        .status(400)
        .json(new responseModel(false, commonMessages.badRequest));

    const { products } = await getUserDetails(favouriteitemsContainer, phone);

    return res
      .status(200)
      .json(
        new responseModel(
          true,
          productMessages.product.favouriteFetched,
          products,
        ),
      );
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(500).json(new responseModel(false, error.message));
  }
});

module.exports = router;
