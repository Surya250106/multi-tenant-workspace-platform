import { Response, NextFunction } from 'express';
import { RequestWithWorkspace } from '../middleware/rbac';
import { TaskService } from '../services/task';
import { sendSuccess } from '../utils/response';
import { prisma } from '../prisma/client';
import { AppError } from '../utils/errors';

/**
 * TASKS CRUD
 */

export async function createTask(req: RequestWithWorkspace, res: Response, next: NextFunction) {
  try {
    const { boardId } = req.params;
    const creatorId = req.userId!;
    const workspaceId = req.workspaceId!;
    const { title, description, priority, assigneeId, dueDate } = req.body;

    const task = await TaskService.createTask(boardId, creatorId, workspaceId, {
      title,
      description,
      priority,
      assigneeId,
      dueDate
    });

    return sendSuccess(res, { task }, 201);
  } catch (err) {
    next(err);
  }
}

export async function getTasks(req: RequestWithWorkspace, res: Response, next: NextFunction) {
  try {
    const { boardId } = req.params;
    const { assigneeId, priority, status, q, page, limit, sortBy, sortOrder } = req.query;

    const filters = {
      assigneeId: assigneeId as string,
      priority: priority as string,
      status: status as string,
      q: q as string,
      page: page ? parseInt(page as string, 10) : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      sortBy: sortBy as string,
      sortOrder: sortOrder as 'asc' | 'desc'
    };

    const result = await TaskService.getTasks(boardId, filters);
    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function getTaskById(req: RequestWithWorkspace, res: Response, next: NextFunction) {
  try {
    const { taskId } = req.params;
    const task = await TaskService.getTaskById(taskId);
    return sendSuccess(res, { task });
  } catch (err) {
    next(err);
  }
}

export async function updateTask(req: RequestWithWorkspace, res: Response, next: NextFunction) {
  try {
    const { taskId } = req.params;
    const userId = req.userId!;
    const workspaceId = req.workspaceId!;
    const userRole = req.workspaceRole;
    const { title, description, priority, assigneeId, dueDate, status } = req.body;

    const existingTask = await prisma.task.findUnique({
      where: { id: taskId }
    });

    if (!existingTask) {
      throw new AppError('RESOURCE_NOT_FOUND', 'Task not found', 404);
    }

    if (userRole === 'member') {
      if (existingTask.assignee_id !== userId && existingTask.creator_id !== userId) {
        throw new AppError('FORBIDDEN', 'Members can only update tasks assigned to or created by them', 403);
      }
      if (assigneeId !== undefined && assigneeId !== userId && assigneeId !== existingTask.assignee_id) {
        throw new AppError('FORBIDDEN', 'Members are not allowed to assign tasks to other users', 403);
      }
    }

    const task = await TaskService.updateTask(taskId, userId, workspaceId, {
      title,
      description,
      priority,
      assigneeId,
      dueDate,
      status
    });

    return sendSuccess(res, { task });
  } catch (err) {
    next(err);
  }
}

export async function moveTask(req: RequestWithWorkspace, res: Response, next: NextFunction) {
  try {
    const { taskId } = req.params;
    const userId = req.userId!;
    const workspaceId = req.workspaceId!;
    const userRole = req.workspaceRole;
    const { boardId } = req.body;

    const existingTask = await prisma.task.findUnique({
      where: { id: taskId }
    });

    if (!existingTask) {
      throw new AppError('RESOURCE_NOT_FOUND', 'Task not found', 404);
    }

    if (userRole === 'member') {
      if (existingTask.assignee_id !== userId && existingTask.creator_id !== userId) {
        throw new AppError('FORBIDDEN', 'Members can only move tasks assigned to or created by them', 403);
      }
    }

    const task = await TaskService.moveTask(taskId, userId, workspaceId, boardId);
    return sendSuccess(res, { task });
  } catch (err) {
    next(err);
  }
}

export async function deleteTask(req: RequestWithWorkspace, res: Response, next: NextFunction) {
  try {
    const { taskId } = req.params;
    const userId = req.userId!;
    const workspaceId = req.workspaceId!;
    const userRole = req.workspaceRole;

    if (userRole === 'member') {
      throw new AppError('FORBIDDEN', 'Members are not allowed to delete tasks', 403);
    }

    const result = await TaskService.deleteTask(taskId, userId, workspaceId);
    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

/**
 * COMMENTS & ACTIVITY LOGS
 */

export async function addComment(req: RequestWithWorkspace, res: Response, next: NextFunction) {
  try {
    const { taskId } = req.params;
    const userId = req.userId!;
    const workspaceId = req.workspaceId!;
    const { content } = req.body;

    const comment = await TaskService.addComment(taskId, userId, workspaceId, content);
    return sendSuccess(res, { comment }, 201);
  } catch (err) {
    next(err);
  }
}

export async function getComments(req: RequestWithWorkspace, res: Response, next: NextFunction) {
  try {
    const { taskId } = req.params;
    const comments = await TaskService.getComments(taskId);
    return sendSuccess(res, { comments });
  } catch (err) {
    next(err);
  }
}

export async function updateComment(req: RequestWithWorkspace, res: Response, next: NextFunction) {
  try {
    const { commentId } = req.params;
    const userId = req.userId!;
    const userRole = req.workspaceRole;
    const { content } = req.body;

    const existingComment = await prisma.comment.findUnique({
      where: { id: commentId }
    });

    if (!existingComment) {
      throw new AppError('RESOURCE_NOT_FOUND', 'Comment not found', 404);
    }

    if (userRole !== 'admin' && existingComment.user_id !== userId) {
      throw new AppError('FORBIDDEN', 'You are only allowed to update your own comments', 403);
    }

    const comment = await TaskService.updateComment(commentId, existingComment.user_id, content);
    return sendSuccess(res, { comment });
  } catch (err) {
    next(err);
  }
}

export async function deleteComment(req: RequestWithWorkspace, res: Response, next: NextFunction) {
  try {
    const { commentId } = req.params;
    const userId = req.userId!;
    const userRole = req.workspaceRole;

    const existingComment = await prisma.comment.findUnique({
      where: { id: commentId }
    });

    if (!existingComment) {
      throw new AppError('RESOURCE_NOT_FOUND', 'Comment not found', 404);
    }

    if (userRole !== 'admin' && existingComment.user_id !== userId) {
      throw new AppError('FORBIDDEN', 'You are only allowed to delete your own comments', 403);
    }

    const result = await TaskService.deleteComment(commentId, existingComment.user_id);
    return sendSuccess(res, result);
  } catch (err) {
    next(err);
  }
}

export async function getTaskActivity(req: RequestWithWorkspace, res: Response, next: NextFunction) {
  try {
    const { taskId } = req.params;
    const activity = await TaskService.getTaskActivity(taskId);
    return sendSuccess(res, { activity });
  } catch (err) {
    next(err);
  }
}
