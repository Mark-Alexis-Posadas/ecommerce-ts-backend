import { Request, Response } from "express";
import Order from "../models/order.model";
import Cart from "../models/cart.model";
import { orderSchema } from "../validators/orderValidator";
interface AuthRequest extends Request {
  user?: any;
}

// ✅ CREATE ORDER
export const createOrder = async (req: AuthRequest, res: Response) => {
  try {
    // ✅ VALIDATION FIRST
    const parsed = orderSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        message: "Invalid input",
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const { shippingAddress, paymentMethod } = parsed.data;

    const cart = await Cart.findOne({ user: req.user._id }).populate(
      "items.product",
    );

    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ message: "Cart is empty" });
    }

    // ✅ NEVER TRUST FRONTEND PRICE
    const orderItems = cart.items.map((item: any) => ({
      product: item.product._id,
      name: item.product.title,
      qty: item.quantity,
      price: item.price,
      image: item.product.image,
    }));

    const totalPrice = cart.items.reduce(
      (acc: number, item: any) => acc + item.price * item.quantity,
      0,
    );

    const order = await Order.create({
      user: req.user._id,
      orderItems,
      shippingAddress,
      paymentMethod,
      totalPrice,
    });

    cart.items = [];
    await cart.save();

    res.status(201).json(order);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// ✅ GET MY ORDERS
export const getMyOrders = async (req: AuthRequest, res: Response) => {
  try {
    const orders = await Order.find({ user: req.user._id });

    res.json(orders);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// ✅ GET ORDER BY ID
export const getOrderById = async (req: AuthRequest, res: Response) => {
  try {
    const order = await Order.findById(req.params.id).populate(
      "user",
      "name email",
    );

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    res.json(order);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
