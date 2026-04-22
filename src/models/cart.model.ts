import mongoose, { Document, Types } from "mongoose";

interface CartItem {
  product: Types.ObjectId;
  quantity: number;
  price: number;
}

export interface CartDocument extends Document {
  user: Types.ObjectId;
  items: Types.DocumentArray<CartItem>;
}

const cartSchema = new mongoose.Schema<CartDocument>(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    items: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
        },
        quantity: {
          type: Number,
          required: true,
          default: 1, // 🔥 importante
        },
        price: {
          type: Number,
          required: true,
        },
      },
    ],
  },
  { timestamps: true },
);

export default mongoose.model<CartDocument>("Cart", cartSchema);
