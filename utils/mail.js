const nodemailer = require("nodemailer");
const dotenv = require("dotenv");
dotenv.config();
const { commonMessages } = require("../constants");
const { logger } = require("../jobLogger");
const transport = nodemailer.createTransport({
  service: "gmail",
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL,
    pass: process.env.PASSWORD,
  },
});

async function mail(mailOption) {
  try {
    const info = await transport.sendMail(mailOption);
    return info;
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
  }
}

module.exports = { mail };
