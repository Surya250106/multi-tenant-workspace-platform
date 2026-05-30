import { Router } from 'express';
import {
  register,
  login,
  logout,
  refresh,
  getMe,
  updateMe,
  deleteUser
} from '../controllers/auth';
import { authMiddleware } from '../middleware/auth';
import { loginRateLimiter } from '../middleware/rateLimiter';
import { validate, registerSchema, loginSchema } from '../validators/schemas';

const router = Router();

router.post('/register', validate(registerSchema), register);
router.post('/login', loginRateLimiter, validate(loginSchema), login);
router.post('/logout', logout);
router.post('/refresh', refresh);
router.get('/me', authMiddleware, getMe);
router.patch('/me', authMiddleware, updateMe);
router.delete('/users/:userId', authMiddleware, deleteUser);

export default router;
