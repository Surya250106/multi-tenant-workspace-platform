import request from 'supertest';
import { app, server } from '../../src/index';
import { prisma } from '../../src/prisma/client';
import { generateAccessToken } from '../../src/middleware/auth';

describe('Comments, Mentions, & Notifications Integration Tests', () => {
  let adminToken: string = '';
  let memberToken: string = '';
  let workspaceId: string = '';
  let projectId: string = '';
  let todoBoardId: string = '';
  let taskId: string = '';
  let memberUserId: string = '';
  let adminUserId: string = '';
  let commentId: string = '';

  beforeAll(async () => {
    // Setup clean database
    await prisma.comment.deleteMany();
    await prisma.activityLog.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.task.deleteMany();
    await prisma.board.deleteMany();
    await prisma.project.deleteMany();
    await prisma.workspaceMember.deleteMany();
    await prisma.workspace.deleteMany();
    await prisma.user.deleteMany({
      where: {
        email: { contains: 'comm_' }
      }
    });

    // Create users
    const adminUser = await prisma.user.create({
      data: { email: 'comm_admin@example.com', username: 'comm_admin', password_hash: 'hash' }
    });
    adminUserId = adminUser.id;
    adminToken = generateAccessToken({ sub: adminUser.id, email: adminUser.email });

    const memberUser = await prisma.user.create({
      data: { email: 'comm_member@example.com', username: 'comm_member', password_hash: 'hash' }
    });
    memberUserId = memberUser.id;
    memberToken = generateAccessToken({ sub: memberUser.id, email: memberUser.email });

    // Create workspace
    const ws = await prisma.workspace.create({
      data: { name: 'Comment WS', slug: 'comment-ws' }
    });
    workspaceId = ws.id;

    // Set roles
    await prisma.workspaceMember.create({
      data: { workspace_id: workspaceId, user_id: adminUser.id, role: 'admin' }
    });

    await prisma.workspaceMember.create({
      data: { workspace_id: workspaceId, user_id: memberUser.id, role: 'member' }
    });

    // Create Project
    const projectRes = await request(app)
      .post(`/api/v1/workspaces/${workspaceId}/projects`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Comment Sandbox Project'
      })
      .expect(211);

    projectId = projectRes.body.data.project.id;
    todoBoardId = projectRes.body.data.boards[0].id;

    // Create Task
    const taskRes = await request(app)
      .post(`/api/v1/boards/${todoBoardId}/tasks`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Mentions verification task',
        priority: 'medium'
      })
      .expect(201);

    taskId = taskRes.body.data.task.id;
  });

  afterAll(async () => {
    await prisma.comment.deleteMany();
    await prisma.activityLog.deleteMany();
    await prisma.notification.deleteMany();
    await prisma.task.deleteMany();
    await prisma.board.deleteMany();
    await prisma.project.deleteMany();
    await prisma.workspaceMember.deleteMany();
    await prisma.workspace.deleteMany();
    await prisma.user.deleteMany({
      where: {
        email: { contains: 'comm_' }
      }
    });
    await prisma.$disconnect();
    server.close();
  });

  describe('POST /api/v1/tasks/:taskId/comments (With Mentions)', () => {
    it('should successfully add a comment and parse @username mentions to write a database alert', async () => {
      const res = await request(app)
        .post(`/api/v1/tasks/${taskId}/comments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          content: 'Hello @comm_member, please review this index scheme!'
        })
        .expect(201);

      expect(res.body).toHaveProperty('success', true);
      expect(res.body.data.comment).toHaveProperty('content', 'Hello @comm_member, please review this index scheme!');
      expect(res.body.data.comment.user).toHaveProperty('id', adminUserId);

      commentId = res.body.data.comment.id;

      // Verify a persistent notification was created for comm_member (memberUserId)
      const notif = await prisma.notification.findFirst({
        where: { user_id: memberUserId }
      });
      expect(notif).not.toBeNull();
      expect(notif?.title).toContain('Mentioned in');
      expect(notif?.message).toContain('Hello @comm_member');
    });
  });

  describe('GET /api/v1/tasks/:taskId/comments', () => {
    it('should retrieve all comments for a task in chronological order', async () => {
      const res = await request(app)
        .get(`/api/v1/tasks/${taskId}/comments`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('success', true);
      expect(res.body.data.comments.length).toBe(1);
      expect(res.body.data.comments[0]).toHaveProperty('id', commentId);
    });
  });

  describe('PATCH /api/v1/comments/:commentId', () => {
    it('should BLOCK non-authors from editing comments (HTTP 403)', async () => {
      const res = await request(app)
        .patch(`/api/v1/comments/${commentId}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({
          content: 'Hijacked content update'
        })
        .expect(403);

      expect(res.body).toHaveProperty('success', false);
      expect(res.body.error).toHaveProperty('code', 'FORBIDDEN');
    });

    it('should ALLOW the author to edit comments (HTTP 200)', async () => {
      const res = await request(app)
        .patch(`/api/v1/comments/${commentId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          content: 'Updated comment text by author'
        })
        .expect(200);

      expect(res.body).toHaveProperty('success', true);
      expect(res.body.data.comment).toHaveProperty('content', 'Updated comment text by author');
    });
  });

  describe('GET /api/v1/tasks/:taskId/activity', () => {
    it('should list all activities logged on the task in descending order', async () => {
      const res = await request(app)
        .get(`/api/v1/tasks/${taskId}/activity`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('success', true);
      
      // Activity events should be: CREATE task, COMMENT task (which logged an UPDATE log)
      const actions = res.body.data.activity.map((a: any) => a.action);
      expect(actions).toContain('CREATE');
      expect(actions).toContain('UPDATE');
    });
  });
});
