import { Request, Response } from "express";
import Product from "../models/product.model";
import { Category } from "../models/category.model";
import mongoose from "mongoose";
export const getProducts = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;

    const search = (req.query.search as string) || "";
    const sort = (req.query.sort as string) || "";
    const category = (req.query.category as string) || "";

    const skip = (page - 1) * limit;

    const query: any = {};

    if (search) {
      query.title = { $regex: search, $options: "i" };
    }

    if (category) {
      query.category = category;
    }

    let sortOption: any = { createdAt: -1 };

    if (sort === "low_to_high") sortOption = { price: 1 };
    if (sort === "high_to_low") sortOption = { price: -1 };
    if (sort === "latest") sortOption = { createdAt: -1 };

    // 🔥 DITO MO ILALAGAY
    const [products, total] = await Promise.all([
      Product.find(query)
        .populate("category") // 👈 HERE
        .sort(sortOption)
        .skip(skip)
        .limit(limit),

      Product.countDocuments(query),
    ]);

    const totalPages = Math.ceil(total / limit);

    res.json({
      data: products,
      meta: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch products",
    });
  }
};

export const getProductById = async (req: Request, res: Response) => {
  try {
    const product = await Product.findById(req.params.id).populate("category");

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    res.json(product);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch product" });
  }
};

export const createProduct = async (req, res) => {
  try {
    const { category } = req.body;

    // ✅ check if valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(category)) {
      return res.status(400).json({ message: "Invalid category ID format" });
    }

    // ✅ check if category exists
    const existingCategory = await Category.findById(category);

    if (!existingCategory) {
      return res.status(400).json({ message: "Category not found" });
    }

    const product = await Product.create({
      ...req.body,
      category,
    });

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
    const categories = await Category.find().sort({ createdAt: -1 });

    res.json({
      data: categories,
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to fetch categories",
    });
  }
};
