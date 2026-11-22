import mongoose from 'mongoose';

export const connectDB = async () => {
  try {
    const uri = process.env.MONGO_URI;
    if (!uri) throw new Error('Database configuration is missing');
    await mongoose.connect(uri);
    console.log('MongoDB connected');
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};
