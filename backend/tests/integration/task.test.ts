import request from 'supertest';
import { app, server } from '../../src/index';
import { prisma } from '../../src/prisma/client';
import { generateAccessToken } from '../../src/middleware/auth';

describe('Task System Integration Tests', () => {
  let adminToken: string = '';
  let workspaceId: string = '';
  let projectId: string = '';
  
  let todoBoardId: string = '';
  let inProgressBoardId: string = '';
  
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
        email: { contains: 'task_' }
      }
    });

    // 2. Setup admin user
    const user = await prisma.user.create({
      data: { email: 'task_admin@example.com', username: 'task_admin', password_hash: 'hash' }
    });
    adminToken = generateAccessToken({ sub: user.id, email: user.email });

    // 3. Setup workspace and project
    const ws = await prisma.workspace.create({
      data: { name: 'Tasks WS', slug: 'tasks-ws' }
    });
    workspaceId = ws.id;

    await prisma.workspaceMember.create({
      data: { workspace_id: workspaceId, user_id: user.id, role: 'admin' }
    });

    const projectRes = await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/projects`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Task Board Project'
      })
      .expect(211); // Custom creation code

    projectId = projectRes.body.data.project.id;
    
    // Default boards are: To Do, In Progress, In Review, Done
    const boards = projectRes.body.data.boards;
    todoBoardId = boards.find((b: any) => b.name === 'To Do').id;
    inProgressBoardId = boards.find((b: any) => b.name === 'In Progress').id;
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
        email: { contains: 'task_' }
      }
    });
    await prisma.$disconnect();
    server.close();
  });

  describe('POST /api/v1/boards/:boardId/tasks (Create Task & Status Mapping)', () => {
    it('should successfully create a task in the To Do board and map status to "todo"', async () => {
      const res = await request(app)
        .post(`/api/v1/boards/${todoBoardId}/tasks`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Database indexing task',
          description: 'Design indexes for high speed lookups',
          priority: 'high',
          dueDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString()
        })
        .expect(201);

      expect(res.body).toHaveProperty('success', true);
      expect(res.body.data.task).toHaveProperty('title', 'Database indexing task');
      expect(res.body.data.task).toHaveProperty('status', 'todo'); // Automatic Mapping check!
      expect(res.body.data.task).toHaveProperty('board_id', todoBoardId);

      taskId = res.body.data.task.id;

      // Verify append-only activity log created
      const activity = await prisma.activityLog.findFirst({
        where: { task_id: taskId }
      });
      expect(activity).not.toBeNull();
      expect(activity?.action).toBe('CREATE');
    });
  });

  describe('Filtering, Pagination, and Sorting (GET /api/v1/boards/:boardId/tasks)', () => {
    beforeAll(async () => {
      // Seed 5 additional tasks to verify pagination/sorting/filtering
      const priorities: Array<'low' | 'medium' | 'high'> = ['low', 'medium', 'high', 'low', 'medium'];
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post(`/api/v1/boards/${todoBoardId}/tasks`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            title: `Task #${i}`,
            description: `Seeded test description number ${i}`,
            priority: priorities[i]
          });
      }
    });

    it('should return paginated results with total count and pagination data', async () => {
      const res = await request(app)
        .get(`/api/v1/boards/${todoBoardId}/tasks`)
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ page: 1, limit: 3 })
        .expect(200);

      expect(res.body).toHaveProperty('success', true);
      expect(res.body.data.tasks.length).toBe(3);
      expect(res.body.data.pagination).toHaveProperty('total', 6); // 1 manual + 5 seeded
      expect(res.body.data.pagination).toHaveProperty('page', 1);
      expect(res.body.data.pagination).toHaveProperty('totalPages', 2);
    });

    it('should filter tasks correctly by priority', async () => {
      const res = await request(app)
        .get(`/api/v1/boards/${todoBoardId}/tasks`)
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ priority: 'high' })
        .expect(200);

      expect(res.body).toHaveProperty('success', true);
      const allHigh = res.body.data.tasks.every((t: any) => t.priority === 'high');
      expect(allHigh).toBe(true);
      expect(res.body.data.tasks.length).toBe(2); // 1 manual + 1 seeded high
    });

    it('should sort tasks correctly by title in descending order', async () => {
      const res = await request(app)
        .get(`/api/v1/boards/${todoBoardId}/tasks`)
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ sortBy: 'title', sortOrder: 'desc' })
        .expect(200);

      expect(res.body).toHaveProperty('success', true);
      const firstTitle = res.body.data.tasks[0].title;
      // "Task #4" should be first in descending sort of Seeded Task titles
      expect(firstTitle).toBe('Task #4');
    });
  });

  describe('PATCH /api/v1/tasks/:taskId/move', () => {
    it('should move task to In Progress column and auto-update status to "in_progress"', async () => {
      const res = await request(app)
        .patch(`/api/v1/tasks/${taskId}/move`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          boardId: inProgressBoardId
        })
        .expect(200);

      expect(res.body).toHaveProperty('success', true);
      expect(res.body.data.task).toHaveProperty('board_id', inProgressBoardId);
      expect(res.body.data.task).toHaveProperty('status', 'in_progress'); // Auto status conversion!

      // Verify append-only activity log has CREATE and MOVE events
      const activities = await prisma.activityLog.findMany({
        where: { task_id: taskId },
        orderBy: { created_at: 'asc' }
      });
      expect(activities.length).toBe(2);
      expect(activities[0].action).toBe('CREATE');
      expect(activities[1].action).toBe('MOVE');
    });
  });
});
