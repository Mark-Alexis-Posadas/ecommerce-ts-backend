import express from "express";
import {
  getCart,
  addToCart,
  removeFromCart,
  clearCart,
  incrementQty,
  decrementQty,
} from "../controllers/cart.controller";

import { protect } from "../middlewares/authMiddleware";

const router = express.Router();

router.get("/", protect, getCart);
router.post("/", protect, addToCart);

router.put("/increment", protect, incrementQty);
router.put("/decrement", protect, decrementQty);
router.delete("/:productId", protect, removeFromCart);
router.delete("/", protect, clearCart);

export default router;
