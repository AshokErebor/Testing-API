const { z } = require("zod");
const { commonMessages } = require("../constants");
const responseModel = require("./ResponseModel");
const { logger } = require("../jobLogger");
const timeRangeRegex =
  /^(0?[1-9]|1[0-2]):[0-5][0-9] (AM|PM) - (0?[1-9]|1[0-2]):[0-5][0-9] (AM|PM)$/;

const customerSchema = z
  .object({
    name: z.string().min(1, "Name is required").optional(),
    phone: z.string().regex(/^[6-9]\d{9}$/, {
      message: "Please enter a valid 10 digit phone number.",
    }),
    dateOfBirth: z
      .string()
      .regex(/^\d{2}-\d{2}-\d{4}$/, {
        message: "Date of Birth must be in DD-MM-YYYY format",
      })
      .optional(),
    email: z.email("Invalid email address").optional(),
    profilePicture: z
      .string()
      .min(1, "Please select a valid Profile Picture")
      .optional(),
    onboard: z.boolean().optional().default(false),
  })
  .strict();

const driverSchema = z
  .object({
    name: z.string().min(1, "Name is required").optional(),
    phone: z.string().regex(/^[6-9]\d{9}$/, {
      message: "Please enter a valid 10 digit phone number.",
    }),
    email: z.email("Invalid email address").optional(),
    profilePicture: z
      .string()
      .min(1, "Please select a valid Profile Picture")
      .optional(),
    status: z.boolean().optional().default(false),
    storeId: z.uuid("Invalid Store Id").optional(),
    drivingLicense: z.object({
      id: z
        .string()
        .regex(/^([A-Z]{2})(\d{2,3})(\d{2})(\d{4})(\d{6,7})$/, {
          message: "Please enter valid Vehicle Driving License Number",
        })
        .optional(),
      expiryDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, {
          message: "Expiry date must be in YYYY-MM-DD format",
        })
        .optional(),
      path: z.string().min(1, "Path is required").optional(),
    }),
    vehicleRC: z.object({
      id: z
        .string()
        .regex(/^[A-Z]{2}\d{2}(?:[ ]?[A-Z]{0,2})?[ ]?\d{4}$/, {
          message: "Please enter valid Vehicle Registration Number",
        })
        .optional(),
      expiryDate: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, {
          message: "Expiry date must be in YYYY-MM-DD format",
        })
        .optional(),
      path: z.string().min(1, "Path is required").optional(),
    }),
    workingDays: z
      .array(
        z.enum(commonMessages.days, {
          errorMap: (issue, ctx) => ({
            message: `"${ctx.data}" is not a valid day.`,
          }),
        }),
      )
      .optional(),
    workingTimings: z
      .array(
        z.string().regex(timeRangeRegex, {
          message: "Each timing must be in the format HH:MM AM - HH:MM PM",
        }),
      )
      .nonempty("At least one available timing is required")
      .optional(),
    isAuthorized: z.string().default("Pending"),
  })
  .strict();

const addressSchema = z
  .object({
    id: z.uuid("Invalid Address Id").optional(),
    origin: z
      .string()
      .regex(
        /^-?\d{1,3}\.\d+,\s*-?\d{1,3}\.\d+$/,
        "Origin must be in format: 'latitude, longitude'",
      ),
    d_no: z.string().min(1, "Door No. is required"),
    street: z.string().min(1, "Street is required"),
    landMark: z.string().optional(),
    area: z.string().min(1, "Area is required"),
    city: z.string().min(1, "City is required"),
    state: z.string().min(1, "State is required"),
    pincode: z
      .string()
      .min(4, "Pincode must be at least 4 digits")
      .max(10, "Pincode too long"),
    label: z.string().min(1, "Label is required"),
    phone: z.string().min(10, "Phone number must be at least 10 digits"),
    country: z.string().min(1, "Country is required"),
  })
  .strict();

function createDynamicSchema(schema, body) {
  try {
    const shape = {};
    for (const key of Object.keys(body)) {
      if (schema.shape[key]) {
        shape[key] = schema.shape[key];
      }
    }

    const dynamicSchema = z.object(shape).strict();

    const result = dynamicSchema.safeParse(body);

    if (!result.success) {
      const errors = result.error.issues.map((err) => ({
        field: err.path.join("."),
        message: err.message,
      }));

      return new responseModel(false, commonMessages.invalidFields, errors);
    }
    return new responseModel(true, "", result.data);
  } catch (error) {
    logger.error(commonMessages.errorOccured, error);
  }
}

module.exports = {
  customerSchema,
  driverSchema,
  addressSchema,
  createDynamicSchema,
};
