import { lowStockThreshold } from '../config/inventory';
import { Request, Response } from 'express';
import { FilterQuery, Types } from 'mongoose';
import Product from '../models/product.model';
import { Category } from '../models/category.model';
import {
  createProductSchema,
  updateProductSchema,
  catalogQuerySchema,
  objectId,
  catalogError,
  escapeRegex,
  discountedPrice,
  discountedPriceExpression,
} from '../validators/catalogValidator';
export const getProducts = async (req: Request, res: Response) => {
  try {
    const q = catalogQuerySchema.parse(req.query);
    if (q.visibility !== 'active' && req.user?.role !== 'admin')
      return res.status(403).json({ message: 'Admin access required' });
    if (q.inventory !== 'all' && req.user?.role !== 'admin')
      return res.status(403).json({ message: 'Admin access required' });
    const threshold = lowStockThreshold();
    const query: FilterQuery<unknown> = {};
    if (q.inventory === 'in_stock') query.stock = { $gt: 0 };
    if (q.inventory === 'out_of_stock') query.stock = 0;
    if (q.inventory === 'low_stock') query.stock = { $gt: 0, $lte: threshold };
    if (q.visibility === 'active') query.isActive = { $ne: false };
    else if (q.visibility === 'archived') query.isActive = false;
    if (req.user?.role !== 'admin' || q.visibility === 'active') {
      const ids = await Category.distinct('_id', { isActive: { $ne: false } });
      query.category = {
        $in: q.category ? ids.filter((id) => String(id) === q.category.toLowerCase()) : ids,
      };
    } else if (q.category) query.category = new Types.ObjectId(q.category);
    if (q.search)
      query.$or = ['title', 'description', 'brand'].map((field) => ({
        [field]: { $regex: escapeRegex(q.search), $options: 'i' },
      }));
    if (q.featured !== undefined) query.isFeatured = q.featured === 'true';
    const sort: Record<string, 1 | -1> =
      q.sort === 'low_to_high'
        ? { priceAfterDiscount: 1, _id: 1 }
        : q.sort === 'high_to_low'
          ? { priceAfterDiscount: -1, _id: 1 }
          : q.sort === 'top_rated'
            ? { 'rating.rate': -1, _id: 1 }
            : q.sort === 'best_selling'
              ? { sold: -1, _id: 1 }
              : { createdAt: -1, _id: -1 };
    const [data, total] = await Promise.all([
      Product.aggregate([
        { $match: query },
        { $set: { priceAfterDiscount: discountedPriceExpression } },
        { $sort: sort },
        { $skip: (q.page - 1) * q.limit },
        { $limit: q.limit },
      ]),
      Product.countDocuments(query),
    ]);
    await Product.populate(data, { path: 'category' });
    const totalPages = Math.ceil(total / q.limit);
    return res.json({
      data: data.map((product) => ({
        ...product,
        inventoryStatus:
          product.stock <= 0
            ? 'out_of_stock'
            : product.stock <= threshold
              ? 'low_stock'
              : 'in_stock',
      })),
      meta: {
        lowStockThreshold: threshold,
        page: q.page,
        limit: q.limit,
        total,
        totalPages,
        hasNextPage: q.page < totalPages,
        hasPrevPage: q.page > 1,
      },
    });
  } catch (e) {
    return catalogError(res, e);
  }
};
export const getProductById = async (req: Request, res: Response) => {
  try {
    if (!objectId.safeParse(req.params.id).success)
      return res.status(400).json({ message: 'Invalid product ID' });
    const p = await Product.findById(req.params.id).populate('category');
    if (!p) return res.status(404).json({ message: 'Product not found' });
    if (
      req.user?.role !== 'admin' &&
      (p.isActive === false ||
        !p.category ||
        !(await Category.exists({ _id: p.category._id, isActive: { $ne: false } })))
    )
      return res.status(404).json({ message: 'Product not found' });
    return res.json({ ...p.toObject(), priceAfterDiscount: discountedPrice(p.price, p.discount) });
  } catch (e) {
    return catalogError(res, e);
  }
};
const validCategory = (id: unknown) => Category.exists({ _id: id, isActive: { $ne: false } });
export const createProduct = async (req: Request, res: Response) => {
  try {
    const data = createProductSchema.parse(req.body);
    if (!(await validCategory(data.category)))
      return res.status(400).json({
        message: 'Category unavailable',
        errors: { category: ['Select an active category'] },
      });
    const images = data.images?.length ? data.images : [data.image!];
    return res
      .status(201)
      .json(await Product.create({ ...data, images, image: data.image || images[0] }));
  } catch (e) {
    return catalogError(res, e);
  }
};
export const updateProduct = async (req: Request, res: Response) => {
  try {
    if (!objectId.safeParse(req.params.id).success)
      return res.status(400).json({ message: 'Invalid product ID' });
    const data = updateProductSchema.parse(req.body);
    const p = await Product.findById(req.params.id);
    if (!p) return res.status(404).json({ message: 'Product not found' });
    if (!(await validCategory(data.category || p.category)))
      return res.status(400).json({
        message: 'Category unavailable',
        errors: { category: ['Select an active category'] },
      });
    p.set(data);
    if (data.images !== undefined) p.image = data.image || data.images[0];
    else if (data.image)
      p.images = [data.image, ...p.images.filter((image) => image !== data.image)];
    await p.save();
    return res.json(p);
  } catch (e) {
    return catalogError(res, e);
  }
};
export const deleteProduct = async (req: Request, res: Response) => {
  try {
    if (!objectId.safeParse(req.params.id).success)
      return res.status(400).json({ message: 'Invalid product ID' });
    const p = await Product.findByIdAndUpdate(
      req.params.id,
      { $set: { isActive: false } },
      { new: true, runValidators: true },
    );
    if (!p) return res.status(404).json({ message: 'Product not found' });
    return res.json({ message: 'Product archived', data: p });
  } catch (e) {
    return catalogError(res, e);
  }
};
export { getProductCategories as getCategories } from './category.controller';
