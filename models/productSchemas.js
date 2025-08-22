const { z } = require("zod");

const productSchema = z
  .object({
    id: z.uuid("Invalid Product Id").optional(),
    name: z.string().min(1, "Name is required"),
    variantName: z.string().min(1, "Variant Name is required"),
    description: z.string().min(1, "Description is required"),
    category: z.string().min(1, "Category is required"),
    subCategory: z.string().min(1, "Sub Category is required"),
    bestSeller: z.boolean().optional().default(false),
    frozen: z.boolean().optional().default(false),
    readytoCook: z.boolean().optional().default(false),
    insale: z.boolean().optional().default(false),
    active: z.boolean().optional().default(true),
    type: z.string().min(1, "Please select valid Type"),
    value: z.number().min(1, "Value is required"),
    metrics: z.string().min(1, "Please select valid metrics"),
    discount: z.number().default(0),
    images: z.array(z.string()).min(1, "At least one image is required"),
    price: z.number().positive("Price must be greater than 0"),
    offerPrice: z.number().default(0),
    rating: z.number().default(0),
  })
  .strict();

const categorySchema = z
  .object({
    category: z.string().min(1, "Category Name is required"),
    isVisible: z.boolean().default(true),
    backgroundImage: z.string().min(1, "Background Image cannot be empty"),
    logoImage: z.string().min(1, "Logo Image cannot be empty"),
  })
  .strict();

const variantSchema = z.object({
  name: z.string().min(1, "Variant Name is required"),
  price: z.number().positive("Price must be greater than 0"),
  offerPrice: z.number().default(0),
  images: z.array(z.string()).min(1, "At least one image is required"),
  type: z.string().min(1, "Please select valid Type"),
  value: z.number().min(1, "Value is required"),
  metrics: z.string().min(1, "Please select valid metrics"),
  discount: z.number().default(0),
});

const storeProductSchema = z.object({
  storeId: z.uuid("Invalid Store Id"),
  productId: z.uuid("Invalid Product Id"),
  variantId: z.uuid("Invalid Variant Id"),
  stock: z.number().min(0, "Value must be zero or positive"),
  price: z.number().positive("Price must be greater than 0"),
  offerPrice: z.number().default(0),
});

const bannerSchema = z
  .object({
    id: z.uuid("Invalid Banner Id").optional(),
    bannerName: z.string().min(1, "Banner Name is required").optional(),
    image: z.string().min(1, "Banner Image is required").optional(),
    screenName: z.string().min(1, "Screen Name cannot be empty").optional(),
    params: z
      .union([
        z.object({
          category: z.string().min(1),
        }),
        z.object({
          id: z.string().min(1),
        }),
      ])
      .optional(),
    dynamic: z.boolean().default(true).optional(),
    isActive: z.boolean().default(false).optional(),
  })
  .strict();

module.exports = {
  productSchema,
  categorySchema,
  variantSchema,
  storeProductSchema,
  bannerSchema,
};
