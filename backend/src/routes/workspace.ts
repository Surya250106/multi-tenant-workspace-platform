import { Router } from 'express';
import {
  createWorkspace,
  getWorkspaces,
  getWorkspaceById,
  deleteWorkspace,
  addWorkspaceMember,
  getWorkspaceMembers,
  updateWorkspaceMember,
  deleteWorkspaceMember
} from '../controllers/workspace';
import {
  createProject,
  getProjects,
  getProjectById,
  updateProject,
  deleteProject
} from '../controllers/project';
import { authMiddleware } from '../middleware/auth';
import { requireWorkspaceRole } from '../middleware/rbac';
import { validate, createWorkspaceSchema, addMemberSchema, updateMemberSchema, createProjectSchema, updateProjectSchema } from '../validators/schemas';

const router = Router();

// Apply base authentication middleware
router.use(authMiddleware);

/**
 * WORKSPACE CRUD
 */
router.post('/', validate(createWorkspaceSchema), createWorkspace);
router.get('/', getWorkspaces);
router.get('/:workspaceId', requireWorkspaceRole('guest'), getWorkspaceById);
router.delete('/:workspaceId', requireWorkspaceRole('admin'), deleteWorkspace);

/**
 * WORKSPACE MEMBERS
 */
router.post('/:workspaceId/members', requireWorkspaceRole('manager'), validate(addMemberSchema), addWorkspaceMember);
router.get('/:workspaceId/members', requireWorkspaceRole('guest'), getWorkspaceMembers);
router.patch('/:workspaceId/members/:memberId', requireWorkspaceRole('admin'), validate(updateMemberSchema), updateWorkspaceMember);
router.delete('/:workspaceId/members/:memberId', requireWorkspaceRole('manager'), deleteWorkspaceMember);

/**
 * PROJECTS (Scoped inside workspace)
 */
router.post('/:workspaceId/projects', requireWorkspaceRole('manager'), validate(createProjectSchema), createProject);
router.get('/:workspaceId/projects', requireWorkspaceRole('guest'), getProjects);
router.get('/:workspaceId/projects/:projectId', requireWorkspaceRole('guest'), getProjectById);
router.patch('/:workspaceId/projects/:projectId', requireWorkspaceRole('manager'), validate(updateProjectSchema), updateProject);
router.delete('/:workspaceId/projects/:projectId', requireWorkspaceRole('admin'), deleteProject);

export default router;
