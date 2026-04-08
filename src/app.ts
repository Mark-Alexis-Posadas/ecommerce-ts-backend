import express from "express";
import cors from "cors";

// routes
import productRoutes from "./routes/product.routes";
import userRoutes from "./routes/user.routes";
import authRoutes from "./routes/auth.routes";
import cartRoutes from "./routes/cart.routes";
import orderRoutes from "./routes/order.routes";

const app = express();

// ✅ CORS (good for dev)
app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);

// ✅ body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ routes
app.use("/api/products", productRoutes);
app.use("/api/users", userRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/orders", orderRoutes);

// ✅ health check (optional pero useful)
app.get("/", (req, res) => {
  res.send("API is running...");
});

export default app;
