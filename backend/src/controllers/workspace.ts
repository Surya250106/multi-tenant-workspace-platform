import { Response, NextFunction } from 'express';
import { RequestWithId } from '../middleware/requestId';
import { RequestWithWorkspace } from '../middleware/rbac';
import { prisma } from '../prisma/client';
import { AppError } from '../utils/errors';
import { sendSuccess } from '../utils/response';

/**
 * WORKSPACES
 */

export async function createWorkspace(req: RequestWithId, res: Response, next: NextFunction) {
  try {
    const userId = req.userId!;
    const { name, slug } = req.body;

    const workspaceSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    // Check slug uniqueness
    const existing = await prisma.workspace.findUnique({ where: { slug: workspaceSlug } });
    if (existing) {
      throw new AppError('CONFLICT', 'Workspace slug is already in use', 409);
    }

    // Enforce workspace creation restriction:
    // If user has existing workspaces, they must be admin in at least one of them.
    const userMemberships = await prisma.workspaceMember.findMany({
      where: { user_id: userId }
    });
    if (userMemberships.length > 0) {
      const hasAdminRole = userMemberships.some(m => m.role === 'admin');
      if (!hasAdminRole) {
        throw new AppError('FORBIDDEN', 'Only workspace administrators are allowed to create workspaces', 403);
      }
    }

    // Transaction to create workspace and assign creator as admin member
    const result = await prisma.$transaction(async (tx) => {
      const ws = await tx.workspace.create({
        data: {
          name,
          slug: workspaceSlug
        }
      });

      await tx.workspaceMember.create({
        data: {
          workspace_id: ws.id,
          user_id: userId,
          role: 'admin'
        }
      });

      return ws;
    });

    return sendSuccess(res, result, 201);
  } catch (err) {
    next(err);
  }
}

export async function getWorkspaces(req: RequestWithId, res: Response, next: NextFunction) {
  try {
    const userId = req.userId!;
    
    // Find all workspaces where user is a member
    const memberships = await prisma.workspaceMember.findMany({
      where: { user_id: userId },
      include: {
        workspace: {
          include: {
            members: {
              where: {
                user: {
                  is_deleted: false
                }
              },
              include: {
                user: {
                  select: { id: true, username: true, email: true }
                }
              }
            }
          }
        }
      }
    });

    const workspaces = memberships.map((m) => ({
      id: m.workspace.id,
      name: m.workspace.name,
      slug: m.workspace.slug,
      role: m.role,
      membersCount: m.workspace.members.length,
      created_at: m.workspace.created_at
    }));

    return sendSuccess(res, { workspaces });
  } catch (err) {
    next(err);
  }
}

