import { Request, Response } from "express";
import { Category } from "../models/category.model";
import Product from "../models/product.model";

export const createCategory = async (req: Request, res: Response) => {
  try {
    const { name, description, image, isActive } = req.body;

    if (!name) {
      return res.status(400).json({
        message: "Category name is required",
      });
    }

    const existingCategory = await Category.findOne({
      name: { $regex: `^${name}$`, $options: "i" },
    });

    if (existingCategory) {
      return res.status(400).json({
        message: "Category already exists",
      });
    }

    const slug = name
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^\w-]/g, "");

    const category = await Category.create({
      name,
      slug,
      description,
      image,
      isActive,
    });

    res.status(201).json(category);
  } catch (error) {
    res.status(500).json({
      message: "Failed to create category",
    });
  }
};

export const deleteCategory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const category = await Category.findById(id);

    if (!category) {
      return res.status(404).json({
        message: "Category not found",
      });
    }

    const productsUsingCategory = await Product.findOne({
      category: id,
    });

    if (productsUsingCategory) {
      return res.status(400).json({
        message: "Cannot delete category. It is being used by products.",
      });
    }

    await Category.findByIdAndDelete(id);

    res.json({
      message: "Category deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      message: "Failed to delete category",
    });
  }
};
