const {
  getContainer,
  getDataByQuery,
  createRecord,
} = require("../services/cosmosService");
const { v4: uuidv4 } = require("uuid");
// const Randomstring = require("randomstring");
const responseModel = require("../models/ResponseModel");
const { mail } = require("../utils/mail");
const {
  ContainerIds,
  roles,
  otpMessages,
  commonMessages,
  userMessages,
} = require("../constants");
const jwt = require("jsonwebtoken");
const { logger } = require("../jobLogger");

// function generateOtp() {
//   try {
//     // return Randomstring.generate({ length: 6, charset: "numeric" });
//     return "111111";
//   } catch {
//     return "645456";
//   }
// }

async function OTPGeneration(userId, role) {
  try {
    const container = getContainer(ContainerIds.OTP);
    // const otp = generateOtp();
    const otp = "111111";
    const OTP_EXPIRY_MS = 5 * 60 * 1000;

    let userotp = "";
    const query = {
      query: "SELECT * FROM c WHERE c.user = @user AND c.role = @role",
      parameters: [
        { name: "@user", value: userId },
        { name: "@role", value: role },
      ],
    };
    const resources = await getDataByQuery(container, query);
    if (resources) {
      var otpRecord = resources[0];
    }
    const now = Date.now();
    const expiresAt = now + OTP_EXPIRY_MS;

    if (otpRecord) {
      const lastOtpExpiry = otpRecord.expiresAt || 0;
      const isExpired = now > lastOtpExpiry;

      if (isExpired) {
        otpRecord.otp = otp;
        otpRecord.generateTime = now;
        otpRecord.expiresAt = expiresAt;

        const { resource } = await container
          .item(otpRecord.id, otpRecord.id)
          .replace(otpRecord);
        userotp = resource.otp;
      } else {
        userotp = otpRecord.otp;
      }
    } else {
      const newOtpData = {
        id: uuidv4(),
        user: userId,
        role: role,
        generateTime: now,
        expiresAt: expiresAt,
        otp: otp,
      };

      const created = await createRecord(container, newOtpData);
      userotp = created.otp;
    }

    const response = await handleRole(role, userId, userotp);
    return response;
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return new responseModel(false, error.message);
  }
}

async function handleRole(role, userId, userotp) {
  try {
    switch (role) {
      case roles.StoreAdmin:
      case roles.SystemAdmin:
      case roles.StoreManager:
        var mailOption = {
          from: process.env.EMAIL,
          to: userId,
          subject: otpMessages.subject,
          text: otpMessages.email.replace(otpMessages.otp, userotp),
        };
        var mailResponse = await mail(mailOption);
        if (mailResponse.error) {
          return new responseModel(
            false,
            commonMessages.failed + mailResponse.error,
          );
        }

        return new responseModel(true, otpMessages.sent);
      case roles.Customer:
      case roles.Driver:
        return new responseModel(true, otpMessages.sent);
      default:
        return new responseModel(false, userMessages.invalid);
    }
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return new responseModel(false, error.message);
  }
}

const getTokenKey = (phone) => {
  try {
    const secret = process.env.JWT_SECRET + phone;
    return secret;
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return null;
  }
};

const generateToken = async (data) => {
  try {
    const payload = {
      id: data.id,
      phone: data.phone,
      uid: uuidv4(),
    };

    const jwtTokensecret = await getTokenKey(data.phone);
    const token = jwt.sign(payload, jwtTokensecret, {
      expiresIn: process.env.JWT_EXPIRES_IN,
    });

    return token;
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return new responseModel(
      false,
      commonMessages.errorOccured + error.message,
    );
  }
};

const VerifyOtp = async (userId, role, otp) => {
  try {
    let response = new responseModel();
    const container = getContainer(ContainerIds.OTP);
    const query = {
      query: "SELECT * FROM c WHERE c.user = @userId AND c.role = @role",
      parameters: [
        { name: "@userId", value: userId },
        { name: "@role", value: role },
      ],
    };

    const resources = await getDataByQuery(container, query);
    const otpRecord = resources ? resources[0] : null;

    if (!otpRecord) {
      response = new responseModel(false, otpMessages.notFound);
      return response;
    }

    const lastOtp = otpRecord.otp;
    const isExpired = Date.now() > new Date(otpRecord.expiresAt).getTime();

    if (isExpired) {
      response = new responseModel(false, otpMessages.expired);
      return response;
    }
    if (lastOtp === otp) {
      response = new responseModel(true, otpMessages.success);
      return response;
    } else {
      response = new responseModel(false, otpMessages.invalid);
      return response;
    }
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
    return new responseModel(false, error.message);
  }
};

module.exports = {
  OTPGeneration,
  getTokenKey,
  generateToken,
  VerifyOtp,
};
