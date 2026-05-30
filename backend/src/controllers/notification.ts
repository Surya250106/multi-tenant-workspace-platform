import { Response, NextFunction } from 'express';
import { NotificationService } from '../services/notification';
import { sendSuccess } from '../utils/response';
import { AppError } from '../utils/errors';

export async function getUserNotifications(req: any, res: Response, next: NextFunction) {
  try {
    const userId = req.userId;
    if (!userId) {
      throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
    }

    const notifications = await NotificationService.getUserNotifications(userId);
    return sendSuccess(res, { notifications });
  } catch (err) {
    next(err);
  }
}

export async function markAllAsRead(req: any, res: Response, next: NextFunction) {
  try {
    const userId = req.userId;
    if (!userId) {
      throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
    }

    const result = await NotificationService.markAllAsRead(userId);
    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function deleteNotification(req: any, res: Response, next: NextFunction) {
  try {
    const userId = req.userId;
    const { notificationId } = req.params;

    if (!userId) {
      throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
    }

    if (!notificationId) {
      throw new AppError('VALIDATION_ERROR', 'Notification ID is required', 400);
    }

    try {
      const result = await NotificationService.deleteNotification(notificationId, userId);
      return sendSuccess(res, result);
    } catch (err: any) {
      if (err.message === 'Notification not found') {
        throw new AppError('RESOURCE_NOT_FOUND', err.message, 404);
      }
      if (err.message === 'Forbidden') {
        throw new AppError('FORBIDDEN', 'You can only delete your own notifications', 403);
      }
      throw err;
    }
  } catch (err) {
    next(err);
  }
}
