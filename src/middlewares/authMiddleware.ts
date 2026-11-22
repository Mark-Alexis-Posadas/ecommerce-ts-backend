import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/user.model';
export interface AuthUser {
  _id: string;
  name: string;
  email: string;
  role: 'customer' | 'admin';
}
declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}
export type AuthRequest = Request;
export const protect = async (req: Request, res: Response, next: NextFunction) => {
  const match = /^Bearer ([^ ]+)$/i.exec(req.headers.authorization || '');
  if (!match) return res.status(401).json({ message: 'Authentication required' });
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('Authentication unavailable');
    const decoded = jwt.verify(match[1], secret, { algorithms: ['HS256'] });
    if (typeof decoded === 'string' || typeof decoded.id !== 'string')
      throw new Error('Invalid token');
    const user = await User.findById(decoded.id).select('-password');
    if (!user) throw new Error('Invalid user');
    req.user = {
      _id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role === 'admin' ? 'admin' : 'customer',
    };
  } catch {
    return res.status(401).json({ message: 'Invalid or expired authentication' });
  }
  next();
};
export const adminOnly = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) return res.status(401).json({ message: 'Authentication required' });
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin access required' });
  next();
};
export const optionalAuth = (req: Request, res: Response, next: NextFunction) =>
  req.headers.authorization ? protect(req, res, next) : next();
