import request from 'supertest';
import { app, server } from '../../src/index';
import { prisma } from '../../src/prisma/client';

describe('Soft Delete & Auth Invalidation Integration Tests', () => {
  const uniqueUsername = `deluser_${Date.now()}`;
  const uniqueEmail = `deluser_${Date.now()}@example.com`;
  const password = 'Password@12345';
  let userId: string = '';
  let accessToken: string = '';
  let refreshToken: string = '';

  beforeAll(async () => {
    // Clear test tables to avoid conflicts
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany({
      where: {
        email: { contains: 'deluser_' }
      }
    });

    // Register a test user
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: uniqueEmail,
        username: uniqueUsername,
        password: password
      })
      .expect(210);

    userId = res.body.data.user.id;
    accessToken = res.body.data.accessToken;
    refreshToken = res.body.data.refreshToken;
  });

  afterAll(async () => {
    // Clean up
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany({
      where: {
        email: { contains: 'deluser_' }
      }
    });
    await prisma.$disconnect();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('should allow authenticating active user successfully', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.user.username).toBe(uniqueUsername);
  });

  it('should soft-delete user and revoke active sessions', async () => {
    // Trigger soft delete
    const deleteRes = await request(app)
      .delete(`/api/v1/auth/users/${userId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(deleteRes.body.success).toBe(true);

    // Verify user is marked deleted in the DB
    const dbUser = await prisma.user.findUnique({
      where: { id: userId }
    });
    expect(dbUser?.is_deleted).toBe(true);
    expect(dbUser?.deleted_at).toBeDefined();

    // Verify all refresh tokens are cleared
    const tokens = await prisma.refreshToken.findMany({
      where: { user_id: userId }
    });
    expect(tokens).toHaveLength(0);
  });

  it('should reject subsequent REST API access for soft-deleted user', async () => {
    // Profile fetch / session restore should fail with ACCOUNT_DISABLED
    const meRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(401);

    expect(meRes.body.success).toBe(false);
    expect(meRes.body.error.code).toBe('ACCOUNT_DISABLED');
  });

  it('should reject login for soft-deleted user', async () => {
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        username: uniqueUsername,
        password: password
      })
      .expect(401);

    expect(loginRes.body.success).toBe(false);
    expect(loginRes.body.error.code).toBe('ACCOUNT_DISABLED');
  });

  it('should reject token refresh for soft-deleted user', async () => {
    const refreshRes = await request(app)
      .post('/api/v1/auth/refresh')
      .send({
        refreshToken: refreshToken
      })
      .expect(401);

    expect(refreshRes.body.success).toBe(false);
    expect(['ACCOUNT_DISABLED', 'INVALID_REFRESH_TOKEN']).toContain(refreshRes.body.error.code);
  });
});
