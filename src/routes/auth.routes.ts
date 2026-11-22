import { protect } from '../middlewares/authMiddleware';
import { getMe } from '../controllers/auth.controller';
import { Router } from 'express';
import { registerUser, loginUser, logoutUser } from '../controllers/auth.controller';

const router = Router();

router.get('/me', protect, getMe);
router.post('/signup', registerUser);
router.post('/login', loginUser);
router.post('/logout', logoutUser);

export default router;
