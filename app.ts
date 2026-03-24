import express from "express";
import cors from "cors";
import productRoutes from "./routes/product.routes";
const app = express();

app.use("/api/products", productRoutes);
app.use(cors());
app.use(express.json());

export default app;
