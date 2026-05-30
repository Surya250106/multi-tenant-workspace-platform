import { Response, NextFunction } from 'express';
import { RequestWithWorkspace } from '../middleware/rbac';
import { prisma } from '../prisma/client';
import { AppError } from '../utils/errors';
import { sendSuccess } from '../utils/response';

/**
 * PROJECTS
 */

export async function createProject(req: RequestWithWorkspace, res: Response, next: NextFunction) {
  try {
    const { workspaceId } = req.params;
    const { name, description } = req.body;

    // Automatic board creation in an atomic database transaction
    const result = await prisma.$transaction(async (tx) => {
      const proj = await tx.project.create({
        data: {
          workspace_id: workspaceId,
          name,
          description
        }
      });

      const defaultBoards = ['To Do', 'In Progress', 'In Review', 'Done'];
      const boards = [];

      for (const boardName of defaultBoards) {
        const board = await tx.board.create({
          data: {
            project_id: proj.id,
            name: boardName
          }
        });
        boards.push(board);
      }

      return { project: proj, boards };
    });

    return sendSuccess(res, result, 211);
  } catch (err) {
    next(err);
  }
}

export async function getProjects(req: RequestWithWorkspace, res: Response, next: NextFunction) {
  try {
    const { workspaceId } = req.params;

    const projects = await prisma.project.findMany({
      where: { workspace_id: workspaceId },
      include: {
        boards: {
          select: { id: true, name: true }
        }
      }
    });

    return sendSuccess(res, { projects });
  } catch (err) {
    next(err);
  }
}

export async function getProjectById(req: RequestWithWorkspace, res: Response, next: NextFunction) {
  try {
    const { projectId } = req.params;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        boards: true
      }
    });

    if (!project) {
      throw new AppError('RESOURCE_NOT_FOUND', 'Project not found', 404);
    }

    return sendSuccess(res, { project });
  } catch (err) {
    next(err);
  }
}

export async function updateProject(req: RequestWithWorkspace, res: Response, next: NextFunction) {
  try {
    const { projectId } = req.params;
    const { name, description } = req.body;

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      throw new AppError('RESOURCE_NOT_FOUND', 'Project not found', 404);
    }

    const updated = await prisma.project.update({
      where: { id: projectId },
      data: { name, description }
    });

    return sendSuccess(res, { project: updated });
  } catch (err) {
    next(err);
  }
}

export async function deleteProject(req: RequestWithWorkspace, res: Response, next: NextFunction) {
  try {
    const { projectId } = req.params;

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      throw new AppError('RESOURCE_NOT_FOUND', 'Project not found', 404);
    }

    await prisma.project.delete({
      where: { id: projectId }
    });

    return sendSuccess(res, { message: 'Project deleted successfully' });
  } catch (err) {
    next(err);
  }
}

/**
 * BOARDS (COLUMNS)
 */

export async function createBoard(req: RequestWithWorkspace, res: Response, next: NextFunction) {
  try {
    const { projectId } = req.params;
    const { name } = req.body;

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      throw new AppError('RESOURCE_NOT_FOUND', 'Project not found', 404);
    }

    const board = await prisma.board.create({
      data: {
        project_id: projectId,
        name
      }
    });

    return sendSuccess(res, { board }, 201);
  } catch (err) {
    next(err);
  }
}

export async function getBoards(req: RequestWithWorkspace, res: Response, next: NextFunction) {
  try {
    const { projectId } = req.params;

    const boards = await prisma.board.findMany({
      where: { project_id: projectId },
      orderBy: { created_at: 'asc' }
    });

    return sendSuccess(res, { boards });
  } catch (err) {
    next(err);
  }
}

export async function updateBoard(req: RequestWithWorkspace, res: Response, next: NextFunction) {
  try {
    const { boardId } = req.params;
    const { name } = req.body;

    const board = await prisma.board.findUnique({ where: { id: boardId } });
    if (!board) {
      throw new AppError('RESOURCE_NOT_FOUND', 'Board not found', 404);
    }

    const updated = await prisma.board.update({
      where: { id: boardId },
      data: { name }
    });

    return sendSuccess(res, { board: updated });
  } catch (err) {
    next(err);
  }
}

export async function deleteBoard(req: RequestWithWorkspace, res: Response, next: NextFunction) {
  try {
    const { boardId } = req.params;

    const board = await prisma.board.findUnique({ where: { id: boardId } });
    if (!board) {
      throw new AppError('RESOURCE_NOT_FOUND', 'Board not found', 404);
    }

    await prisma.board.delete({
      where: { id: boardId }
    });

    return sendSuccess(res, { message: 'Board deleted successfully' });
  } catch (err) {
    next(err);
  }
}
