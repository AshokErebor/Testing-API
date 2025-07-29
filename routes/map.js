const express = require("express");
const ResponseModel = require("../models/ResponseModel");
const router = express.Router();
const axios = require("axios");
const { commonMessages, storeMessage, mapMessage } = require("../constants");
const { getNearestStore, getTravelTime } = require("../services/mapService");
const { logger } = require("../jobLogger");

router.get("/duration", async (req, res) => {
  try {
    const { origin, destination } = req.body;
    if (!origin || !destination)
      return res
        .status(400)
        .json(new ResponseModel(false, commonMessages.badRequest));

    const result = await getTravelTime(origin, destination);

    if (result) {
      return res
        .status(200)
        .json(new ResponseModel(true, mapMessage.dataFetched, result));
    }
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(500).json(new ResponseModel(false, error.message));
  }
});

router.get("/location", async (req, res) => {
  try {
    const { address } = req.body;
    if (!address) {
      return res
        .status(400)
        .json(new ResponseModel(false, commonMessages.badRequest));
    }
    const apiKey = process.env.GOOGLE_API_KEY;
    const encodedAddress = encodeURIComponent(address);
    const url = `${process.env.GOOGLE_URL}/geocode/json?address=${encodedAddress}&key=${apiKey}`;
    const response = await axios.get(url);
    const data = response.data;

    if (data.status === "OK") {
      const result = data.results[0];
      const formattedAddress = result.formatted_address;
      const location = result.geometry.location;
      const components = result.address_components;
      let city = "";
      let area = "";

      components.forEach((component) => {
        if (component.types.includes(mapMessage.locality)) {
          city = component.long_name;
        }

        if (
          component.types.includes(mapMessage.sublocality) ||
          component.types.includes(mapMessage.neighbourhood)
        ) {
          area = component.long_name;
        }
      });
      const currentLocation = {
        area,
        city,
      };

      const userAddress = {
        currentAddress: formattedAddress,
        currenLocationCoords: location,
        currentLocation: currentLocation,
      };

      return res
        .status(200)
        .json(new ResponseModel(true, commonMessages.success, userAddress));
    } else {
      logger.error(commonMessages.errorOccured, data.status);
    }
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(200).json(new ResponseModel(false, error.message));
  }
});

router.post("/nearestStore", async (req, res) => {
  try {
    const { origin } = req.body;
    if (!origin) {
      return res
        .status(400)
        .json(new ResponseModel(false, commonMessages.badRequest));
    }

    const store = await getNearestStore(origin);
    if (!store) {
      return res
        .status(404)
        .json(new ResponseModel(false, storeMessage.notFound));
    }

    return res
      .status(200)
      .json(new ResponseModel(true, storeMessage.success, store));
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(500).json(new ResponseModel(false, commonMessages.error));
  }
});

module.exports = router;
