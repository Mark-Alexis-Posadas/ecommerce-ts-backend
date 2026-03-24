import { Request, Response } from "express";
import Product from "../models/product.model";
import axios from "axios";

export const getProducts = async (req: Request, res: Response) => {
  try {
    const { data } = await axios.get("https://fakestoreapi.com/products");
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch products" });
  }
};

export const createProduct = async (req: Request, res: Response) => {
  const product = await Product.create(req.body);
  res.status(201).json(product);
};
