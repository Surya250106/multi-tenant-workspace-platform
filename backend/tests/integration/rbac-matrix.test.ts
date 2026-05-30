import request from 'supertest';
import { app, server } from '../../src/index';
import { prisma } from '../../src/prisma/client';
import { generateAccessToken } from '../../src/middleware/auth';

describe('Complete RBAC Permission Matrix & Ownership Checks', () => {
  let adminToken: string = '';
  let managerToken: string = '';
  let memberToken: string = '';
  
  let adminUser: any;
  let managerUser: any;
  let memberUser: any;

  let workspaceId: string = '';
  let projectId: string = '';
  let boardId: string = '';
  
  let adminMemberId: string = '';
  let managerMemberId: string = '';
  let memberMemberId: string = '';

  beforeAll(async () => {
    // Clean up
    await prisma.comment.deleteMany();
    await prisma.task.deleteMany();
    await prisma.board.deleteMany();
    await prisma.project.deleteMany();
    await prisma.workspaceMember.deleteMany();
    await prisma.workspace.deleteMany();
    await prisma.user.deleteMany({
      where: {
        email: { contains: 'matrix_' }
      }
    });

    // Create users
    adminUser = await prisma.user.create({
      data: { email: 'matrix_admin@example.com', username: 'matrix_admin', password_hash: 'hash' }
    });
    adminToken = generateAccessToken({ 
      sub: adminUser.id, 
      email: adminUser.email, 
      workspaceRoles: {} // Will be populated dynamically by controllers if loaded from DB, but we pass roles in DB
    });

    managerUser = await prisma.user.create({
      data: { email: 'matrix_manager@example.com', username: 'matrix_manager', password_hash: 'hash' }
    });
    managerToken = generateAccessToken({ sub: managerUser.id, email: managerUser.email });

    memberUser = await prisma.user.create({
      data: { email: 'matrix_member@example.com', username: 'matrix_member', password_hash: 'hash' }
    });
    memberToken = generateAccessToken({ sub: memberUser.id, email: memberUser.email });

    // Create workspace
    const ws = await prisma.workspace.create({
      data: { name: 'RBAC Matrix Workspace', slug: 'rbac-matrix-workspace' }
    });
    workspaceId = ws.id;

    // Create memberships
    const mAdmin = await prisma.workspaceMember.create({
      data: { workspace_id: workspaceId, user_id: adminUser.id, role: 'admin' }
    });
    adminMemberId = mAdmin.id;

    const mManager = await prisma.workspaceMember.create({
      data: { workspace_id: workspaceId, user_id: managerUser.id, role: 'manager' }
    });
    managerMemberId = mManager.id;

    const mMember = await prisma.workspaceMember.create({
      data: { workspace_id: workspaceId, user_id: memberUser.id, role: 'member' }
    });
    memberMemberId = mMember.id;

    // Create project and default board columns
    const project = await prisma.project.create({
      data: { workspace_id: workspaceId, name: 'RBAC Project' }
    });
    projectId = project.id;

    const board = await prisma.board.create({
      data: { project_id: projectId, name: 'To Do' }
    });
    boardId = board.id;
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
        email: { contains: 'matrix_' }
      }
    });
    await prisma.$disconnect();
    server.close();
  });

  describe('Board and Workspace Authorization', () => {
    it('should BLOCK Manager from deleting a board (HTTP 403)', async () => {
      await request(app)
        .delete(`/api/v1/boards/${boardId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(403);
    });

    it('should ALLOW Admin to delete a board (HTTP 200)', async () => {
      // Create a temporary board to delete
      const tempBoard = await prisma.board.create({
        data: { project_id: projectId, name: 'Temp Column' }
      });

      await request(app)
        .delete(`/api/v1/boards/${tempBoard.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });
  });

  describe('Privilege Escalation and Role Management Rules', () => {
    it('should BLOCK Manager from promoting a Member to Admin (HTTP 403)', async () => {
      await request(app)
        .patch(`/api/v1/workspaces/${workspaceId}/members/${memberMemberId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ role: 'admin' })
        .expect(403);
    });

    it('should BLOCK Manager from editing Admin role details (HTTP 403)', async () => {
      await request(app)
        .patch(`/api/v1/workspaces/${workspaceId}/members/${adminMemberId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ role: 'member' })
        .expect(403);
    });

    it('should ALLOW Admin to demote a Manager to Member (HTTP 200)', async () => {
      // Create temp manager
      const tempUser = await prisma.user.create({
        data: { email: 'matrix_temp_mgr@example.com', username: 'matrix_temp_mgr', password_hash: 'hash' }
      });
      const tempMember = await prisma.workspaceMember.create({
        data: { workspace_id: workspaceId, user_id: tempUser.id, role: 'manager' }
      });

      await request(app)
        .patch(`/api/v1/workspaces/${workspaceId}/members/${tempMember.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'member' })
        .expect(200);
    });
  });

  describe('Eviction and User Deletion Rules', () => {
    it('should BLOCK Admin from deleting themselves from the workspace (HTTP 403)', async () => {
      await request(app)
        .delete(`/api/v1/workspaces/${workspaceId}/members/${adminMemberId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(403);
    });

    it('should BLOCK Manager from deleting an Admin member (HTTP 403)', async () => {
      await request(app)
        .delete(`/api/v1/workspaces/${workspaceId}/members/${adminMemberId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(403);
    });

    it('should BLOCK Manager from deleting another Manager member (HTTP 403)', async () => {
      await request(app)
        .delete(`/api/v1/workspaces/${workspaceId}/members/${managerMemberId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(403);
    });

    it('should ALLOW Manager to delete a Member (HTTP 200)', async () => {
      const tempUser = await prisma.user.create({
        data: { email: 'matrix_temp_mem@example.com', username: 'matrix_temp_mem', password_hash: 'hash' }
      });
      const tempMember = await prisma.workspaceMember.create({
        data: { workspace_id: workspaceId, user_id: tempUser.id, role: 'member' }
      });

      await request(app)
        .delete(`/api/v1/workspaces/${workspaceId}/members/${tempMember.id}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(200);
    });
  });

  describe('Comment Operations and Scoped Actions', () => {
    let commentId: string = '';

    beforeEach(async () => {
      // Create a task and a comment by member
      const task = await prisma.task.create({
        data: { board_id: boardId, title: 'Comment Task', status: 'todo', priority: 'low', creator_id: memberUser.id }
      });

      const comment = await prisma.comment.create({
        data: { task_id: task.id, user_id: memberUser.id, content: 'Member Comment' }
      });
      commentId = comment.id;
    });

    it('should ALLOW Member to update their own comment (HTTP 200)', async () => {
      await request(app)
        .patch(`/api/v1/comments/${commentId}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ content: 'Updated Member Comment' })
        .expect(200);
    });

    it('should BLOCK Manager from updating another user comment (HTTP 403)', async () => {
      await request(app)
        .patch(`/api/v1/comments/${commentId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .send({ content: 'Manager Try Hack' })
        .expect(403);
    });

    it('should BLOCK Manager from deleting comments (HTTP 403)', async () => {
      await request(app)
        .delete(`/api/v1/comments/${commentId}`)
        .set('Authorization', `Bearer ${managerToken}`)
        .expect(403);
    });

    it('should ALLOW Admin to delete any user comment (HTTP 200)', async () => {
      await request(app)
        .delete(`/api/v1/comments/${commentId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });

    it('should BLOCK Member from deleting another user comment (HTTP 403)', async () => {
      const task = await prisma.task.create({
        data: { board_id: boardId, title: 'Comment Task Temp', status: 'todo', priority: 'low', creator_id: adminUser.id }
      });
      const otherComment = await prisma.comment.create({
        data: { task_id: task.id, user_id: adminUser.id, content: 'Admin Comment' }
      });

      await request(app)
        .delete(`/api/v1/comments/${otherComment.id}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(403);
    });
  });

  describe('Task Operations and Scoped Card Restrictions', () => {
    let unassignedTaskId: string = '';
    let assignedTaskId: string = '';
    let assignedToOtherTaskId: string = '';

    beforeAll(async () => {
      const task1 = await prisma.task.create({
        data: { board_id: boardId, title: 'Task Unassigned', status: 'todo', priority: 'low', creator_id: adminUser.id }
      });
      unassignedTaskId = task1.id;

      const task2 = await prisma.task.create({
        data: { board_id: boardId, title: 'Task Assigned', status: 'todo', priority: 'low', creator_id: adminUser.id, assignee_id: memberUser.id }
      });
      assignedTaskId = task2.id;

      const task3 = await prisma.task.create({
        data: { board_id: boardId, title: 'Task Assigned to Other', status: 'todo', priority: 'low', creator_id: adminUser.id, assignee_id: adminUser.id }
      });
      assignedToOtherTaskId = task3.id;
    });

    it('should BLOCK Member from updating an unassigned task (HTTP 403)', async () => {
      await request(app)
        .patch(`/api/v1/tasks/${unassignedTaskId}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ title: 'Hacked Title' })
        .expect(403);
    });

    it('should BLOCK Member from updating a task assigned to another user (HTTP 403)', async () => {
      await request(app)
        .patch(`/api/v1/tasks/${assignedToOtherTaskId}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ title: 'Hacked Title' })
        .expect(403);
    });

    it('should BLOCK Member from moving an unassigned task (HTTP 403)', async () => {
      await request(app)
        .patch(`/api/v1/tasks/${unassignedTaskId}/move`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ boardId })
        .expect(403);
    });

    it('should BLOCK Member from moving a task assigned to another user (HTTP 403)', async () => {
      await request(app)
        .patch(`/api/v1/tasks/${assignedToOtherTaskId}/move`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ boardId })
        .expect(403);
    });

    it('should ALLOW Member to update their assigned task parameters (HTTP 200)', async () => {
      await request(app)
        .patch(`/api/v1/tasks/${assignedTaskId}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ title: 'New Assigned Title' })
        .expect(200);
    });

    it('should BLOCK Member from changing assignee of their assigned task (HTTP 403)', async () => {
      await request(app)
        .patch(`/api/v1/tasks/${assignedTaskId}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ assigneeId: managerUser.id })
        .expect(403);
    });

    it('should BLOCK Member from deleting a task (HTTP 403)', async () => {
      await request(app)
        .delete(`/api/v1/tasks/${unassignedTaskId}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(403);
    });
  });
});
