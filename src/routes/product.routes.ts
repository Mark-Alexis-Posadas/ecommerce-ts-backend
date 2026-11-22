import { protect, adminOnly, optionalAuth } from '../middlewares/authMiddleware';
import express from 'express';
import {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  getCategories,
} from '../controllers/product.controller';
const router = express.Router();
router.get('/categories', optionalAuth, getCategories);
router.get('/', optionalAuth, getProducts);
router.get('/:id', optionalAuth, getProductById);
router.post('/', protect, adminOnly, createProduct);
router.put('/:id', protect, adminOnly, updateProduct);
router.delete('/:id', protect, adminOnly, deleteProduct);
export default router;
