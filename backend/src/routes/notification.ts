import { Router } from 'express';
import {
  getUserNotifications,
  markAllAsRead,
  deleteNotification
} from '../controllers/notification';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// Enforce auth middleware globally on notifications
router.use(authMiddleware);

router.get('/', getUserNotifications);
router.patch('/read', markAllAsRead);
router.delete('/:notificationId', deleteNotification);

export default router;
