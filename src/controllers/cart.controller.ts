import { Request, Response } from 'express';
import { z } from 'zod';
import { objectId } from '../validators/catalogValidator';
import { CartError, readCart, mutateCart, CartMutation } from '../services/cart.service';
const productBody = z.object({ productId: objectId.transform((id) => id.toLowerCase()) }).strict();
const addBody = productBody
  .extend({ quantity: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER) })
  .strict();
export function cartError(res: Response, error: unknown) {
  if (error instanceof z.ZodError)
    return res.status(400).json({
      code: 'INVALID_INPUT',
      message: 'Invalid cart input',
      errors: error.flatten().fieldErrors,
    });
  if (error instanceof CartError)
    return res.status(error.status).json({
      code: error.code,
      message: error.message,
      ...(error.cart ? { cart: error.cart } : {}),
    });
  return res
    .status(500)
    .json({ code: 'CART_ERROR', message: 'Unable to update cart. Please try again.' });
}
export const getCart = async (req: Request, res: Response) => {
  try {
    return res.json(await readCart(req.user!._id));
  } catch (error) {
    return cartError(res, error);
  }
};
function handler(parse: (req: Request) => CartMutation) {
  return async (req: Request, res: Response) => {
    try {
      return res.json(await mutateCart(req.user!._id, parse(req)));
    } catch (error) {
      return cartError(res, error);
    }
  };
}
export const addToCart = handler((req) => ({ type: 'add', ...addBody.parse(req.body) }));
export const incrementQty = handler((req) => ({
  type: 'increment',
  ...productBody.parse(req.body),
}));
export const decrementQty = handler((req) => ({
  type: 'decrement',
  ...productBody.parse(req.body),
}));
export const removeFromCart = handler((req) => ({
  type: 'remove',
  productId: objectId.parse(req.params.productId).toLowerCase(),
}));
export const clearCart = handler(() => ({ type: 'clear' }));
