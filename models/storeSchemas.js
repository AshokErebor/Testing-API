const { z } = require("zod");
const { commonMessages } = require("../constants");

const ampmTimeRegex = /^(0?[1-9]|1[0-2]):[0-5][0-9]\s?(AM|PM)$/i;

const adminSchema = z
  .object({
    name: z.string().min(1, "Name is required"),
    email: z.email("Invalid email address"),
    phone: z.string().regex(/^[6-9]\d{9}$/, {
      message: "Please enter a valid 10 digit phone number.",
    }),
    password: z.string().min(6, "Password must be at least 6 characters long"),
  })
  .strict();

const storeSchema = z
  .object({
    storeName: z.string().min(1, "Store name is required"),
    email: z.email("Invalid email address"),
    phone: z
      .string()
      .regex(/^[6-9]\d{9}$/, "Please enter a valid 10 digit phone number."),
    address: z.object({
      address: z.string().min(1, "Address is required"),
      coordinates: z
        .string()
        .regex(
          /^-?\d{1,3}\.\d+,\s*-?\d{1,3}\.\d+$/,
          "coordinates must be in format: 'latitude, longitude'",
        ),
    }),
    storeManagerDetails: z
      .object({
        managerName: z.string().min(1, "Name is required").optional(),
        managerPhone: z
          .string()
          .regex(/^[6-9]\d{9}$/, "Please enter a valid 10 digit phone number.")
          .optional(),
      })
      .optional(),
    GSTIN: z
      .string()
      .regex(
        /^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[1-9A-Z]{1}[Z]{1}[0-9A-Z]{1}$/,
        "Invalid GSTIN format",
      ),
    GSTCertificate: z.string().min(1, "Invalid GST Certificate URL"),
    CIN: z
      .string()
      .regex(/^L\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}$/, "Invalid CIN format"),
    CINCertificate: z.string().min(1, "Invalid CIN Certificate URL"),
    storeLicense: z.string().min(1, "Store License is required").optional(),
    storeLicenseCertificate: z
      .string()
      .min(1, "Invalid Store License Certificate URL")
      .optional(),
    workingDays: z
      .array(
        z.enum(commonMessages.days, {
          errorMap: (issue, ctx) => ({
            message: `"${ctx.data}" is not a valid day.`,
          }),
        }),
      )
      .nonempty("At least one working day is required")
      .refine((days) => new Set(days).size === days.length, {
        message: "Duplicate days are not allowed in Working Days",
      }),
    workingStartTime: z
      .string()
      .regex(ampmTimeRegex, "Working Start Time must be in hh:mm AM/PM format"),
    workingEndTime: z
      .string()
      .regex(ampmTimeRegex, "Working End Time must be in hh:mm AM/PM format"),
    deliveryCharges: z
      .number()
      .min(0, "Delivery charges must be a positive number"),
    packagingCharges: z
      .number()
      .min(0, "Packaging charges must be a positive number"),
    platformCharges: z
      .number()
      .min(0, "Platform charges must be a positive number"),
    deliveryRange: z
      .number()
      .min(0, "Delivery range must be a positive number"),
    freeDeliveryRange: z
      .number()
      .min(0, "Free delivery range must be a positive number"),
    isAuthorized: z.string().min(1, "Is Authorized is required").optional(),
    storeStatus: z.string().min(1, "Store Status is required").optional(),
  })
  .strict();

module.exports = {
  adminSchema,
  storeSchema,
};
