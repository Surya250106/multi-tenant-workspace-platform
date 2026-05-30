import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Clearing database tables...');
  await prisma.comment.deleteMany();
  await prisma.activityLog.deleteMany();
  await prisma.task.deleteMany();
  await prisma.board.deleteMany();
  await prisma.project.deleteMany();
  await prisma.workspaceMember.deleteMany();
  await prisma.workspace.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.user.deleteMany();

  console.log('Seeding user accounts...');
  const alicePasswordHash = await bcrypt.hash('Alice@12345', 12);
  const bobPasswordHash = await bcrypt.hash('Bob@12345', 12);
  const charliePasswordHash = await bcrypt.hash('Charlie@12345', 12);

  const alice = await prisma.user.create({
    data: {
      email: 'alice@example.com',
      username: 'alice',
      password_hash: alicePasswordHash
    }
  });

  const bob = await prisma.user.create({
    data: {
      email: 'bob@example.com',
      username: 'bob',
      password_hash: bobPasswordHash
    }
  });

  const charlie = await prisma.user.create({
    data: {
      email: 'charlie@example.com',
      username: 'charlie',
      password_hash: charliePasswordHash
    }
  });

  console.log('Seeding workspace...');
  const workspace = await prisma.workspace.create({
    data: {
      name: 'test-workspace',
      slug: 'test-workspace'
    }
  });

  console.log('Seeding members...');
  await prisma.workspaceMember.createMany({
    data: [
      { workspace_id: workspace.id, user_id: alice.id, role: 'admin' },
      { workspace_id: workspace.id, user_id: bob.id, role: 'manager' },
      { workspace_id: workspace.id, user_id: charlie.id, role: 'member' }
    ]
  });

  console.log('Seeding projects...');
  const project = await prisma.project.create({
    data: {
      workspace_id: workspace.id,
      name: 'Test Project',
      description: 'Main product launch roadmap for next-gen engine'
    }
  });

  console.log('Seeding default project boards...');
  const todoBoard = await prisma.board.create({
    data: { project_id: project.id, name: 'To Do' }
  });
  
  const inProgressBoard = await prisma.board.create({
    data: { project_id: project.id, name: 'In Progress' }
  });

  const inReviewBoard = await prisma.board.create({
    data: { project_id: project.id, name: 'In Review' }
  });

  const doneBoard = await prisma.board.create({
    data: { project_id: project.id, name: 'Done' }
  });

  console.log('Seeding tasks...');
  // Seed a mix of completed, active, and overdue tasks to enrich telemetry metrics
  const twoDaysAgo = new Date();
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

  const fiveDaysAgo = new Date();
  fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  // Completed task with 48h completion duration
  await prisma.task.create({
    data: {
      board_id: doneBoard.id,
      title: 'Database Schema Migrations',
      description: 'Initialize base relational setup and indexes',
      status: 'done',
      priority: 'high',
      assignee_id: alice.id,
      creator_id: alice.id,
      created_at: fiveDaysAgo,
      updated_at: threeDaysAgo(fiveDaysAgo)
    }
  });

  // Completed task with 12h completion duration
  await prisma.task.create({
    data: {
      board_id: doneBoard.id,
      title: 'Structured Logger Setup',
      description: 'Configure clean console JSON logging',
      status: 'done',
      priority: 'medium',
      assignee_id: bob.id,
      creator_id: alice.id,
      created_at: yesterday,
      updated_at: new Date()
    }
  });

  // Active todo task
  await prisma.task.create({
    data: {
      board_id: todoBoard.id,
      title: 'WebSocket Handshake Gateway',
      description: 'Enforce strict 5s client authentication limits',
      status: 'todo',
      priority: 'high',
      creator_id: bob.id,
      assignee_id: alice.id
    }
  });

  // Active in progress task
  await prisma.task.create({
    data: {
      board_id: inProgressBoard.id,
      title: 'Redis Rate Limiter',
      description: 'Rate limit auth requests via Redis cache',
      status: 'in_progress',
      priority: 'medium',
      creator_id: alice.id,
      assignee_id: bob.id
    }
  });

  // Overdue task
  const overdueDate = new Date();
  overdueDate.setDate(overdueDate.getDate() - 3);
  
  await prisma.task.create({
    data: {
      board_id: inReviewBoard.id,
      title: 'Nginx Ingress Routing Proxy',
      description: 'Deploy proxy route limits for upstream channels',
      status: 'in_review',
      priority: 'high',
      creator_id: alice.id,
      assignee_id: charlie.id,
      due_date: overdueDate,
      created_at: fiveDaysAgo
    }
  });

  console.log('Database seeded successfully!');
}

function threeDaysAgo(d: Date): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + 3);
  return r;
}

main()
  .catch((e) => {
    console.error('Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
