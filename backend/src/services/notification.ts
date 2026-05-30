import { prisma } from '../prisma/client';
import { notificationsSentTotal } from '../metrics/prometheus';
import { redisClient } from '../utils/redis';

export class NotificationService {
  /**
   * Persists a notification alert to a specific user and instruments the Prometheus counter.
   */
  static async sendNotification(userId: string, title: string, message: string) {
    const notification = await prisma.notification.create({
      data: {
        user_id: userId,
        title,
        message
      }
    });

    // Instrument metric counter
    notificationsSentTotal.inc();

    // Publish to user private channel
    await redisClient.publish(`user:${userId}:events`, JSON.stringify({
      type: 'notification',
      payload: { notification }
    }));

    return notification;
  }

  /**
   * Retrieves all notifications for a specific user, sorted by creation date descending.
   */
  static async getUserNotifications(userId: string) {
    return prisma.notification.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' }
    });
  }

  /**
   * Marks all unread notifications for a user as read.
   */
  static async markAllAsRead(userId: string) {
    await prisma.notification.updateMany({
      where: {
        user_id: userId,
        is_read: false
      },
      data: {
        is_read: true
      }
    });
    return { message: 'All notifications marked as read' };
  }

  /**
   * Deletes a specific notification belonging to the user.
   */
  static async deleteNotification(notificationId: string, userId: string) {
    const notification = await prisma.notification.findUnique({
      where: { id: notificationId }
    });

    if (!notification) {
      throw new Error('Notification not found');
    }

    if (notification.user_id !== userId) {
      throw new Error('Forbidden');
    }

    await prisma.notification.delete({
      where: { id: notificationId }
    });

    return { message: 'Notification deleted successfully' };
  }
}
