const jwt = require("jsonwebtoken");
const { getTokenKey, generateToken } = require("../services/otpService");
const { getContainer, getDetailsById } = require("../services/cosmosService");
const responseModel = require("../models/ResponseModel");
const { authMessage, commonMessages } = require("../constants");
const { logger } = require("../jobLogger");

const authenticateToken = (req, res, next) => {
  try {
    const authHeader = req.headers[authMessage.authKey];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token)
      return res
        .status(401)
        .json(new responseModel(false, authMessage.accessDenied));

    const decodedPayload = jwt.decode(token);
    const jwtKey = getTokenKey(decodedPayload.phone);

    jwt.verify(token, jwtKey, (err, decoded) => {
      if (!err) {
        req.user = decoded;
        return next();
      }

      if (err.name === authMessage.expiredError) {
        if (!decodedPayload || !decodedPayload.id)
          return res
            .status(403)
            .json(new responseModel(false, authMessage.invalidPayload));

        const newToken = generateToken(decodedPayload);
        if (!newToken)
          res
            .status(200)
            .json(new responseModel(false, authMessage.tokenExpire));

        res.setHeader(authMessage.authKey, newToken);

        req.user = decodedPayload;
        return next();
      }

      return res
        .status(403)
        .json(new responseModel(false, authMessage.invalidToken));
    });
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return res.status(500).json(new responseModel(false, error.message));
  }
};

async function isAuthorizedUser(userId, allowedRoles = []) {
  try {
    if (!userId || !Array.isArray(allowedRoles) || allowedRoles.length === 0) {
      return false;
    }

    const roleChecks = await Promise.all(
      allowedRoles.map(async (role) => {
        const container = getContainer(role);
        const user = await getDetailsById(container, userId);
        return !!user;
      }),
    );
    return roleChecks.includes(true);
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return false;
  }
}

module.exports = {
  authenticateToken,
  isAuthorizedUser,
};
