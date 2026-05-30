import request from 'supertest';
import { app, server } from '../../src/index';
import { prisma } from '../../src/prisma/client';
import { generateAccessToken } from '../../src/middleware/auth';

describe('Analytics Systems Integration Tests', () => {
  let adminToken: string = '';
  let workspaceId: string = '';
  let memberId: string = '';
  let taskId: string = '';

  beforeAll(async () => {
    // 1. Setup clean database
    await prisma.comment.deleteMany();
    await prisma.activityLog.deleteMany();
    await prisma.task.deleteMany();
    await prisma.board.deleteMany();
    await prisma.project.deleteMany();
    await prisma.workspaceMember.deleteMany();
    await prisma.workspace.deleteMany();
    await prisma.user.deleteMany({
      where: {
        email: { contains: 'anal_' }
      }
    });

    // 2. Setup user and member
    const user = await prisma.user.create({
      data: { email: 'anal_admin@example.com', username: 'anal_admin', password_hash: 'hash' }
    });
    adminToken = generateAccessToken({ sub: user.id, email: user.email });

    const ws = await prisma.workspace.create({
      data: { name: 'Analytics WS', slug: 'analytics-ws' }
    });
    workspaceId = ws.id;

    const membership = await prisma.workspaceMember.create({
      data: { workspace_id: workspaceId, user_id: user.id, role: 'admin' }
    });
    memberId = membership.id;

    // Create project, board, and a completed task to seed analytical calculations
    const project = await prisma.project.create({
      data: { workspace_id: workspaceId, name: 'Analytics Project' }
    });

    const board = await prisma.board.create({
      data: { project_id: project.id, name: 'Done' }
    });

    // Create a task that was created 2 hours ago and finished now (completed)
    const twoHoursAgo = new Date();
    twoHoursAgo.setHours(twoHoursAgo.getHours() - 2);

    const task = await prisma.task.create({
      data: {
        board_id: board.id,
        title: 'Analytical tracking test',
        status: 'done',
        priority: 'high',
        creator_id: user.id,
        assignee_id: user.id,
        created_at: twoHoursAgo,
        updated_at: new Date()
      }
    });
    taskId = task.id;
  });

  afterAll(async () => {
    await prisma.comment.deleteMany();
    await prisma.activityLog.deleteMany();
    await prisma.task.deleteMany();
    await prisma.board.deleteMany();
    await prisma.project.deleteMany();
    await prisma.workspaceMember.deleteMany();
    await prisma.workspace.deleteMany();
    await prisma.user.deleteMany({
      where: {
        email: { contains: 'anal_' }
      }
    });
    await prisma.$disconnect();
    server.close();
  });

  describe('GET /api/v1/workspaces/:workspaceId/analytics/summary', () => {
    it('should aggregate database states and return full KPI statistics summary', async () => {
      const res = await request(app)
        .get(`/api/v1/workspaces/${workspaceId}/analytics/summary`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('success', true);
      expect(res.body.data.summary).toHaveProperty('totalTasks', 1);
      expect(res.body.data.summary).toHaveProperty('completedTasks', 1);
      expect(res.body.data.summary).toHaveProperty('completionRate', 100);
      
      // Since it took 2 hours, velocity avgCompletionTimeHours should be ~2
      expect(res.body.data.summary.avgCompletionTimeHours).toBeCloseTo(2, 0);
      expect(res.body.data.summary).toHaveProperty('overdueTasksCount', 0);
      expect(res.body.data.summary).toHaveProperty('completionTrends');
    });
  });

  describe('GET /api/v1/workspaces/:workspaceId/analytics/member/:memberId', () => {
    it('should aggregate database states and return individual workload analysis', async () => {
      const res = await request(app)
        .get(`/api/v1/workspaces/${workspaceId}/analytics/member/${memberId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('success', true);
      expect(res.body.data.member).toHaveProperty('id', memberId);
      expect(res.body.data.analytics).toHaveProperty('totalAssigned', 1);
      expect(res.body.data.analytics).toHaveProperty('completedAssigned', 1);
      expect(res.body.data.analytics).toHaveProperty('completionRate', 100);
      expect(res.body.data.analytics.avgCompletionTimeHours).toBeCloseTo(2, 0);
    });
  });
});
