import express from "express";
import {
  createOrder,
  getMyOrders,
  getOrderById,
} from "../controllers/order.controller";

import { protect } from "../middlewares/authMiddleware";

const router = express.Router();

router.post("/", protect, createOrder);
router.get("/my", protect, getMyOrders);
router.get("/:id", protect, getOrderById);

export default router;
