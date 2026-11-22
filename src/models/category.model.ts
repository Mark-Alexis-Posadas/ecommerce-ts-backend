import { categorySchema as inputSchema } from '../validators/catalogValidator';
import mongoose from 'mongoose';
const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    image: {
      type: String,
      default: '',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);
categorySchema.pre('validate', function () {
  const result = inputSchema.safeParse({
    name: this.name,
    slug: this.slug,
    description: this.description,
    image: this.image,
    isActive: this.isActive,
  });
  if (!result.success)
    for (const issue of result.error.issues) this.invalidate(String(issue.path[0]), issue.message);
});
export const Category = mongoose.model('Category', categorySchema);
