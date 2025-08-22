const {
  getContainer,
  getDataByQuery,
  fetchAllItems,
} = require("../services/cosmosService");
const axios = require("axios");
const { ContainerIds, commonMessages, mapMessage } = require("../constants");
const { logger } = require("../jobLogger");

async function getNearestStore(origin) {
  try {
    // const area = await getCurentArea(origin);
    const storeContainer = getContainer(ContainerIds.StoreDetails);
    const storeAddresses = await fetchAllItems(storeContainer);
    if (!storeAddresses || storeAddresses.length === 0) return null;
    const nearestStore = await findNearestAddress(origin, storeAddresses);
    if (nearestStore) {
      return nearestStore;
    } else {
      return null;
    }
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
  }
}

const haversineDistance = (coord1, coord2) => {
  try {
    const toRad = (x) => (x * Math.PI) / 180;
    const R = 6371; // Radius of Earth in km

    const dLat = toRad(coord2.lat - coord1.lat);
    const dLon = toRad(coord2.lng - coord1.lng);
    const lat1 = toRad(coord1.lat);
    const lat2 = toRad(coord2.lat);

    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
  }
};

async function findNearestAddress(origin, stores) {
  try {
    if (!origin || !Array.isArray(stores) || stores.length === 0) return null;
    const originCoords = parseCoordinates(origin.coordinates || origin);

    const filteredStores = stores.filter((store) => {
      const coords = parseCoordinates(store?.address?.coordinates);
      if (!coords) return false;
      const distance = haversineDistance(originCoords, coords);
      return distance <= (store.deliveryRange || 0);
    });

    if (filteredStores.length === 0) return null;

    const distanceResults = await Promise.allSettled(
      filteredStores.map(async (store) => {
        try {
          const result = await getTravelTime(origin, store.address.coordinates);
          const distance = parseFloat(result?.distance);
          return { store, distance: isNaN(distance) ? Infinity : distance };
        } catch {
          return null;
        }
      }),
    );

    let nearestStore = null;
    let shortestDistance = Infinity;

    for (const result of distanceResults) {
      if (result.status !== "fulfilled" || !result.value) continue;
      const { store, distance } = result.value || {};
      if (!store || typeof distance !== "number") continue;
      if (
        distance < shortestDistance &&
        distance <= (store.deliveryRange || 0) &&
        store.address &&
        store.address.address
      ) {
        shortestDistance = distance;
        nearestStore = {
          id: store.id,
          storeName: store.storeName,
          phone: store.phone,
          distance: `${distance.toFixed(2)} km`,
          storeAddress: store.address.address,
          storeAdminId: store.storeAdminId || "",
          deliveryCharges:
            distance <= (store.freeDeliveryRange || 0)
              ? 0
              : store.deliveryCharges || 0,
          packagingCharges: store.packagingCharges || 0,
          platformCharges: store.platformCharges || 0,
          deliveryRange: store.deliveryRange || 0,
          freeDeliveryRange: store.freeDeliveryRange || 0,
        };
      }
    }

    return nearestStore;
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return null;
  }
}

const parseCoordinates = (coordString) => {
  try {
    if (!coordString || typeof coordString !== "string") return null;
    const [latStr, lngStr] = coordString.split(",");
    const lat = parseFloat(latStr?.trim());
    const lng = parseFloat(lngStr?.trim());
    return !isNaN(lat) && !isNaN(lng) ? { lat, lng } : null;
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
  }
};

const getStoreAddressByCity = async (container, location) => {
  try {
    const area = location.area.toLowerCase();
    const city = location.city.toLowerCase();

    let query = {
      query: `
              SELECT c.id, c.storeName, c.phone, c.address 
              FROM c 
              WHERE CONTAINS(LOWER(c.address), @area)
            `,
      parameters: [{ name: "@area", value: area }],
    };

    let resources = await getDataByQuery(container, query);
    if (resources) {
      return resources;
    }

    query = {
      query: `
          SELECT c.id, c.storeName, c.phone, c.address 
          FROM c 
          WHERE CONTAINS(LOWER(c.address), @city)
        `,
      parameters: [{ name: "@city", value: city }],
    };

    resources = await getDataByQuery(container, query);

    if (resources) {
      return resources;
    }

    return null;
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return null;
  }
};

const getTravelTime = async (origin, destination) => {
  try {
    const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
    const url = `${
      process.env.GOOGLE_URL
    }/distancematrix/json?origins=${encodeURIComponent(
      origin,
    )}&destinations=${encodeURIComponent(destination)}&key=${GOOGLE_API_KEY}`;
    const response = await axios.get(url);
    const data = response.data;

    if (data.status === "OK") {
      const element = data.rows[0].elements[0];
      if (element.status === "OK") {
        const result = {
          distance: element.distance.text,
          duration: element.duration.text,
        };
        return result;
      } else {
        logger.error(`Element status: ${element.status}`);
      }
    } else {
      logger.error(`API response status: ${data.status}`);
    }
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
  }
};

async function getCurentArea(address) {
  try {
    const apiKey = process.env.GOOGLE_API_KEY;
    const encodedAddress = encodeURIComponent(address);
    const url = `${process.env.GOOGLE_URL}/geocode/json?address=${encodedAddress}&key=${apiKey}`;
    const response = await axios.get(url);
    const data = response.data;

    if (data.status === "OK") {
      const result = data.results[0];
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
      return currentLocation;
    }
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
  }
}

module.exports = {
  getNearestStore,
  getStoreAddressByCity,
  getTravelTime,
  getCurentArea,
};
