import { z } from 'zod';
import { Response } from 'express';
import mongoose from 'mongoose';
export const objectId = z.string().regex(/^[a-fA-F0-9]{24}$/, 'Invalid ID');
export const imageUrl = z.string().trim().max(2048).refine(v => { if (/^\/(?!\/)[^\s]+$/.test(v))
    return true; try {
    const url = new URL(v);
    return ['http:', 'https:'].includes(url.protocol) && !!url.hostname && !url.username && !url.password;
}
catch {
    return false;
} }, 'Use an http(s) URL or local /image path');
const fields = z.object({ title: z.string().trim().min(1).max(200), description: z.string().trim().min(1).max(10000), category: objectId, price: z.number().finite().min(0).max(1e12), stock: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), discount: z.number().finite().min(0).max(100), brand: z.string().trim().max(100), image: imageUrl, images: z.array(imageUrl).max(20), isFeatured: z.boolean(), isActive: z.boolean() });
export const createProductSchema = fields.partial({ discount: true, brand: true, image: true, images: true, isFeatured: true, isActive: true }).strict().refine(v => !!v.image || !!v.images?.length, { path: ['images'], message: 'At least one image required' });
export const updateProductSchema = fields.partial().strict().refine(v => Object.keys(v).length > 0, 'No writable fields supplied');
export const categorySchema = z.object({ name: z.string().trim().min(1).max(100), description: z.string().trim().max(2000).optional(), slug: z.string().trim().max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(), image: z.union([imageUrl, z.literal('')]).optional(), isActive: z.boolean().optional() }).strict();
export const slugify = (v: string) => v.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const escapeRegex = (v: string) => v.replace(/[.*+?^{}()|[\]\\$]/g, '\\$&');
export const discountedPrice = (price: number, discount = 0) => Math.round((price * (1 - discount / 100) + Number.EPSILON) * 100) / 100;
export const catalogQuerySchema = z.object({ page: z.string().regex(/^[1-9][0-9]*$/).transform(Number).pipe(z.number().int().min(1).max(100000)).default(1), limit: z.string().regex(/^[1-9][0-9]*$/).transform(Number).pipe(z.number().int().min(1).max(100)).default(10), search: z.string().trim().max(100).default(''), category: z.union([objectId, z.literal('')]).default(''), sort: z.enum(['', 'none', 'latest', 'low_to_high', 'high_to_low', 'top_rated', 'best_selling']).default('latest'), featured: z.enum(['true', 'false']).optional(), inventory: z.enum(['all','in_stock','low_stock','out_of_stock']).default('all'), visibility: z.enum(['active', 'archived', 'all']).default('active') }).strict();
export function catalogError(res: Response, error: unknown) { if (error instanceof z.ZodError)
    return res.status(400).json({ message: 'Validation failed', errors: error.flatten().fieldErrors }); if (error instanceof mongoose.Error.ValidationError)
    return res.status(400).json({ message: 'Validation failed', errors: Object.fromEntries(Object.entries(error.errors).map(([k, v]) => [k, [v.message]])) }); if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000)
    return res.status(409).json({ message: 'Category name or slug already exists', errors: { name: ['Duplicate name or slug'], slug: ['Duplicate name or slug'] } }); return res.status(500).json({ message: 'Catalog operation failed' }); }
const rawPriceExpression = { $multiply: ['$price', { $subtract: [1, { $divide: [{ $ifNull: ['$discount', 0] }, 100] }] }] };
const centsExpression = { $multiply: [{ $add: [rawPriceExpression, Number.EPSILON] }, 100] };
export const discountedPriceExpression = { $divide: [{ $floor: { $add: [centsExpression, 0.5] } }, 100] };
