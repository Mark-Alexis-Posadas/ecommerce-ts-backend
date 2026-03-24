import express from "express";
import cors from "cors";
import productRoutes from "./routes/product.routes";

const app = express();

app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
  }),
);

app.use("/api/products", productRoutes);

app.use(express.json());

export default app;
