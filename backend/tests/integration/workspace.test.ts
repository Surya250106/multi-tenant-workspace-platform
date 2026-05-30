import request from 'supertest';
import { app, server } from '../../src/index';
import { prisma } from '../../src/prisma/client';
import { generateAccessToken } from '../../src/middleware/auth';

describe('Workspace Integration Tests', () => {
  let adminToken: string = '';
  let memberToken: string = '';
  let guestToken: string = '';
  let testWorkspaceId: string = '';
  let adminUserId: string = '';
  let memberUserId: string = '';
  let guestUserId: string = '';
  let memberMembershipId: string = '';

  beforeAll(async () => {
    // 1. Setup users
    await prisma.workspaceMember.deleteMany();
    await prisma.workspace.deleteMany();
    await prisma.user.deleteMany({
      where: {
        email: { contains: 'ws_' }
      }
    });

    const adminUser = await prisma.user.create({
      data: { email: 'ws_admin@example.com', username: 'ws_admin', password_hash: 'hash' }
    });
    adminUserId = adminUser.id;
    adminToken = generateAccessToken({ sub: adminUser.id, email: adminUser.email });

    const memberUser = await prisma.user.create({
      data: { email: 'ws_member@example.com', username: 'ws_member', password_hash: 'hash' }
    });
    memberUserId = memberUser.id;
    memberToken = generateAccessToken({ sub: memberUser.id, email: memberUser.email });

    const guestUser = await prisma.user.create({
      data: { email: 'ws_guest@example.com', username: 'ws_guest', password_hash: 'hash' }
    });
    guestUserId = guestUser.id;
    guestToken = generateAccessToken({ sub: guestUser.id, email: guestUser.email });
  });

  afterAll(async () => {
    await prisma.workspaceMember.deleteMany();
    await prisma.workspace.deleteMany();
    await prisma.user.deleteMany({
      where: {
        email: { contains: 'ws_' }
      }
    });
    await prisma.$disconnect();
    server.close();
  });

  describe('POST /api/v1/workspaces', () => {
    it('should successfully create a workspace and make the creator an admin member', async () => {
      const res = await request(app)
        .post('/api/v1/workspaces')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Collab Workspace',
          slug: 'collab-ws'
        })
        .expect(201);

      expect(res.body).toHaveProperty('success', true);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data).toHaveProperty('name', 'Collab Workspace');
      expect(res.body.data).toHaveProperty('slug', 'collab-ws');

      testWorkspaceId = res.body.data.id;

      // Verify creator admin assignment
      const member = await prisma.workspaceMember.findFirst({
        where: {
          workspace_id: testWorkspaceId,
          user_id: adminUserId
        }
      });
      expect(member).not.toBeNull();
      expect(member?.role).toBe('admin');
    });
  });

  describe('GET /api/v1/workspaces', () => {
    it('should list all workspaces the user is part of', async () => {
      const res = await request(app)
        .get('/api/v1/workspaces')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('success', true);
      expect(res.body.data.workspaces.length).toBeGreaterThan(0);
      expect(res.body.data.workspaces[0]).toHaveProperty('id', testWorkspaceId);
    });
  });

  describe('POST /api/v1/workspaces/:workspaceId/members', () => {
    it('should allow admin to invite users as workspace members', async () => {
      const res = await request(app)
        .post(`/api/v1/workspaces/${testWorkspaceId}/members`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'ws_member@example.com',
          role: 'member'
        })
        .expect(201);

      expect(res.body).toHaveProperty('success', true);
      expect(res.body.data.member).toHaveProperty('role', 'member');
      expect(res.body.data.member.user).toHaveProperty('id', memberUserId);

      memberMembershipId = res.body.data.member.id;
    });

    it('should allow admin to invite users as guest members', async () => {
      const res = await request(app)
        .post(`/api/v1/workspaces/${testWorkspaceId}/members`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'ws_guest@example.com',
          role: 'guest'
        })
        .expect(201);

      expect(res.body).toHaveProperty('success', true);
    });
  });

  describe('GET /api/v1/workspaces/:workspaceId/members', () => {
    it('should allow guest to query members list', async () => {
      const res = await request(app)
        .get(`/api/v1/workspaces/${testWorkspaceId}/members`)
        .set('Authorization', `Bearer ${guestToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('success', true);
      expect(res.body.data.members.length).toBe(3); // admin, member, guest
    });
  });

  describe('PATCH /api/v1/workspaces/:workspaceId/members/:memberId', () => {
    it('should allow admin/manager to update membership roles', async () => {
      const res = await request(app)
        .patch(`/api/v1/workspaces/${testWorkspaceId}/members/${memberMembershipId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          role: 'manager'
        })
        .expect(200);

      expect(res.body).toHaveProperty('success', true);
      expect(res.body.data.member).toHaveProperty('role', 'manager');
    });
  });

  describe('DELETE /api/v1/workspaces/:workspaceId/members/:memberId', () => {
    it('should allow admin/manager to delete memberships', async () => {
      const res = await request(app)
        .delete(`/api/v1/workspaces/${testWorkspaceId}/members/${memberMembershipId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('success', true);

      // Confirm deletion
      const deletedMember = await prisma.workspaceMember.findUnique({
        where: { id: memberMembershipId }
      });
      expect(deletedMember).toBeNull();
    });
  });
});
