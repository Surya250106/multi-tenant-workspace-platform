import { Response, NextFunction } from 'express';
import { RequestWithWorkspace } from '../middleware/rbac';
import { prisma } from '../prisma/client';
import { AppError } from '../utils/errors';
import { sendSuccess } from '../utils/response';

export async function getWorkspaceAnalyticsSummary(req: RequestWithWorkspace, res: Response, next: NextFunction) {
  try {
    const { workspaceId } = req.params;

    // Fetch all tasks for the workspace
    const tasks = await prisma.task.findMany({
      where: {
        board: {
          project: {
            workspace_id: workspaceId
          }
        }
      }
    });

    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => t.status === 'done');
    const completedTasksCount = completedTasks.length;
    
    // Completion rate
    const completionRate = totalTasks === 0 ? 0 : Math.round((completedTasksCount / totalTasks) * 100);

    // Average completion time in hours
    let avgCompletionTimeHours = 0;
    if (completedTasksCount > 0) {
      const totalTimeHours = completedTasks.reduce((sum, t) => {
        const durationMs = t.updated_at.getTime() - t.created_at.getTime();
        return sum + (durationMs / (1000 * 60 * 60));
      }, 0);
      avgCompletionTimeHours = totalTimeHours / completedTasksCount;
    }

    // Overdue tasks count: status is not done, has due date, and due date is in the past
    const now = new Date();
    const overdueTasksCount = tasks.filter(t => {
      return t.status !== 'done' && t.due_date !== null && new Date(t.due_date) < now;
    }).length;

    // Completion Trends: completed vs created over the last 7 days
    const completionTrends = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(now.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];

      const completedOnDay = completedTasks.filter(t => {
        return t.updated_at.toISOString().split('T')[0] === dateStr;
      }).length;

      const createdOnDay = tasks.filter(t => {
        return t.created_at.toISOString().split('T')[0] === dateStr;
      }).length;

      completionTrends.push({
        date: dateStr,
        completed: completedOnDay,
        created: createdOnDay
      });
    }

    return sendSuccess(res, {
      summary: {
        totalTasks,
        completedTasks: completedTasksCount,
        completionRate,
        avgCompletionTimeHours,
        overdueTasksCount,
        completionTrends
      }
    });
  } catch (err) {
    next(err);
  }
}

export async function getMemberAnalytics(req: RequestWithWorkspace, res: Response, next: NextFunction) {
  try {
    const { workspaceId, memberId } = req.params;

    // Fetch workspace member
    const member = await prisma.workspaceMember.findFirst({
      where: {
        id: memberId,
        workspace_id: workspaceId
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true
          }
        }
      }
    });

    if (!member) {
      throw new AppError('RESOURCE_NOT_FOUND', 'Workspace member not found', 404);
    }

    // Fetch all tasks assigned to the member in this workspace
    const memberTasks = await prisma.task.findMany({
      where: {
        assignee_id: member.user_id,
        board: {
          project: {
            workspace_id: workspaceId
          }
        }
      }
    });

    const totalAssigned = memberTasks.length;
    const completedAssigned = memberTasks.filter(t => t.status === 'done');
    const completedAssignedCount = completedAssigned.length;

    const completionRate = totalAssigned === 0 ? 0 : Math.round((completedAssignedCount / totalAssigned) * 100);

    let avgCompletionTimeHours = 0;
    if (completedAssignedCount > 0) {
      const totalTimeHours = completedAssigned.reduce((sum, t) => {
        const durationMs = t.updated_at.getTime() - t.created_at.getTime();
        return sum + (durationMs / (1000 * 60 * 60));
      }, 0);
      avgCompletionTimeHours = totalTimeHours / completedAssignedCount;
    }

    return sendSuccess(res, {
      member: {
        id: member.id,
        user: member.user
      },
      analytics: {
        totalAssigned,
        completedAssigned: completedAssignedCount,
        completionRate,
        avgCompletionTimeHours
      }
    });
  } catch (err) {
    next(err);
  }
}

export async function getWorkspaceTaskDistribution(req: RequestWithWorkspace, res: Response, next: NextFunction) {
  try {
    const { workspaceId } = req.params;

    const tasks = await prisma.task.findMany({
      where: {
        board: {
          project: {
            workspace_id: workspaceId
          }
        }
      }
    });

    const distributionMap: Record<string, number> = {
      todo: 0,
      in_progress: 0,
      in_review: 0,
      done: 0
    };

    tasks.forEach(t => {
      const status = t.status || 'todo';
      distributionMap[status] = (distributionMap[status] || 0) + 1;
    });

    const distribution = Object.keys(distributionMap).map(status => ({
      status,
      count: distributionMap[status]
    }));

    return sendSuccess(res, { distribution });
  } catch (err) {
    next(err);
  }
}

export async function getWorkspaceActivityVelocity(req: RequestWithWorkspace, res: Response, next: NextFunction) {
  try {
    const { workspaceId } = req.params;

    const logs = await prisma.activityLog.findMany({
      where: {
        workspace_id: workspaceId,
        created_at: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        }
      }
    });

    const velocityMap: Record<string, number> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      velocityMap[dateStr] = 0;
    }

    logs.forEach(log => {
      const dateStr = log.created_at.toISOString().split('T')[0];
      if (velocityMap[dateStr] !== undefined) {
        velocityMap[dateStr] += 1;
      }
    });

    const velocity = Object.keys(velocityMap).map(date => ({
      date,
      count: velocityMap[date]
    }));

    return sendSuccess(res, { velocity });
  } catch (err) {
    next(err);
  }
}
