import { Response, NextFunction } from 'express';
import { prisma } from '../prisma/client';
import { AppError } from '../utils/errors';
import { AuthenticatedRequest } from './auth';

export type WorkspaceRole = 'admin' | 'manager' | 'member' | 'guest';

export interface RequestWithWorkspace extends AuthenticatedRequest {
  workspaceId?: string;
  workspaceMemberId?: string;
  workspaceRole?: WorkspaceRole;
}

const ROLE_WEIGHTS: Record<WorkspaceRole, number> = {
  guest: 1,
  member: 2,
  manager: 3,
  admin: 4
};

export function requireWorkspaceRole(minRole: WorkspaceRole) {
  return async (req: RequestWithWorkspace, _res: Response, next: NextFunction) => {
    try {
      const { workspaceId, projectId, boardId, taskId, commentId } = req.params;
      const userId = req.userId;

      if (!userId) {
        throw new AppError('UNAUTHORIZED', 'Authentication required', 401);
      }

      let resolvedWorkspaceId = workspaceId;

      // If workspaceId is not in parameters, resolve it from project/board/task/comment if needed
      if (!resolvedWorkspaceId && projectId) {
        const project = await prisma.project.findUnique({ where: { id: projectId } });
        if (project) resolvedWorkspaceId = project.workspace_id;
      } else if (!resolvedWorkspaceId && boardId) {
        const board = await prisma.board.findUnique({
          where: { id: boardId },
          include: { project: true }
        });
        if (board?.project) resolvedWorkspaceId = board.project.workspace_id;
      } else if (!resolvedWorkspaceId && taskId) {
        const task = await prisma.task.findUnique({
          where: { id: taskId },
          include: { board: { include: { project: true } } }
        });
        if (task?.board?.project) resolvedWorkspaceId = task.board.project.workspace_id;
      } else if (!resolvedWorkspaceId && commentId) {
        const comment = await prisma.comment.findUnique({
          where: { id: commentId },
          include: { task: { include: { board: { include: { project: true } } } } }
        });
        if (comment?.task?.board?.project) resolvedWorkspaceId = comment.task.board.project.workspace_id;
      }

      if (!resolvedWorkspaceId) {
        throw new AppError('VALIDATION_ERROR', 'Workspace ID could not be determined', 400);
      }

      // Check if user is a member of the workspace
      const member = await prisma.workspaceMember.findUnique({
        where: {
          workspace_id_user_id: {
            workspace_id: resolvedWorkspaceId,
            user_id: userId
          }
        }
      });

      if (!member) {
        throw new AppError('FORBIDDEN', 'You are not a member of this workspace', 403);
      }

      const userRole = member.role as WorkspaceRole;
      const minWeight = ROLE_WEIGHTS[minRole];
      const userWeight = ROLE_WEIGHTS[userRole] || 0;

      if (userWeight < minWeight) {
        throw new AppError('FORBIDDEN', 'Insufficient workspace permissions', 403);
      }

      req.workspaceId = resolvedWorkspaceId;
      req.workspaceMemberId = member.id;
      req.workspaceRole = userRole;

      next();
    } catch (err) {
      next(err);
    }
  };
}
