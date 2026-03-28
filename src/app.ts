import express from "express";
import cors from "cors";
import productRoutes from "./routes/product.routes";
import userRoutes from "./routes/user.routes";
import authRoutes from "./routes/auth.routes";

const app = express();

// ✅ FIXED CORS
app.use(
  cors({
    origin: true, // allow any origin (perfect for dev)
    credentials: true,
  }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api/products", productRoutes);
app.use("/api/users", userRoutes);
app.use("/api/auth", authRoutes);

export default app;
