const { CosmosClient } = require("@azure/cosmos");
const { commonMessages } = require("../constants");
const endpoint = process.env.COSMOS_DB_URI;
const key = process.env.COSMOS_DB_KEY;
const client = new CosmosClient({ endpoint, key });
const databaseId = process.env.COSMOS_DB_NAME;
const { logger } = require("../jobLogger");

const createContainerIfNotExist = async (containerId) => {
  try {
    const { database } = await client.databases.createIfNotExists({
      id: databaseId,
    });
    const { container } = await database.containers.createIfNotExists({
      id: containerId,
      partitionKey: { kind: "Hash", paths: ["/id"] },
    });
    return container;
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
  }
};

const getContainer = (containerId) => {
  try {
    let container = client.database(databaseId).container(containerId);
    if (container) {
      return container;
    } else {
      container = createContainerIfNotExist(containerId);
      return container;
    }
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return null;
  }
};

const fetchAllItems = async (container) => {
  try {
    const { resources } = await container.items.readAll().fetchAll();
    return resources;
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return null;
  }
};

const getDetailsByEmail = async (container, email) => {
  try {
    const querySpec = {
      query: "SELECT * FROM c WHERE c.email = @email",
      parameters: [{ name: "@email", value: email }],
    };
    const { resources } = await container.items.query(querySpec).fetchAll();

    if (resources.length > 0) {
      return resources[0]; // Or throw an error or handle as needed
    }
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return null;
  }
};

const getUsersByRole = async (containerId) => {
  try {
    const container = getContainer(containerId);
    if (!container) {
      throw new Error(commonMessages.failed);
    }
    const resources = await fetchAllItems(container);
    if (!resources || resources.length === 0) {
      throw new Error(commonMessages.notFound);
    }
    return resources;
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return [];
  }
};

const getDetailsById = async (container, id) => {
  try {
    const { resource } = await container.item(id, id).read();
    return resource;
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return null;
  }
};

const getUsersByExpiryDate = async (containerId, date) => {
  try {
    const container = getContainer(containerId);
    const querySpec = {
      query:
        'SELECT * FROM c WHERE (c.vehicleRC.expiryDate = @date OR c.drivingLicence.expiryDate = @date) AND c.isAuthorized = "Approved"',
      parameters: [{ name: "@date", value: date }],
    };

    const { resources } = await getDataByQuery(container, querySpec);
    return resources;
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return null;
  }
};

const getUserDetails = async (
  container,
  phone = "",
  email = "",
  drivingLicense = "",
  vehicleRC = "",
) => {
  try {
    const querySpec = {
      query:
        'SELECT * FROM c WHERE ((@email != "" AND c.email = @email) OR (@phone != "" AND c.phone = @phone) OR (@vehicleRC != "" AND c.vehicleRC.id = @vehicleRC) OR (@drivingLicense != "" AND c.drivingLicense.id = @drivingLicense))',
      parameters: [
        { name: "@email", value: email },
        { name: "@phone", value: phone },
        { name: "@vehicleRC", value: vehicleRC },
        { name: "@drivingLicense", value: drivingLicense },
      ],
    };

    const response = await getDataByQuery(container, querySpec);
    return response ? response[0] : "";
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return null;
  }
};

const getUsers = async (
  container,
  phone = "",
  email = "",
  drivingLicense = "",
  vehicleRC = "",
) => {
  try {
    const querySpec = {
      query:
        'SELECT * FROM c WHERE ((@email != "" AND c.email = @email) OR (@phone != "" AND c.phone = @phone) OR (@vehicleRC != "" AND c.vehicleRC.id = @vehicleRC) OR (@drivingLicense != "" AND c.drivingLicense.id = @drivingLicense))',
      parameters: [
        { name: "@email", value: email },
        { name: "@phone", value: phone },
        { name: "@vehicleRC", value: vehicleRC },
        { name: "@drivingLicense", value: drivingLicense },
      ],
    };

    const { resources } = await container.items.query(querySpec).fetchAll();
    return resources;
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return [];
  }
};

const createRecord = async (container, item) => {
  try {
    const { resource } = await container.items.create(item);
    return resource;
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return null;
  }
};

const updateRecord = async (container, item) => {
  try {
    const { resource } = await container.item(item.id, item.id).replace(item);
    return resource;
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return null;
  }
};

const deleteRecord = async (container, id) => {
  try {
    await container.item(id, id).delete();
    return true;
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return false;
  }
};

const getDataByQuery = async (container, querySpec) => {
  try {
    const { resources } = await container.items.query(querySpec).fetchAll();
    if (!Array.isArray(resources) || resources.length === 0) {
      return [];
    }
    return resources;
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return null;
  }
};

function parseCreatedOn(dateStr) {
  const [datePart, timePart, meridian] = dateStr.split(" ");
  const [day, monStr, year] = datePart.split("-");
  const monthNames = commonMessages.months;
  const month = monthNames.indexOf(monStr);
  if (month === -1) return null;

  let [hours, minutes] = timePart.split(":").map(Number);

  if (meridian === "PM" && hours !== 12) hours += 12;
  if (meridian === "AM" && hours === 12) hours = 0;

  return new Date(year, month, parseInt(day), hours, minutes);
}

module.exports = {
  getContainer,
  fetchAllItems,
  getDetailsByEmail,
  getUsersByRole,
  getUsers,
  getDetailsById,
  getUserDetails,
  createRecord,
  updateRecord,
  deleteRecord,
  getDataByQuery,
  getUsersByExpiryDate,
  parseCreatedOn,
};
