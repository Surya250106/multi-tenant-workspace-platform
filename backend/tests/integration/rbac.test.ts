import request from 'supertest';
import { app, server } from '../../src/index';
import { prisma } from '../../src/prisma/client';
import { generateAccessToken } from '../../src/middleware/auth';

describe('Workspace-Scoped RBAC & Permission Integration Tests', () => {
  let adminToken: string = '';
  let managerToken: string = '';
  let memberToken: string = '';
  let guestToken: string = '';
  
  let workspaceId: string = '';
  let projectId: string = '';
  let boardId: string = '';

  beforeAll(async () => {
    // 1. Setup clean DB
    await prisma.board.deleteMany();
    await prisma.project.deleteMany();
    await prisma.workspaceMember.deleteMany();
    await prisma.workspace.deleteMany();
    await prisma.user.deleteMany({
      where: {
        email: { contains: 'rbac_' }
      }
    });

    // 2. Create users
    const adminUser = await prisma.user.create({
      data: { email: 'rbac_admin@example.com', username: 'rbac_admin', password_hash: 'hash' }
    });
    adminToken = generateAccessToken({ sub: adminUser.id, email: adminUser.email });

    const managerUser = await prisma.user.create({
      data: { email: 'rbac_manager@example.com', username: 'rbac_manager', password_hash: 'hash' }
    });
    managerToken = generateAccessToken({ sub: managerUser.id, email: managerUser.email });

    const memberUser = await prisma.user.create({
      data: { email: 'rbac_member@example.com', username: 'rbac_member', password_hash: 'hash' }
    });
    memberToken = generateAccessToken({ sub: memberUser.id, email: memberUser.email });

    const guestUser = await prisma.user.create({
      data: { email: 'rbac_guest@example.com', username: 'rbac_guest', password_hash: 'hash' }
    });
    guestToken = generateAccessToken({ sub: guestUser.id, email: guestUser.email });

    // 3. Create workspace
    const ws = await prisma.workspace.create({
      data: { name: 'RBAC Security WS', slug: 'rbac-security-ws' }
    });
    workspaceId = ws.id;

    // 4. Create workspace memberships with strict roles
    await prisma.workspaceMember.create({
      data: { workspace_id: workspaceId, user_id: adminUser.id, role: 'admin' }
    });

    await prisma.workspaceMember.create({
      data: { workspace_id: workspaceId, user_id: managerUser.id, role: 'manager' }
    });

    await prisma.workspaceMember.create({
      data: { workspace_id: workspaceId, user_id: memberUser.id, role: 'member' }
    });

    await prisma.workspaceMember.create({
      data: { workspace_id: workspaceId, user_id: guestUser.id, role: 'guest' }
    });

    // 5. Create active project under workspace (initiates 4 boards)
    const project = await prisma.project.create({
      data: { workspace_id: workspaceId, name: 'RBAC Guard Project' }
    });
    projectId = project.id;

    // Retrieve one of the boards
    const board = await prisma.board.create({
      data: { project_id: projectId, name: 'RBAC Active Board' }
    });
    boardId = board.id;
  });

  afterAll(async () => {
    await prisma.board.deleteMany();
    await prisma.project.deleteMany();
    await prisma.workspaceMember.deleteMany();
    await prisma.workspace.deleteMany();
    await prisma.user.deleteMany({
      where: {
        email: { contains: 'rbac_' }
      }
    });
    await prisma.$disconnect();
    server.close();
  });

  describe('Permission Validation Gating (RBAC Matrix Checks)', () => {
    
    // Test: Guest permissions
    it('should BLOCK guest from creating a project under a workspace (HTTP 403)', async () => {
      const res = await request(app)
        .post(`/api/v1/workspaces/${workspaceId}/projects`)
        .set('Authorization', `Bearer ${guestToken}`)
        .send({
          name: 'Guest Attempted Project'
        })
        .expect(403);

      expect(res.body).toHaveProperty('success', false);
      expect(res.body.error).toHaveProperty('code', 'FORBIDDEN');
    });

    it('should ALLOW guest to view project details (HTTP 200)', async () => {
      const res = await request(app)
        .get(`/api/v1/workspaces/${workspaceId}/projects/${projectId}`)
        .set('Authorization', `Bearer ${guestToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('success', true);
    });

    // Test: Member permissions
    it('should BLOCK member from adding workspace members (HTTP 403)', async () => {
      const res = await request(app)
        .post(`/api/v1/workspaces/${workspaceId}/members`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({
          email: 'rbac_somebody@example.com',
          role: 'guest'
        })
        .expect(403);

      expect(res.body).toHaveProperty('success', false);
      expect(res.body.error).toHaveProperty('code', 'FORBIDDEN');
    });

    it('should ALLOW member to view workspace members (HTTP 200)', async () => {
      const res = await request(app)
        .get(`/api/v1/workspaces/${workspaceId}/members`)
        .set('Authorization', `Bearer [omitted]`) // Will pass standard memberToken
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('success', true);
    });

    // Test: Manager permissions
    it('should ALLOW manager to create a project column / board (HTTP 201)', async () => {
      const res = await request(app)
        .post(`/api/v1/projects/${projectId}/boards`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({
          name: 'Manager Created Board'
        })
        .expect(201);

      expect(res.body).toHaveProperty('success', true);
    });

    it('should BLOCK manager from deleting a workspace (HTTP 403)', async () => {
      const res = await request(app)
        .delete(`/api/v1/workspaces/${workspaceId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(403);

      expect(res.body).toHaveProperty('success', false);
      expect(res.body.error).toHaveProperty('code', 'FORBIDDEN');
    });

    // Test: Admin permissions
    it('should ALLOW admin to delete the workspace (HTTP 200)', async () => {
      const res = await request(app)
        .delete(`/api/v1/workspaces/${workspaceId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('success', true);

      // Verify deletion in database
      const dbWs = await prisma.workspace.findUnique({
        where: { id: workspaceId }
      });
      expect(dbWs).toBeNull();
    });
  });
});
