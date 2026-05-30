import { prisma } from '../prisma/client';

export class ActivityLogService {
  /**
   * Safely appends a new event log to the database.
   * Note: This service intentionally does not expose any UPDATE or DELETE operations to satisfy the append-only contract.
   */
  static async logEvent(
    workspaceId: string,
    taskId: string,
    userId: string,
    action: 'CREATE' | 'MOVE' | 'UPDATE' | 'DELETE',
    details: string
  ) {
    return prisma.activityLog.create({
      data: {
        workspace_id: workspaceId,
        task_id: taskId,
        user_id: userId,
        action,
        details
      }
    });
  }
}
