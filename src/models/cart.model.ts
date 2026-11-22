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
      required: true,
    },
    items: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        quantity: {
          type: Number,
          required: true,
          default: 1, // 🔥 importante
          min: 1,
          validate: Number.isSafeInteger,
        },
        price: {
          type: Number,
          required: true,
        },
      },
    ],
  },
  { timestamps: true, autoIndex: false, autoCreate: false },
);

// Declarative only: deploy after an approved duplicate-cart audit. Never syncIndexes at startup.
cartSchema.index({ user: 1 }, { unique: true, name: "unique_cart_user" });

export default mongoose.model<CartDocument>("Cart", cartSchema);
