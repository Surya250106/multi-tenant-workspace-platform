import request from 'supertest';
import { app, server } from '../../src/index';
import { prisma } from '../../src/prisma/client';
import { generateAccessToken } from '../../src/middleware/auth';
import { io as ClientIO } from 'socket.io-client';
import { AddressInfo } from 'net';

describe('Evaluator Compliance and Telemetry Integration Tests', () => {
  let adminToken: string = '';
  let managerToken: string = '';
  let memberToken: string = '';
  let nonMemberToken: string = '';

  let adminUser: any;
  let managerUser: any;
  let memberUser: any;
  let nonMemberUser: any;

  let workspaceId: string = '';
  let projectId: string = '';
  let boardId: string = '';
  let taskId: string = '';

  let managerMembershipId: string = '';
  let memberMembershipId: string = '';

  beforeAll(async () => {
    // 1. Clean up database
    await prisma.comment.deleteMany();
    await prisma.task.deleteMany();
    await prisma.board.deleteMany();
    await prisma.project.deleteMany();
    await prisma.workspaceMember.deleteMany();
    await prisma.workspace.deleteMany();
    await prisma.user.deleteMany({
      where: {
        email: { contains: 'comp_' }
      }
    });

    // 2. Create users
    adminUser = await prisma.user.create({
      data: { email: 'comp_admin@example.com', username: 'comp_admin', password_hash: 'hash' }
    });
    adminToken = generateAccessToken({ sub: adminUser.id, email: adminUser.email });

    managerUser = await prisma.user.create({
      data: { email: 'comp_manager@example.com', username: 'comp_manager', password_hash: 'hash' }
    });
    managerToken = generateAccessToken({ sub: managerUser.id, email: managerUser.email });

    memberUser = await prisma.user.create({
      data: { email: 'comp_member@example.com', username: 'comp_member', password_hash: 'hash' }
    });
    memberToken = generateAccessToken({ sub: memberUser.id, email: memberUser.email });

    nonMemberUser = await prisma.user.create({
      data: { email: 'comp_non_member@example.com', username: 'comp_non_member', password_hash: 'hash' }
    });
    nonMemberToken = generateAccessToken({ sub: nonMemberUser.id, email: nonMemberUser.email });

    // 3. Create Workspace
    const ws = await prisma.workspace.create({
      data: { name: 'Compliance Workspace', slug: 'compliance-ws' }
    });
    workspaceId = ws.id;

    // 4. Create Workspace memberships
    await prisma.workspaceMember.create({
      data: { workspace_id: workspaceId, user_id: adminUser.id, role: 'admin' }
    });

    const mManager = await prisma.workspaceMember.create({
      data: { workspace_id: workspaceId, user_id: managerUser.id, role: 'manager' }
    });
    managerMembershipId = mManager.id;

    const mMember = await prisma.workspaceMember.create({
      data: { workspace_id: workspaceId, user_id: memberUser.id, role: 'member' }
    });
    memberMembershipId = mMember.id;

    // 5. Create project, board, and task
    const project = await prisma.project.create({
      data: { workspace_id: workspaceId, name: 'Compliance Project' }
    });
    projectId = project.id;

    const board = await prisma.board.create({
      data: { project_id: projectId, name: 'To Do' }
    });
    boardId = board.id;

    const task = await prisma.task.create({
      data: { board_id: boardId, title: 'Compliance Task', status: 'todo', priority: 'medium', creator_id: adminUser.id }
    });
    taskId = task.id;
  });

  afterAll(async () => {
    await prisma.comment.deleteMany();
    await prisma.task.deleteMany();
    await prisma.board.deleteMany();
    await prisma.project.deleteMany();
    await prisma.workspaceMember.deleteMany();
    await prisma.workspace.deleteMany();
    await prisma.user.deleteMany({
      where: {
        email: { contains: 'comp_' }
      }
    });
    await prisma.$disconnect();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  describe('User Retention on Ejection', () => {
    it('should NOT soft-delete the User record globally when removing a workspace member', async () => {
      // Remove the member from workspace
      await request(app)
        .delete(`/api/v1/workspaces/${workspaceId}/members/${memberMembershipId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // Verify WorkspaceMember record is deleted
      const memberRecord = await prisma.workspaceMember.findUnique({
        where: { id: memberMembershipId }
      });
      expect(memberRecord).toBeNull();

      // Verify User record still exists and is NOT marked as deleted
      const userRecord = await prisma.user.findUnique({
        where: { id: memberUser.id }
      });
      expect(userRecord).not.toBeNull();
      expect(userRecord?.is_deleted).toBe(false);
    });
  });

  describe('Manager Invitation Restrictions', () => {
    it('should BLOCK Manager from inviting an admin user (HTTP 403)', async () => {
      const invitee = await prisma.user.create({
        data: { email: 'comp_invitee_admin@example.com', username: 'comp_invitee_admin', password_hash: 'hash' }
      });

      await request(app)
        .post(`/api/v1/workspaces/${workspaceId}/members`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ email: invitee.email, role: 'admin' })
        .expect(403);
    });

    it('should BLOCK Manager from inviting a manager user (HTTP 403)', async () => {
      const invitee = await prisma.user.create({
        data: { email: 'comp_invitee_mgr@example.com', username: 'comp_invitee_mgr', password_hash: 'hash' }
      });

      await request(app)
        .post(`/api/v1/workspaces/${workspaceId}/members`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ email: invitee.email, role: 'manager' })
        .expect(403);
    });

    it('should ALLOW Manager to invite a member user (HTTP 201)', async () => {
      const invitee = await prisma.user.create({
        data: { email: 'comp_invitee_mem@example.com', username: 'comp_invitee_mem', password_hash: 'hash' }
      });

      const res = await request(app)
        .post(`/api/v1/workspaces/${workspaceId}/members`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ email: invitee.email, role: 'member' })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.member.role).toBe('member');
    });
  });

  describe('Board Room Authorization (BOLA)', () => {
    let wsPort: number = 0;

    beforeAll(() => {
      const address = server.address() as AddressInfo;
      wsPort = address.port;
    });

    it('should BLOCK non-workspace members from joining board room on socket', (done) => {
      const socket = ClientIO(`http://localhost:${wsPort}`, {
        path: '/socket',
        transports: ['websocket'],
        forceNew: true
      });

      socket.on('connect', () => {
        // Authenticate with non-member token
        socket.emit('auth', { token: nonMemberToken });

        socket.on('auth_success', () => {
          // Attempt to join board in workspace
          socket.emit('join_board', { boardId });

          socket.on('FORBIDDEN_ACTION', (data) => {
            expect(data).toHaveProperty('action', 'join_board');
            socket.disconnect();
            done();
          });

          // It should NOT emit 'joined'
          socket.on('joined', () => {
            socket.disconnect();
            done(new Error('User joined board room despite lack of workspace membership!'));
          });
        });
      });
    });
  });

  describe('Mandatory Analytics Endpoints', () => {
    it('should return task distribution statistics grouped by status', async () => {
      const res = await request(app)
        .get(`/api/v1/workspaces/${workspaceId}/analytics/task-distribution`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('distribution');
      expect(Array.isArray(res.body.data.distribution)).toBe(true);
      
      const todoItem = res.body.data.distribution.find((d: any) => d.status === 'todo');
      expect(todoItem).toBeDefined();
      expect(todoItem.count).toBeGreaterThanOrEqual(1);
    });

    it('should return activity velocity statistics grouped by day', async () => {
      const res = await request(app)
        .get(`/api/v1/workspaces/${workspaceId}/analytics/activity-velocity`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('velocity');
      expect(Array.isArray(res.body.data.velocity)).toBe(true);
      expect(res.body.data.velocity.length).toBe(7); // Last 7 days
    });
  });

  describe('Member Task Edit and Move Creator Allowances', () => {
    let memberCreatedTaskId: string = '';

    beforeAll(async () => {
      // Re-create member user membership since they were ejected
      await prisma.workspaceMember.create({
        data: { workspace_id: workspaceId, user_id: memberUser.id, role: 'member' }
      });

      // Create a task where member is creator but NOT assignee
      const task = await prisma.task.create({
        data: { board_id: boardId, title: 'Member Created Task', status: 'todo', priority: 'low', creator_id: memberUser.id, assignee_id: null }
      });
      memberCreatedTaskId = task.id;
    });

    it('should ALLOW Member to update a task they created, even if unassigned (HTTP 200)', async () => {
      const res = await request(app)
        .patch(`/api/v1/tasks/${memberCreatedTaskId}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ title: 'Title Updated by Creator' })
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('should ALLOW Member to move a task they created, even if unassigned (HTTP 200)', async () => {
      const res = await request(app)
        .patch(`/api/v1/tasks/${memberCreatedTaskId}/move`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ boardId })
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('should ALLOW Member to assign a task they created/own to themselves (HTTP 200)', async () => {
      const res = await request(app)
        .patch(`/api/v1/tasks/${memberCreatedTaskId}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ assigneeId: memberUser.id })
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('should BLOCK Member from assigning tasks they created/own to other users (HTTP 403)', async () => {
      await request(app)
        .patch(`/api/v1/tasks/${memberCreatedTaskId}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ assigneeId: managerUser.id })
        .expect(403);
    });
  });

  describe('Member Task Creation Allowances', () => {
    it('should ALLOW Member to create a task in a board column (HTTP 201)', async () => {
      const res = await request(app)
        .post(`/api/v1/boards/${boardId}/tasks`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({
          title: 'Member new task',
          description: 'A task created by a member',
          priority: 'low',
          assigneeId: memberUser.id
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.task.title).toBe('Member new task');
      expect(res.body.data.task.creator_id).toBe(memberUser.id);
      expect(res.body.data.task.assignee_id).toBe(memberUser.id);
    });
  });
});
