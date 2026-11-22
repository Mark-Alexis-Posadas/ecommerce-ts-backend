import { Types } from "mongoose";
import Cart from "../models/cart.model";
import Product from "../models/product.model";
import { Category } from "../models/category.model";
import { effectivePriceCentavos, checkedMultiply } from "./cartPricing";

export interface StoredCartItem { _id?: Types.ObjectId; product: Types.ObjectId; quantity: number; price: number }
export interface StoredCart { _id: Types.ObjectId; user: Types.ObjectId; __v?: number; items: StoredCartItem[] }
export interface StockProduct {
  _id: Types.ObjectId; title: string; price: number; discount?: number; stock: number;
  category?: Types.ObjectId; isActive?: boolean; image?: string; images?: string[];
  description?: string; brand?: string; rating?: { rate: number; count: number }; createdAt?: Date;
}
export type CartIssueCode = "UNAVAILABLE" | "INVALID_QUANTITY" | "INSUFFICIENT_STOCK" | "INVALID_PRICE" | "DUPLICATE_PRODUCT";
export interface CartIssue { productId: string; code: CartIssueCode; message: string }
export interface CartLine {
  _id: string; productId: string; product: ReturnType<typeof publicProduct> | null; quantity: number;
  price: number | null; unitPriceCentavos: number | null; lineTotal: number | null; lineTotalCentavos: number | null;
  availableStock: number; available: boolean; issues: CartIssue[];
}
export interface CartResponse {
  _id: string; user: string; version: number; currency: "PHP"; items: CartLine[];
  totalQuantity: number; subtotal: number; subtotalCentavos: number; checkoutEligible: boolean; issues: CartIssue[];
}
export interface CatalogSnapshot { products: StockProduct[]; activeCategoryIds: string[] }
export interface CartRepository {
  find(user: string): Promise<StoredCart[]>;
  initialize(user: string): Promise<void>;
  compareSwap(cart: StoredCart, items: StoredCartItem[]): Promise<boolean>;
}
export interface CartDependencies { repository: CartRepository; catalog(ids: string[]): Promise<CatalogSnapshot> }
export class CartError extends Error {
  constructor(public status: number, public code: string, message: string, public cart?: CartResponse) { super(message); }
}
function publicProduct(product: StockProduct, unitPriceCentavos: number | null) {
  return { _id: String(product._id), title: product.title, price: product.price, discount: product.discount ?? 0,
    priceAfterDiscount: unitPriceCentavos === null ? null : unitPriceCentavos / 100,
    stock: product.stock, category: product.category ? String(product.category) : null, isActive: product.isActive !== false,
    images: product.images || [], image: product.image, description: product.description || "", brand: product.brand,
    rating: product.rating || { rate: 0, count: 0 }, createdAt: product.createdAt?.toISOString() || "" };
}
export function serializeCart(cart: StoredCart, catalog: CatalogSnapshot): CartResponse {
  const products = new Map(catalog.products.map(product => [String(product._id), product]));
  const activeCategories = new Set(catalog.activeCategoryIds);
  const counts = new Map<string, number>();
  for (const item of cart.items) counts.set(String(item.product), (counts.get(String(item.product)) || 0) + 1);
  let subtotalCentavos = 0;
  let totalQuantity = 0;
  const items: CartLine[] = cart.items.map((item, index) => {
    const productId = String(item.product);
    const product = products.get(productId);
    const issues: CartIssue[] = [];
    const issue = (code: CartIssueCode, message: string) => issues.push({ productId, code, message });
    const available = !!product && product.isActive !== false && activeCategories.has(String(product.category));
    const stock = product && Number.isSafeInteger(product.stock) && product.stock >= 0 ? product.stock : 0;
    const validQuantity = Number.isSafeInteger(item.quantity) && item.quantity > 0;
    if (!available) issue("UNAVAILABLE", "This product is unavailable. Remove it to continue.");
    if (!validQuantity) issue("INVALID_QUANTITY", "Quantity must be a positive safe integer. Remove this invalid line.");
    if (validQuantity && item.quantity > stock) issue("INSUFFICIENT_STOCK", `Only ${stock} currently available. Reduce the quantity or remove this item.`);
    if ((counts.get(productId) || 0) > 1) issue("DUPLICATE_PRODUCT", "Duplicate legacy cart lines must be removed before checkout.");
    if (validQuantity) {
      if (Number.isSafeInteger(totalQuantity + item.quantity)) totalQuantity += item.quantity;
      else issue('INVALID_QUANTITY','Total quantity exceeds the safe integer range.');
    }
    let unitPriceCentavos: number | null = null;
    let lineTotalCentavos: number | null = null;
    if (product) {
      try {
        unitPriceCentavos = effectivePriceCentavos(product.price, product.discount);
        if (validQuantity) {
          const line = checkedMultiply(unitPriceCentavos, item.quantity);
          if (!Number.isSafeInteger(subtotalCentavos + line)) throw new Error("Unsafe cart total");
          lineTotalCentavos = line;
          subtotalCentavos += line;

        }
      } catch { issue("INVALID_PRICE", "Current pricing cannot be calculated safely. Remove this item or contact support."); }
    }
    return { _id: item._id ? String(item._id) : `${productId}-${index}`, productId,
      product: product ? publicProduct(product, unitPriceCentavos) : null, quantity: item.quantity,
      price: unitPriceCentavos === null ? null : unitPriceCentavos / 100, unitPriceCentavos,
      lineTotal: lineTotalCentavos === null ? null : lineTotalCentavos / 100, lineTotalCentavos,
      availableStock: stock, available, issues };
  });
  const issues = items.flatMap(item => item.issues);
  return { _id: String(cart._id), user: String(cart.user), version: cart.__v ?? 0, currency: "PHP", items,
    totalQuantity, subtotalCentavos, subtotal: subtotalCentavos / 100, checkoutEligible: items.length > 0 && issues.length === 0, issues };
}

