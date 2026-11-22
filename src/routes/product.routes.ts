import { protect, adminOnly } from "../middlewares/authMiddleware";
import express from "express";
import {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  getCategories,
} from "../controllers/product.controller";

const router = express.Router();

router.get("/categories", getCategories);
router.get("/", getProducts);
router.get("/:id", getProductById);
router.post("/", protect, adminOnly, createProduct);
router.put("/:id", protect, adminOnly, updateProduct);
router.delete("/:id", protect, adminOnly, deleteProduct);

export default router;