export async function getWorkspaceById(req: RequestWithWorkspace, res: Response, next: NextFunction) {
  try {
    const { workspaceId } = req.params;
    const userId = req.userId!;

    const member = await prisma.workspaceMember.findFirst({
      where: {
        workspace_id: workspaceId,
        user_id: userId
      },
      include: {
        workspace: {
          include: {
            projects: true
          }
        }
      }
    });

    if (!member) {
      throw new AppError('FORBIDDEN', 'Access to workspace is forbidden', 403);
    }

    return sendSuccess(res, {
      workspace: {
        id: member.workspace.id,
        name: member.workspace.name,
        slug: member.workspace.slug,
        role: member.role,
        projects: member.workspace.projects
      }
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteWorkspace(req: RequestWithWorkspace, res: Response, next: NextFunction) {
  try {
    const { workspaceId } = req.params;

    await prisma.workspace.delete({
      where: { id: workspaceId }
    });

    return sendSuccess(res, { message: 'Workspace deleted successfully' });
  } catch (err) {
    next(err);
  }
}

/**
 * WORKSPACE MEMBERS
 */

export async function addWorkspaceMember(req: RequestWithWorkspace, res: Response, next: NextFunction) {
  try {
    const { workspaceId } = req.params;
    const { email, role } = req.body;
    const callerRole = req.workspaceRole;

    if (callerRole === 'manager') {
      if (role === 'admin' || role === 'manager') {
        throw new AppError('FORBIDDEN', 'Managers are not allowed to invite users as admin or manager', 403);
      }
    }

    // Lookup user by email
    const userToInvite = await prisma.user.findUnique({ where: { email } });
    if (!userToInvite) {
      throw new AppError('RESOURCE_NOT_FOUND', 'User with this email does not exist', 404);
    }

    // Check if already a member
    const existingMember = await prisma.workspaceMember.findFirst({
      where: {
        workspace_id: workspaceId,
        user_id: userToInvite.id
      }
    });

    if (existingMember) {
      throw new AppError('CONFLICT', 'User is already a member of this workspace', 409);
    }

    const member = await prisma.workspaceMember.create({
      data: {
        workspace_id: workspaceId,
        user_id: userToInvite.id,
        role
      },
      include: {
        user: { select: { id: true, username: true, email: true } }
      }
    });

    return sendSuccess(res, { member }, 201);
  } catch (err) {
    next(err);
  }
}

export async function getWorkspaceMembers(req: RequestWithWorkspace, res: Response, next: NextFunction) {
  try {
    const { workspaceId } = req.params;

    const members = await prisma.workspaceMember.findMany({
      where: {
        workspace_id: workspaceId,
        user: {
          is_deleted: false
        }
      },
      include: {
        user: { select: { id: true, username: true, email: true } }
      }
    });

    return sendSuccess(res, { members });
  } catch (err) {
    next(err);
  }
}

export async function updateWorkspaceMember(req: RequestWithWorkspace, res: Response, next: NextFunction) {
  try {
    const { workspaceId, memberId } = req.params;
    const { role } = req.body;
    const callerRole = req.workspaceRole;

    // Ensure member exists
    const member = await prisma.workspaceMember.findUnique({
      where: { id: memberId }
    });

    if (!member || member.workspace_id !== workspaceId) {
      throw new AppError('RESOURCE_NOT_FOUND', 'Workspace member not found', 404);
    }

    if (callerRole === 'manager') {
      if (role === 'admin') {
        throw new AppError('FORBIDDEN', 'Managers cannot promote users to admin', 403);
      }
      if (member.role === 'admin') {
        throw new AppError('FORBIDDEN', 'Managers cannot modify administrator roles', 403);
      }
    }

    // Prevent demoting the last workspace admin
    if (member.role === 'admin' && role !== 'admin') {
      const adminsCount = await prisma.workspaceMember.count({
        where: { workspace_id: workspaceId, role: 'admin' }
      });
      if (adminsCount <= 1) {
        throw new AppError('FORBIDDEN', 'Cannot demote the last workspace administrator', 403);
      }
    }

    // Update member role
    const updated = await prisma.workspaceMember.update({
      where: { id: memberId },
      data: { role },
      include: {
        user: { select: { id: true, username: true, email: true } }
      }
    });

    return sendSuccess(res, { member: updated });
  } catch (err) {
    next(err);
  }
}

export async function deleteWorkspaceMember(req: RequestWithWorkspace, res: Response, next: NextFunction) {
  try {
    const { workspaceId, memberId } = req.params;
    const callerRole = req.workspaceRole;

    // Ensure member exists
    const member = await prisma.workspaceMember.findUnique({
      where: { id: memberId }
    });

    if (!member || member.workspace_id !== workspaceId) {
      throw new AppError('RESOURCE_NOT_FOUND', 'Workspace member not found', 404);
    }

    // Admin cannot delete themselves
    if (member.user_id === req.userId) {
      if (callerRole === 'admin') {
        throw new AppError('FORBIDDEN', 'Administrators cannot delete themselves from the workspace', 403);
      }
    }

    if (callerRole === 'manager') {
      if (member.role === 'admin') {
        throw new AppError('FORBIDDEN', 'Managers cannot delete workspace administrators', 403);
      }
      if (member.role === 'manager') {
        throw new AppError('FORBIDDEN', 'Managers cannot delete other managers', 403);
      }
    }

    // Cannot remove the last admin
    if (member.role === 'admin') {
      const adminsCount = await prisma.workspaceMember.count({
        where: { workspace_id: workspaceId, role: 'admin' }
      });
      if (adminsCount <= 1) {
        throw new AppError('FORBIDDEN', 'Cannot remove the last workspace administrator', 403);
      }
    }

    // 1. Eject active websocket connections
    const { disconnectUserSocket } = await import('../websocket/server');
    disconnectUserSocket(member.user_id);

    // 2. Remove the WorkspaceMember record
    await prisma.workspaceMember.delete({
      where: { id: memberId }
    });

    return sendSuccess(res, { message: 'Member removed from workspace successfully' });
  } catch (err) {
    next(err);
  }
}
