import request from 'supertest';
import { app, server } from '../../src/index';
import { prisma } from '../../src/prisma/client';
import { generateAccessToken } from '../../src/middleware/auth';

describe('Board & Project Columns Integration Tests', () => {
  let adminToken: string = '';
  let workspaceId: string = '';
  let projectId: string = '';
  let boardId: string = '';

  beforeAll(async () => {
    // Setup clean database
    await prisma.board.deleteMany();
    await prisma.project.deleteMany();
    await prisma.workspaceMember.deleteMany();
    await prisma.workspace.deleteMany();
    await prisma.user.deleteMany({
      where: {
        email: { contains: 'board_' }
      }
    });

    const user = await prisma.user.create({
      data: { email: 'board_admin@example.com', username: 'board_admin', password_hash: 'hash' }
    });
    adminToken = generateAccessToken({ sub: user.id, email: user.email });

    // Create workspace
    const ws = await prisma.workspace.create({
      data: { name: 'Board Test WS', slug: 'board-test-ws' }
    });
    workspaceId = ws.id;

    // Assign user as workspace admin
    await prisma.workspaceMember.create({
      data: { workspace_id: workspaceId, user_id: user.id, role: 'admin' }
    });
  });

  afterAll(async () => {
    await prisma.board.deleteMany();
    await prisma.project.deleteMany();
    await prisma.workspaceMember.deleteMany();
    await prisma.workspace.deleteMany();
    await prisma.user.deleteMany({
      where: {
        email: { contains: 'board_' }
      }
    });
    await prisma.$disconnect();
    server.close();
  });

  describe('POST /api/v1/workspaces/:workspaceId/projects (Automatic Board Creation)', () => {
    it('should create a project and automatically generate the 4 default columns', async () => {
      const res = await request(app)
        .post(`/api/v1/workspaces/${workspaceId}/projects`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Board Automation Project',
          description: 'A project that automatically designs boards'
        })
        .expect(211); // Custom creation code or standard success code

      expect(res.body).toHaveProperty('success', true);
      expect(res.body.data).toHaveProperty('project');
      expect(res.body.data).toHaveProperty('boards');
      expect(res.body.data.boards.length).toBe(4);

      projectId = res.body.data.project.id;

      // Extract names to assert exact defaults
      const boardNames = res.body.data.boards.map((b: any) => b.name);
      expect(boardNames).toContain('To Do');
      expect(boardNames).toContain('In Progress');
      expect(boardNames).toContain('In Review');
      expect(boardNames).toContain('Done');
    });
  });

  describe('POST /api/v1/projects/:projectId/boards', () => {
    it('should allow manager/admin to manually add custom columns', async () => {
      const res = await request(app)
        .post(`/api/v1/projects/${projectId}/boards`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Backlog Column'
        })
        .expect(201);

      expect(res.body).toHaveProperty('success', true);
      expect(res.body.data.board).toHaveProperty('name', 'Backlog Column');
      expect(res.body.data.board).toHaveProperty('project_id', projectId);

      boardId = res.body.data.board.id;
    });
  });

  describe('GET /api/v1/projects/:projectId/boards', () => {
    it('should list all columns in order', async () => {
      const res = await request(app)
        .get(`/api/v1/projects/${projectId}/boards`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('success', true);
      expect(res.body.data.boards.length).toBe(5); // 4 default + 1 manual
    });
  });

  describe('PATCH /api/v1/boards/:boardId', () => {
    it('should allow column name updates', async () => {
      const res = await request(app)
        .patch(`/api/v1/boards/${boardId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Sprint Backlog'
        })
        .expect(200);

      expect(res.body).toHaveProperty('success', true);
      expect(res.body.data.board).toHaveProperty('name', 'Sprint Backlog');
    });
  });

  describe('DELETE /api/v1/boards/:boardId', () => {
    it('should successfully delete custom columns', async () => {
      const res = await request(app)
        .delete(`/api/v1/boards/${boardId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('success', true);

      // Confirm DB deletion
      const deletedBoard = await prisma.board.findUnique({
        where: { id: boardId }
      });
      expect(deletedBoard).toBeNull();
    });
  });
});
