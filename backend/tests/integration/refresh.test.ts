import request from 'supertest';
import { app, server } from '../../src/index';
import { prisma } from '../../src/prisma/client';

describe('Refresh Token Rotation & Replay Attack Integration Tests', () => {
  const uniqueUsername = `refuser_${Date.now()}`;
  const uniqueEmail = `refuser_${Date.now()}@example.com`;
  const password = 'Password@12345';
  let userId: string = '';
  let activeRefreshToken: string = '';

  beforeAll(async () => {
    // Clean database records
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany({
      where: {
        email: { contains: 'refuser_' }
      }
    });

    // Create user and initial login session
    const registerRes = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: uniqueEmail,
        username: uniqueUsername,
        password: password
      })
      .expect(210);

    userId = registerRes.body.data.user.id;
    activeRefreshToken = registerRes.body.data.refreshToken;
  });

  afterAll(async () => {
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany({
      where: {
        email: { contains: 'refuser_' }
      }
    });
    await prisma.$disconnect();
    server.close();
  });

  it('should successfully rotate tokens when sending a valid refresh token', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({
        refreshToken: activeRefreshToken
      })
      .expect(200);

    expect(res.body).toHaveProperty('success', true);
    expect(res.body.data).toHaveProperty('accessToken');
    expect(res.body.data).toHaveProperty('refreshToken');

    // Confirm that the old refresh token was deleted
    const dbOldToken = await prisma.refreshToken.findUnique({
      where: { token: activeRefreshToken }
    });
    expect(dbOldToken).toBeNull();

    // Confirm that the new refresh token is active in the database
    const newRefreshToken = res.body.data.refreshToken;
    const dbNewToken = await prisma.refreshToken.findUnique({
      where: { token: newRefreshToken }
    });
    expect(dbNewToken).not.toBeNull();
    expect(dbNewToken?.user_id).toBe(userId);

    // Save the new token for subsequent tests
    activeRefreshToken = newRefreshToken;
  });

  it('should block reuse of a rotated refresh token (replay attack prevention)', async () => {
    // Generate a fresh user login
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        username: uniqueUsername,
        password: password
      })
      .expect(200);

    const initialToken = loginRes.body.data.refreshToken;

    // First rotation (Valid)
    const rotateRes1 = await request(app)
      .post('/api/v1/auth/refresh')
      .send({
        refreshToken: initialToken
      })
      .expect(200);

    expect(rotateRes1.body).toHaveProperty('success', true);

    // Second rotation attempt using the same initialToken (Replay Attack!)
    const rotateRes2 = await request(app)
      .post('/api/v1/auth/refresh')
      .send({
        refreshToken: initialToken
      })
      .expect(401);

    expect(rotateRes2.body).toHaveProperty('success', false);
    expect(rotateRes2.body.error).toHaveProperty('code', 'INVALID_REFRESH_TOKEN');
  });

  it('should reject requests with completely invalid refresh tokens', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({
        refreshToken: 'completely-invalid-opaque-token-string'
      })
      .expect(401);

    expect(res.body).toHaveProperty('success', false);
    expect(res.body.error).toHaveProperty('code', 'INVALID_REFRESH_TOKEN');
  });
});
