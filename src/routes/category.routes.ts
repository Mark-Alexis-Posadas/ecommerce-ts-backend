import express from "express";
import { createCategory } from "../controllers/category.controller";
import { deleteCategory } from "../controllers/category.controller";
const router = express.Router();

router.post("/", createCategory);
router.delete("/:id", deleteCategory);
export default router;
