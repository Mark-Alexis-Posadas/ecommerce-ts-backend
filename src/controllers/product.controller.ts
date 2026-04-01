import { Request, Response } from "express";
import Product from "../models/product.model";

export const getProducts = async (req: Request, res: Response) => {
  try {
    // query params
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;

    const skip = (page - 1) * limit;

    // data
    const [products, total] = await Promise.all([
      Product.find()
        .sort({ createdAt: -1 }) // latest first (better UX)
        .skip(skip)
        .limit(limit),
      Product.countDocuments(),
    ]);

    const totalPages = Math.ceil(total / limit);

    // meta
    const meta = {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    };

    // build base URL (dynamic)
    const baseUrl = `${req.protocol}://${req.get("host")}${req.baseUrl}${req.path}`;

    // links
    const links = {
      next: meta.hasNextPage
        ? `${baseUrl}?page=${page + 1}&limit=${limit}`
        : null,
      prev: meta.hasPrevPage
        ? `${baseUrl}?page=${page - 1}&limit=${limit}`
        : null,
    };

    res.json({
      data: products,
      meta,
      links,
    });
  } catch (error) {
    res.status(500).json({
      error: {
        message: "Failed to fetch products",
      },
    });
  }
};

export const getProductById = async (req: Request, res: Response) => {
  try {
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    res.json(product);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch product" });
  }
};

export const createProduct = async (req: Request, res: Response) => {
  try {
    const product = await Product.create(req.body);
    res.status(201).json(product);
  } catch (error) {
    res.status(400).json({ message: "Failed to create product" });
  }
};

export const updateProduct = async (req: Request, res: Response) => {
  try {
    const product = await Product.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    });

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    res.json(product);
  } catch (error) {
    res.status(400).json({ message: "Failed to update product" });
  }
};

export const deleteProduct = async (req: Request, res: Response) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    res.json({ message: "Product deleted" });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete product" });
  }
};

export const getCategories = async (req: Request, res: Response) => {
  try {
    const categories = await Product.distinct("category");

    res.json({
      data: categories,
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch categories",
    });
  }
};
