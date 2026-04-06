import mongoose from "mongoose";
const orderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    orderItems: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
        },
        name: String,
        qty: Number,
        price: Number,
        image: String,
      },
    ],

    shippingAddress: {
      address: String,
      city: String,
      postalCode: String,
      phone: String,
    },

    paymentMethod: {
      type: String,
      default: "COD",
    },

    totalPrice: Number,

    isPaid: {
      type: Boolean,
      default: false,
    },

    isDelivered: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

export default mongoose.model("Order", orderSchema);
