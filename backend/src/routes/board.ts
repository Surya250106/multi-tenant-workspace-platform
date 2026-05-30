import { Router } from 'express';
import {
  createBoard,
  getBoards,
  updateBoard,
  deleteBoard
} from '../controllers/project';
import { authMiddleware } from '../middleware/auth';
import { requireWorkspaceRole } from '../middleware/rbac';
import { validate, createBoardSchema, updateBoardSchema } from '../validators/schemas';

const router = Router();

// Enforce authentication on specific routes
router.use('/projects', authMiddleware);
router.use('/boards', authMiddleware);

/**
 * PROJECT BOARD COLUMNS
 */
router.post('/projects/:projectId/boards', requireWorkspaceRole('manager'), validate(createBoardSchema), createBoard);
router.get('/projects/:projectId/boards', requireWorkspaceRole('guest'), getBoards);
router.patch('/boards/:boardId', requireWorkspaceRole('manager'), validate(updateBoardSchema), updateBoard);
router.delete('/boards/:boardId', requireWorkspaceRole('admin'), deleteBoard);

export default router;
