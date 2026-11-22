import { discountedPrice, imageUrl } from "../validators/catalogValidator";
import mongoose from "mongoose";
const ratingSchema = new mongoose.Schema({
    rate: { type: Number, default: 0 },
    count: { type: Number, default: 0 },
}, { _id: false });
const variantSchema = new mongoose.Schema({
    size: String,
    color: String,
    stock: { type: Number, default: 0 },
}, { _id: false });
const productSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true, maxlength: 200,
    },
    description: {
        trim: true, maxlength: 10000,
        type: String,
        required: true,
    },
    price: {
        min: 0, max: 1e12, validate: Number.isFinite,
        type: Number,
        required: true,
    },
    // 🔥 NEW: discount system
    discount: {
        min: 0, max: 100, validate: Number.isFinite,
        type: Number,
        default: 0, // percent (e.g. 10 = 10%)
    },
    priceAfterDiscount: {
        type: Number,
    },
    // 🔥 NEW: inventory
    stock: {
        min: 0, validate: Number.isSafeInteger,
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
        type: mongoose.Schema.Types.ObjectId,
        ref: "Category",
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
}, { timestamps: true });
// 🔥 AUTO COMPUTE DISCOUNT PRICE
productSchema.pre("validate", function () {
    this.priceAfterDiscount = discountedPrice(this.price, this.discount);
    if (!this.image && !this.images.length)
        this.invalidate('images', 'At least one image required');
    for (const image of [...this.images, ...(this.image ? [this.image] : [])])
        if (!imageUrl.safeParse(image).success)
            this.invalidate('images', 'Invalid image URL');
});
export default mongoose.model("Product", productSchema);
