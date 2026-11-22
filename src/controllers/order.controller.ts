import { Request, Response } from 'express';
import { isValidObjectId } from 'mongoose';
import Order from '../models/order.model';
import { orderSchema } from '../validators/orderValidator';
import { prepareCartForCheckout, cartDependencies, CartError } from '../services/cart.service';
import { cartError } from './cart.controller';
type AuthRequest = Request;
export const createOrder = async (req: Request, res: Response) => {
  try {
    const parsed = orderSchema.safeParse(req.body);
    if (!parsed.success)
      return res
        .status(400)
        .json({ message: 'Invalid input', errors: parsed.error.flatten().fieldErrors });
    const { stored, cart, orderItems } = await prepareCartForCheckout(req.user!._id);
    const order = await Order.create({
      user: req.user!._id,
      orderItems,
      ...parsed.data,
      totalPrice: cart.subtotalCentavos / 100,
    });
    const cleared = await cartDependencies.repository.compareSwap(stored, []);
    return res.status(201).json({ ...order.toObject(), cartClearConflict: !cleared });
  } catch (error) {
    if (error instanceof CartError) return cartError(res, error);
    return res.status(500).json({
      code: 'ORDER_ERROR',
      message: 'Unable to complete the order. Check your order history before retrying.',
    });
  }
};
// ✅ GET MY ORDERS
export const getMyOrders = async (req: AuthRequest, res: Response) => {
  try {
    const orders = await Order.find({ user: req.user!._id });
    res.json(orders);
  } catch {
    res.status(500).json({ message: 'Unable to load orders' });
  }
};
// ✅ GET ORDER BY ID
export const getOrderById = async (req: AuthRequest, res: Response) => {
  if (!isValidObjectId(req.params.id)) return res.status(404).json({ message: 'Order not found' });
  try {
    const order = await Order.findOne({ _id: req.params.id, user: req.user!._id }).populate(
      'user',
      'name email',
    );
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    res.json(order);
  } catch {
    res.status(500).json({ message: 'Unable to load order' });
  }
};
