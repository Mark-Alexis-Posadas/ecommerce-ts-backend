import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ['customer', 'admin'], default: 'customer' },
    name: { type: String, required: true },
    email: { type: String, required: true },
    password: { type: String, required: true },
  },
  { timestamps: true },
);

export default mongoose.model('User', userSchema);