export const cartRepository: CartRepository = {
  find: user => Cart.find({ user }).limit(2).lean<StoredCart[]>(),
  async initialize(user) {
    // The deterministic _id also serializes initialization before the user index is deployed.
    await Cart.updateOne({ _id: user, user }, { $setOnInsert: { user, items: [], __v: 0 } },
      { upsert: true, setDefaultsOnInsert: false, runValidators: true });
  },
  async compareSwap(cart, items) {
    const version = cart.__v ?? 0;
    const result = await Cart.updateOne({ _id: cart._id, user: cart.user,
      ...(version === 0 ? { $or: [{ __v: 0 }, { __v: { $exists: false } }] } : { __v: version }) },
    { $set: { items }, $inc: { __v: 1 } }, { runValidators: true });
    return result.matchedCount === 1;
  },
};
export const cartDependencies: CartDependencies = {
  repository: cartRepository,
  async catalog(ids) {
    const [products, categories] = await Promise.all([
      Product.find({ _id: { $in: ids.filter(id => /^[a-fA-F0-9]{24}$/.test(id)) } }).lean<StockProduct[]>(),
      Category.distinct("_id", { isActive: { $ne: false } }),
    ]);
    return { products, activeCategoryIds: categories.map(String) };
  },
};
function duplicateKey(error: unknown): boolean { return typeof error === "object" && error !== null && "code" in error && error.code === 11000; }
export async function loadCart(user: string, dependencies = cartDependencies): Promise<StoredCart> {
  let carts = await dependencies.repository.find(user);
  if (carts.length > 1) throw new CartError(409, "DUPLICATE_CARTS", "Multiple carts exist for this account. An approved duplicate-cart audit is required.");
  if (carts[0]) return carts[0];
  try { await dependencies.repository.initialize(user); } catch (error) { if (!duplicateKey(error)) throw error; }
  carts = await dependencies.repository.find(user);
  if (carts.length !== 1) throw new CartError(409, "CART_CONFLICT", "Cart initialization conflicted. Please retry or contact support.");
  return carts[0];
}
export async function readCart(user: string, dependencies = cartDependencies): Promise<CartResponse> {
  const cart = await loadCart(user, dependencies);
  return serializeCart(cart, await dependencies.catalog(cart.items.map(item => String(item.product))));
}
/** Snapshot validation only. This neither reserves stock nor makes order placement transactional. */
export async function prepareCartForCheckout(user: string, dependencies = cartDependencies) {
  const stored = await loadCart(user, dependencies);
  const cart = serializeCart(stored, await dependencies.catalog(stored.items.map(item => String(item.product))));
  if (!cart.items.length) throw new CartError(400, "EMPTY_CART", "Cart is empty.", cart);
  if (!cart.checkoutEligible) throw new CartError(409, "INVALID_CART", "Review cart quantities, availability and current prices before checkout.", cart);
  const orderItems = cart.items.map(item => {
    if (!item.product || item.price === null) throw new CartError(409, "INVALID_CART", "Cart contains unavailable products.", cart);
    return { product: item.productId, name: item.product.title, qty: item.quantity, price: item.price,
      image: item.product.image || item.product.images[0] };
  });
  return { stored, cart, orderItems };
}
export type CartMutation = { type: "add" | "increment" | "decrement" | "remove"; productId: string; quantity?: number } | { type: "clear" };
export async function mutateCart(user: string, mutation: CartMutation, dependencies = cartDependencies): Promise<CartResponse> {
  if (mutation.type !== 'clear' && !/^[a-f0-9]{24}$/.test(mutation.productId)) throw new CartError(400,'INVALID_INPUT','Invalid product ID.');
  if (mutation.type === 'add' && (!Number.isSafeInteger(mutation.quantity) || (mutation.quantity ?? 0) < 1)) throw new CartError(400,'INVALID_QUANTITY','Quantity must be a positive safe integer.');
  for (let attempt = 0; attempt < 12; attempt++) {
    const cart = await loadCart(user, dependencies);
    let items = cart.items.map(item => ({ ...item }));
    if (mutation.type === "clear") items = [];
    else if (mutation.type === "remove") {
      const remaining = items.filter(item => String(item.product) !== mutation.productId);
      if (remaining.length === items.length) throw new CartError(404, "ITEM_NOT_FOUND", "Item is not in the cart.");
      items = remaining;
    }
    else {
      const catalog = await dependencies.catalog([...items.map(item => String(item.product)), mutation.productId]);
      const snapshot = serializeCart(cart, catalog);
      const lines = items.filter(item => String(item.product) === mutation.productId);
      if (lines.length > 1) throw new CartError(409, "DUPLICATE_PRODUCT", "Remove duplicate legacy lines before changing this product.", snapshot);
      const line = lines[0];
      if (!line && mutation.type !== "add") throw new CartError(404, "ITEM_NOT_FOUND", "Item is not in the cart.", snapshot);
      if (line && (!Number.isSafeInteger(line.quantity) || line.quantity < 1)) throw new CartError(409, "INVALID_QUANTITY", "Remove the invalid cart line before adding it again.", snapshot);
      const quantity = mutation.type === "decrement" ? line.quantity - 1 : (line?.quantity || 0) + (mutation.type === "increment" ? 1 : mutation.quantity ?? 0);
      if (quantity === 0 && mutation.type === "decrement") items = items.filter(item => item !== line);
      else {
        if (!Number.isSafeInteger(quantity) || quantity < 1) throw new CartError(400, "INVALID_QUANTITY", "Quantity must be a positive safe integer.", snapshot);
        // Decreases are permitted even when a product becomes unavailable or overstocked.
        if (mutation.type !== "decrement") {
          const product = catalog.products.find(product => String(product._id) === mutation.productId);
          if (!product) throw new CartError(404, "PRODUCT_NOT_FOUND", "Product not found.", snapshot);
          if (product.isActive === false || !catalog.activeCategoryIds.includes(String(product.category))) throw new CartError(409, "UNAVAILABLE", "This product is unavailable.", snapshot);
          if (!Number.isSafeInteger(product.stock) || product.stock < 0) throw new CartError(409, "UNAVAILABLE", "Stock is unavailable for this product.", snapshot);
          if (quantity > product.stock) throw new CartError(409, "INSUFFICIENT_STOCK", `Only ${product.stock} currently available.`, snapshot);
          let price: number;
          try { price = effectivePriceCentavos(product.price, product.discount) / 100; } catch { throw new CartError(409, "INVALID_PRICE", "This product has invalid pricing.", snapshot); }
          if (line) { line.quantity = quantity; line.price = price; }
          else items.push({ _id: new Types.ObjectId(), product: new Types.ObjectId(mutation.productId), quantity, price });
        } else line.quantity = quantity;
      }
    }
    if (await dependencies.repository.compareSwap(cart, items)) return readCart(user, dependencies);
  }
  throw new CartError(409, "CART_BUSY", "Your cart changed repeatedly. Refresh it and try again.");
}
