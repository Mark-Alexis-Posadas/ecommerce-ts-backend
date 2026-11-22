import { protect, adminOnly } from '../middlewares/authMiddleware';
import { Router } from 'express';
import { getUsers } from '../controllers/user.controller';
const router = Router();

router.get('/', protect, adminOnly, getUsers);

export default router;
