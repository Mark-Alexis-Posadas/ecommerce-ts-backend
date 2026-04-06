import mongoose from "mongoose";

const ratingSchema = new mongoose.Schema(
  {
    rate: { type: Number, default: 0 },
    count: { type: Number, default: 0 },
  },
  { _id: false },
);

const variantSchema = new mongoose.Schema(
  {
    size: String,
    color: String,
    stock: { type: Number, default: 0 },
  },
  { _id: false },
);

const productSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      required: true,
    },

    price: {
      type: Number,
      required: true,
    },

    // 🔥 NEW: discount system
    discount: {
      type: Number,
      default: 0, // percent (e.g. 10 = 10%)
    },

    priceAfterDiscount: {
      type: Number,
    },

    // 🔥 NEW: inventory
    stock: {
      type: Number,
      required: true,
      default: 0,
    },

    sold: {
      type: Number,
      default: 0,
    },

    // 🔥 NEW: multiple images
    images: [
      {
        type: String,
        required: true,
      },
    ],

    // keep for backward compatibility
    image: {
      type: String,
    },

    category: {
      type: String,
      required: true,
    },

    brand: {
      type: String,
    },

    // 🔥 NEW: variants (size/color)
    variants: [variantSchema],

    rating: {
      type: ratingSchema,
      default: () => ({}),
    },

    // 🔥 NEW: flags
    isFeatured: {
      type: Boolean,
      default: false,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

// 🔥 AUTO COMPUTE DISCOUNT PRICE
productSchema.pre("save", function (next) {
  if (this.discount > 0) {
    this.priceAfterDiscount = this.price - this.price * (this.discount / 100);
  } else {
    this.priceAfterDiscount = this.price;
  }
  next();
});

export default mongoose.model("Product", productSchema);
