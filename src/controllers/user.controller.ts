import { Request, Response } from "express";
import User from "../models/user.model";

// GET ALL USERS
export const getUsers = async (req: Request, res: Response) => {
  try {
    const users = await User.find().select("-password").sort({ createdAt: -1 }); // newest first;
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};
