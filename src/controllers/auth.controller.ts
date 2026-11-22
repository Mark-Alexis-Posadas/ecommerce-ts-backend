import { Request, Response } from "express";
import User from "../models/user.model";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
export const registrationSchema = z.object({ name: z.string().trim().min(1).max(100), email: z.string().trim().toLowerCase().email().max(254), password: z.string().min(8).max(72).refine(value => Buffer.byteLength(value, "utf8") <= 72) });
const loginSchema = registrationSchema.pick({ email: true }).extend({ password: z.string().min(1).max(72) });
const response = (user: {
    _id: {
        toString(): string;
    };
    name: string;
    email: string;
    role?: string;
}) => {
    const secret = process.env.JWT_SECRET;
    if (!secret)
        throw new Error("Authentication unavailable");
    return { _id: user._id.toString(), name: user.name, email: user.email, role: user.role === "admin" ? "admin" : "customer", token: jwt.sign({ id: user._id.toString() }, secret, { algorithm: "HS256", expiresIn: "7d" }) };
};
export const registerUser = async (req: Request, res: Response) => {
    const parsed = registrationSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ message: "Name, valid email and password of 8?72 bytes required" });
    try {
        if (await User.findOne({ email: parsed.data.email }))
            return res.status(409).json({ message: "Account unavailable" });
        if (!process.env.JWT_SECRET)
            throw new Error("Authentication unavailable");
        const user = await User.create({ ...parsed.data, password: await bcrypt.hash(parsed.data.password, 10), role: "customer" });
        return res.status(201).json(response(user));
    }
    catch {
        return res.status(500).json({ message: "Registration failed" });
    }
};
export const loginUser = async (req: Request, res: Response) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(401).json({ message: "Invalid credentials" });
    try {
        const user = await User.findOne({ email: parsed.data.email });
        if (!user || !await bcrypt.compare(parsed.data.password, user.password))
            return res.status(401).json({ message: "Invalid credentials" });
        return res.json(response(user));
    }
    catch {
        return res.status(500).json({ message: "Login failed" });
    }
};
export const logoutUser = (_req: Request, res: Response) => res.json({ message: "Discard the bearer token to log out" });
export const getMe = (req: Request, res: Response) => res.json(req.user);
