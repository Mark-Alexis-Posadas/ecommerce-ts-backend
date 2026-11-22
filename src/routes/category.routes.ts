import { protect, adminOnly, optionalAuth } from '../middlewares/authMiddleware';
import express from 'express';
import {
  createCategory,
  getCategories,
  updateCategory,
  deleteCategory,
} from '../controllers/category.controller';
const router = express.Router();
router.get('/', optionalAuth, getCategories);
router.post('/', protect, adminOnly, createCategory);
router.put('/:id', protect, adminOnly, updateCategory);
router.delete('/:id', protect, adminOnly, deleteCategory);
export default router;
