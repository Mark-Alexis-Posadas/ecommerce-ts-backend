import { Request, Response } from 'express';
import { Category } from '../models/category.model';
import Product from '../models/product.model';
import {
  categorySchema,
  objectId,
  slugify,
  escapeRegex,
  catalogError,
} from '../validators/catalogValidator';
import { z } from 'zod';
const visibilitySchema = z
  .object({ visibility: z.enum(['active', 'all']).default('active') })
  .strict();
async function list(req: Request) {
  const { visibility } = visibilitySchema.parse(req.query);
  return Category.find(visibility === 'all' ? {} : { isActive: { $ne: false } }).sort({
    createdAt: -1,
    _id: -1,
  });
}
export const getCategories = async (req: Request, res: Response) => {
  try {
    if (req.query.visibility === 'all' && req.user?.role !== 'admin')
      return res.status(403).json({ message: 'Admin access required' });
    return res.json(await list(req));
  } catch (e) {
    return catalogError(res, e);
  }
};
export const getProductCategories = async (req: Request, res: Response) => {
  try {
    if (req.query.visibility === 'all' && req.user?.role !== 'admin')
      return res.status(403).json({ message: 'Admin access required' });
    return res.json({ data: await list(req) });
  } catch (e) {
    return catalogError(res, e);
  }
};
const duplicate = (name: string, slug: string, id?: string) =>
  Category.exists({
    ...(id ? { _id: { $ne: id } } : {}),
    $or: [{ name: { $regex: '^' + escapeRegex(name) + '$', $options: 'i' } }, { slug }],
  });
export const createCategory = async (req: Request, res: Response) => {
  try {
    const data = categorySchema.parse(req.body);
    const slug = data.slug || slugify(data.name);
    categorySchema.parse({ ...data, slug });
    if (await duplicate(data.name, slug))
      return res.status(409).json({
        message: 'Category name or slug already exists',
        errors: { name: ['Duplicate name or slug'], slug: ['Duplicate name or slug'] },
      });
    return res.status(201).json(await Category.create({ ...data, slug }));
  } catch (e) {
    return catalogError(res, e);
  }
};
export const updateCategory = async (req: Request, res: Response) => {
  try {
    if (!objectId.safeParse(req.params.id).success)
      return res.status(400).json({ message: 'Invalid category ID' });
    const data = categorySchema.partial().strict().parse(req.body);
    const c = await Category.findById(req.params.id);
    if (!c) return res.status(404).json({ message: 'Category not found' });
    if (
      data.isActive === false &&
      (await Product.exists({ category: c._id, isActive: { $ne: false } }))
    )
      return res.status(409).json({
        message: 'Archive active products first',
        errors: { isActive: ['Category contains active products'] },
      });
    const name = data.name || c.name;
    const slug = data.slug || (data.name ? slugify(name) : c.slug);
    categorySchema.parse({ name, slug });
    if (await duplicate(name, slug, String(c._id)))
      return res.status(409).json({
        message: 'Category name or slug already exists',
        errors: { name: ['Duplicate name or slug'], slug: ['Duplicate name or slug'] },
      });
    c.set({ ...data, slug });
    await c.save();
    return res.json(c);
  } catch (e) {
    return catalogError(res, e);
  }
};
export const deleteCategory = async (req: Request, res: Response) => {
  req.body = { isActive: false };
  return updateCategory(req, res);
};
