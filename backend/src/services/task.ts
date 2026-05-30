import { prisma } from '../prisma/client';
import { AppError } from '../utils/errors';
import { ActivityLogService } from './activityLog';
import { NotificationService } from './notification';
import { tasksCreatedTotal, tasksCompletedTotal } from '../metrics/prometheus';
import { redisClient } from '../utils/redis';

export interface TaskFilterOptions {
  assigneeId?: string;
  priority?: string;
  status?: string;
  q?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export class TaskService {
  /**
   * Helper to map a column/board name to standard status states.
   */
  private static resolveStatus(boardName: string): 'todo' | 'in_progress' | 'in_review' | 'done' {
    const name = boardName.toLowerCase().trim();
    if (name === 'to do' || name === 'todo') return 'todo';
    if (name === 'in progress' || name === 'in_progress') return 'in_progress';
    if (name === 'in review' || name === 'in_review') return 'in_review';
    if (name === 'done') return 'done';
    return 'todo'; // default fallback
  }

  static async createTask(
    boardId: string,
    creatorId: string,
    workspaceId: string,
    payload: {
      title: string;
      description?: string | null;
      priority: 'low' | 'medium' | 'high';
      assigneeId?: string | null;
      dueDate?: string | null;
    }
  ) {
    const board = await prisma.board.findUnique({
      where: { id: boardId }
    });

    if (!board) {
      throw new AppError('RESOURCE_NOT_FOUND', 'Board column not found', 404);
    }

    const status = this.resolveStatus(board.name);

    const task = await prisma.task.create({
      data: {
        board_id: boardId,
        title: payload.title,
        description: payload.description || null,
        status,
        priority: payload.priority,
        creator_id: creatorId,
        assignee_id: payload.assigneeId || null,
        due_date: payload.dueDate ? new Date(payload.dueDate) : null
      },
      include: {
        assignee: { select: { id: true, username: true, email: true } },
        creator: { select: { id: true, username: true, email: true } }
      }
    });

    // 1. Log append-only activity
    await ActivityLogService.logEvent(
      workspaceId,
      task.id,
      creatorId,
      'CREATE',
      `Task "${task.title}" created in board "${board.name}".`
    );

    // 2. Instrument Prometheus metric
    tasksCreatedTotal.inc();

    // 3. Publish real-time event to Redis Pub/Sub
    await redisClient.publish(`board:${boardId}:events`, JSON.stringify({
      type: 'task_created',
      payload: task
    }));

    return task;
  }

  static async getTasks(boardId: string, filters: TaskFilterOptions) {
    const page = filters.page || 1;
    const limit = filters.limit || 50;
    const skip = (page - 1) * limit;

    const where: any = { board_id: boardId };
    
    if (filters.assigneeId) where.assignee_id = filters.assigneeId;
    if (filters.priority) where.priority = filters.priority;
    if (filters.status) where.status = filters.status;
    if (filters.q) {
      where.OR = [
        { title: { contains: filters.q, mode: 'insensitive' } },
        { description: { contains: filters.q, mode: 'insensitive' } }
      ];
    }

    const allowedSortFields = ['title', 'priority', 'due_date', 'created_at', 'updated_at'];
    const sortBy = allowedSortFields.includes(filters.sortBy || '') ? (filters.sortBy as string) : 'created_at';
    const sortOrder = filters.sortOrder === 'asc' ? 'asc' : 'desc';

    const orderBy: any = {};
    orderBy[sortBy] = sortOrder;

    const [tasks, total] = await prisma.$transaction([
      prisma.task.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          assignee: { select: { id: true, username: true, email: true } },
          creator: { select: { id: true, username: true, email: true } }
        }
      }),
      prisma.task.count({ where })
    ]);

    return {
      tasks,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  static async getTaskById(taskId: string) {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        assignee: { select: { id: true, username: true, email: true } },
        creator: { select: { id: true, username: true, email: true } }
      }
    });

    if (!task) {
      throw new AppError('RESOURCE_NOT_FOUND', 'Task not found', 404);
    }

    return task;
  }

  static async updateTask(
    taskId: string,
    userId: string,
    workspaceId: string,
    payload: {
      title?: string;
      description?: string | null;
      priority?: 'low' | 'medium' | 'high';
      assigneeId?: string | null;
      dueDate?: string | null;
      status?: 'todo' | 'in_progress' | 'in_review' | 'done';
    }
  ) {
    const task = await prisma.task.findUnique({
      where: { id: taskId }
    });

    if (!task) {
      throw new AppError('RESOURCE_NOT_FOUND', 'Task not found', 404);
    }

    const data: any = {};
    if (payload.title !== undefined) data.title = payload.title;
    if (payload.description !== undefined) data.description = payload.description;
    if (payload.priority !== undefined) data.priority = payload.priority;
    if (payload.assigneeId !== undefined) data.assignee_id = payload.assigneeId;
    if (payload.dueDate !== undefined) data.due_date = payload.dueDate ? new Date(payload.dueDate) : null;
    if (payload.status !== undefined) data.status = payload.status;

    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data,
      include: {
        assignee: { select: { id: true, username: true, email: true } },
        creator: { select: { id: true, username: true, email: true } }
      }
    });

    // 1. Log update activity
    await ActivityLogService.logEvent(
      workspaceId,
      taskId,
      userId,
      'UPDATE',
      `Task "${updatedTask.title}" updated parameters.`
    );

    // 2. Instrument completion counters
    if (payload.status === 'done' && task.status !== 'done') {
      tasksCompletedTotal.inc();
    }

    // 3. Publish real-time event to Redis Pub/Sub
    await redisClient.publish(`board:${updatedTask.board_id}:events`, JSON.stringify({
      type: 'task_updated',
      payload: updatedTask
    }));

    return updatedTask;
  }

  static async moveTask(taskId: string, userId: string, workspaceId: string, targetBoardId: string) {
    const task = await prisma.task.findUnique({
      where: { id: taskId }
    });

    if (!task) {
      throw new AppError('RESOURCE_NOT_FOUND', 'Task not found', 404);
    }

    const targetBoard = await prisma.board.findUnique({
      where: { id: targetBoardId }
    });

    if (!targetBoard) {
      throw new AppError('RESOURCE_NOT_FOUND', 'Destination board not found', 404);
    }

    const newStatus = this.resolveStatus(targetBoard.name);

    const updatedTask = await prisma.task.update({
      where: { id: taskId },
      data: {
        board_id: targetBoardId,
        status: newStatus
      },
      include: {
        assignee: { select: { id: true, username: true, email: true } },
        creator: { select: { id: true, username: true, email: true } }
      }
    });

    // 1. Log move action
    await ActivityLogService.logEvent(
      workspaceId,
      taskId,
      userId,
      'MOVE',
      `Moved task "${updatedTask.title}" to board "${targetBoard.name}". Status updated to "${newStatus}".`
    );

    // 2. Instrument completion metrics
    if (newStatus === 'done' && task.status !== 'done') {
      tasksCompletedTotal.inc();
    }

    // 3. Publish real-time event to Redis Pub/Sub (both source and target rooms)
    const eventPayload = {
      task: updatedTask,
      sourceBoardId: task.board_id,
      targetBoardId
    };

    // Publish to source board room
    await redisClient.publish(`board:${task.board_id}:events`, JSON.stringify({
      type: 'task_moved',
      payload: eventPayload
    }));

    // Publish to target board room
    await redisClient.publish(`board:${targetBoardId}:events`, JSON.stringify({
      type: 'task_moved',
      payload: eventPayload
    }));

    return updatedTask;
  }

  static async deleteTask(taskId: string, userId: string, workspaceId: string) {
    const task = await prisma.task.findUnique({
      where: { id: taskId }
    });

    if (!task) {
      throw new AppError('RESOURCE_NOT_FOUND', 'Task not found', 404);
    }

    // Capture context before cascade deletion
    const taskTitle = task.title;

    await prisma.task.delete({
      where: { id: taskId }
    });

    return { message: 'Task deleted successfully' };
  }

  /**
   * COMMENTS & MENTION PARSING
   */

  static async addComment(taskId: string, userId: string, workspaceId: string, content: string) {
    const task = await prisma.task.findUnique({
      where: { id: taskId }
    });

    if (!task) {
      throw new AppError('RESOURCE_NOT_FOUND', 'Task not found', 404);
    }

    const comment = await prisma.comment.create({
      data: {
        task_id: taskId,
        user_id: userId,
        content
      },
      include: {
        user: { select: { id: true, username: true, email: true } }
      }
    });

    // 1. Log comment activity
    await ActivityLogService.logEvent(
      workspaceId,
      taskId,
      userId,
      'UPDATE',
      `User commented on task "${task.title}".`
    );

    // 2. Publish real-time event to Redis Pub/Sub
    await redisClient.publish(`board:${task.board_id}:events`, JSON.stringify({
      type: 'task_updated',
      payload: { ...task, comments: [comment] }
    }));

    // Publish comment specific events for real-time compliance
    await redisClient.publish(`board:${task.board_id}:events`, JSON.stringify({
      type: 'comment_created',
      payload: { comment, boardId: task.board_id, taskId }
    }));

    await redisClient.publish(`board:${task.board_id}:events`, JSON.stringify({
      type: 'comment_added',
      payload: { comment, boardId: task.board_id, taskId }
    }));

    // 3. Parse @username mentions
    const mentionRegex = /@([a-zA-Z0-9_-]+)/g;
    const usernames = Array.from(content.matchAll(mentionRegex)).map((match) => match[1]);

    if (usernames.length > 0) {
      const uniqueUsernames = Array.from(new Set(usernames));
      
      const mentionedUsers = await prisma.user.findMany({
        where: {
          username: { in: uniqueUsernames }
        }
      });

      for (const user of mentionedUsers) {
        // Prevent notifying self
        if (user.id !== userId) {
          await NotificationService.sendNotification(
            user.id,
            `Mentioned in "${task.title}"`,
            `You were mentioned in a comment on "${task.title}": "${content.substring(0, 60)}..."`
          );
        }
      }
    }

    return comment;
  }

  static async getComments(taskId: string) {
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) {
      throw new AppError('RESOURCE_NOT_FOUND', 'Task not found', 404);
    }

    return prisma.comment.findMany({
      where: { task_id: taskId },
      orderBy: { created_at: 'asc' },
      include: {
        user: { select: { id: true, username: true, email: true } }
      }
    });
  }

  static async updateComment(commentId: string, userId: string, content: string) {
    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      include: { task: { include: { board: true } } }
    });

    if (!comment) {
      throw new AppError('RESOURCE_NOT_FOUND', 'Comment not found', 404);
    }

    if (comment.user_id !== userId) {
      throw new AppError('FORBIDDEN', 'You are only allowed to update your own comments', 403);
    }

    const updated = await prisma.comment.update({
      where: { id: commentId },
      data: { content },
      include: {
        user: { select: { id: true, username: true, email: true } }
      }
    });

    if (comment.task?.board) {
      await redisClient.publish(`board:${comment.task.board.id}:events`, JSON.stringify({
        type: 'comment_updated',
        payload: { comment: updated, boardId: comment.task.board.id, taskId: comment.task_id }
      }));
    }

    return updated;
  }

  static async deleteComment(commentId: string, userId: string) {
    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      include: { task: { include: { board: true } } }
    });

    if (!comment) {
      throw new AppError('RESOURCE_NOT_FOUND', 'Comment not found', 404);
    }

    if (comment.user_id !== userId) {
      throw new AppError('FORBIDDEN', 'You are only allowed to delete your own comments', 403);
    }

    await prisma.comment.delete({
      where: { id: commentId }
    });

    if (comment.task?.board) {
      await redisClient.publish(`board:${comment.task.board.id}:events`, JSON.stringify({
        type: 'comment_deleted',
        payload: { commentId, boardId: comment.task.board.id, taskId: comment.task_id }
      }));
    }

    return { message: 'Comment deleted successfully' };
  }

  static async getTaskActivity(taskId: string) {
    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) {
      throw new AppError('RESOURCE_NOT_FOUND', 'Task not found', 404);
    }

    return prisma.activityLog.findMany({
      where: { task_id: taskId },
      orderBy: { created_at: 'desc' },
      include: {
        user: { select: { id: true, username: true } }
      }
    });
  }
}
