import { Router } from 'express';
import {
  createTask,
  getTasks,
  getTaskById,
  updateTask,
  moveTask,
  deleteTask,
  addComment,
  getComments,
  updateComment,
  deleteComment,
  getTaskActivity
} from '../controllers/task';
import { authMiddleware } from '../middleware/auth';
import { requireWorkspaceRole } from '../middleware/rbac';
import { validate, createTaskSchema, updateTaskSchema, moveTaskSchema, createCommentSchema, updateCommentSchema } from '../validators/schemas';

const router = Router();

// Enforce authentication on specific routes
router.use('/boards', authMiddleware);
router.use('/tasks', authMiddleware);
router.use('/comments', authMiddleware);

/**
 * BOARD TASK CRUD
 */
router.post('/boards/:boardId/tasks', requireWorkspaceRole('member'), validate(createTaskSchema), createTask);
router.get('/boards/:boardId/tasks', requireWorkspaceRole('guest'), getTasks);

/**
 * TASK CRUD
 */
router.get('/tasks/:taskId', requireWorkspaceRole('guest'), getTaskById);
router.patch('/tasks/:taskId', requireWorkspaceRole('member'), validate(updateTaskSchema), updateTask);
router.patch('/tasks/:taskId/move', requireWorkspaceRole('member'), validate(moveTaskSchema), moveTask);
router.delete('/tasks/:taskId', requireWorkspaceRole('manager'), deleteTask);

/**
 * COMMENTS
 */
router.post('/tasks/:taskId/comments', requireWorkspaceRole('member'), validate(createCommentSchema), addComment);
router.get('/tasks/:taskId/comments', requireWorkspaceRole('guest'), getComments);
router.patch('/comments/:commentId', requireWorkspaceRole('member'), validate(updateCommentSchema), updateComment);
router.delete('/comments/:commentId', requireWorkspaceRole('member'), deleteComment);

/**
 * ACTIVITY LOGS
 */
router.get('/tasks/:taskId/activity', requireWorkspaceRole('guest'), getTaskActivity);

export default router;
