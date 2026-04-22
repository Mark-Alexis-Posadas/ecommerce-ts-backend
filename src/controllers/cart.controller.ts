import { Request, Response } from "express";
import Cart from "../models/cart.model";
import Product from "../models/product.model";

// extend Request para may user
interface AuthRequest extends Request {
  user?: any;
}

// ✅ GET CART
export const getCart = async (req: AuthRequest, res: Response) => {
  try {
    let cart = await Cart.findOne({ user: req.user._id }).populate(
      "items.product",
    );

    if (!cart) {
      cart = await Cart.create({
        user: req.user._id,
        items: [],
      });
    }

    res.json(cart);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// ✅ ADD TO CART
export const addToCart = async (req: AuthRequest, res: Response) => {
  try {
    const { productId, quantity } = req.body;

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    let cart = await Cart.findOne({ user: req.user._id });

    if (!cart) {
      cart = await Cart.create({
        user: req.user._id,
        items: [],
      });
    }

    const itemIndex = cart.items.findIndex(
      (item) => item.product.toString() === productId,
    );

    if (itemIndex > -1) {
      cart.items[itemIndex].quantity =
        (cart.items[itemIndex].quantity || 0) + quantity;
    } else {
      cart.items.push({
        product: productId,
        quantity,
        price: product.priceAfterDiscount || product.price,
      });
    }

    await cart.save();

    // 🔥 IMPORTANT FIX (ETO ANG KULANG MO)
    await cart.populate("items.product");

    res.json({
      message: "Item added to cart",
      items: cart.items,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// ✅ INCREMENT QTY
export const incrementQty = async (req: AuthRequest, res: Response) => {
  try {
    const { productId } = req.body;

    const cart = await Cart.findOne({ user: req.user._id });

    if (!cart) {
      return res.status(404).json({ message: "Cart not found" });
    }

    const itemIndex = cart.items.findIndex(
      (item) => item.product.toString() === productId,
    );

    if (itemIndex === -1) {
      return res.status(404).json({ message: "Item not in cart" });
    }

    cart.items[itemIndex].quantity = (cart.items[itemIndex].quantity || 0) + 1;

    await cart.save();

    const updatedCart = await cart.populate("items.product");

    res.json(updatedCart);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// ✅ DECREMENT QTY
export const decrementQty = async (req: AuthRequest, res: Response) => {
  try {
    const { productId } = req.body;

    const cart = await Cart.findOne({ user: req.user._id });

    if (!cart) {
      return res.status(404).json({ message: "Cart not found" });
    }

    const itemIndex = cart.items.findIndex(
      (item) => item.product.toString() === productId,
    );

    if (itemIndex === -1) {
      return res.status(404).json({ message: "Item not in cart" });
    }

    cart.items[itemIndex].quantity = (cart.items[itemIndex].quantity || 0) - 1;

    // 🔥 auto remove pag 0 na
    if (cart.items[itemIndex].quantity <= 0) {
      cart.items.splice(itemIndex, 1);
    }

    await cart.save();

    const updatedCart = await cart.populate("items.product");

    res.json(updatedCart);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// ✅ REMOVE ITEM
export const removeFromCart = async (req: AuthRequest, res: Response) => {
  try {
    const { productId } = req.params;

    const cart = await Cart.findOne({ user: req.user._id });

    if (!cart) {
      return res.status(404).json({ message: "Cart not found" });
    }

    cart.items.pull({ product: productId });

    await cart.save();

    await cart.populate("items.product");

    res.json({
      message: "Item removed",
      items: cart.items,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

// ✅ CLEAR CART
export const clearCart = async (req: AuthRequest, res: Response) => {
  try {
    const cart = await Cart.findOne({ user: req.user._id });

    if (cart) {
      cart.items.splice(0, cart.items.length);
      await cart.save();
    }

    res.json({ message: "Cart cleared" });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
