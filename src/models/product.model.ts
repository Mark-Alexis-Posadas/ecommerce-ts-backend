import mongoose from "mongoose";

const ratingSchema = new mongoose.Schema(
  {
    rate: { type: Number, default: 0 },
    count: { type: Number, default: 0 },
  },
  { _id: false },
);

const productSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
    price: {
      type: Number,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      required: true,
    },
    image: {
      type: String,
      required: true,
    },
    rating: {
      type: ratingSchema,
      default: () => ({}),
    },
  },
  { timestamps: true },
);

export default mongoose.model("Product", productSchema);
