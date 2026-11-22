import { Category } from '../models/category.model';
export async function productAvailable(product: {
    isActive?: boolean;
    category: unknown;
} | null): Promise<boolean> { return !!product && product.isActive !== false && !!await Category.exists({ _id: product.category, isActive: { $ne: false } }); }
