import request from 'supertest';
import { app, server } from '../../src/index';
import { prisma } from '../../src/prisma/client';

describe('Auth Integration Tests', () => {
  const uniqueUsername = `testuser_${Date.now()}`;
  const uniqueEmail = `testuser_${Date.now()}@example.com`;
  const password = 'Password@12345';
  let accessToken: string = '';
  let refreshToken: string = '';

  beforeAll(async () => {
    // Clear test tables to avoid conflicts
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany({
      where: {
        email: { contains: 'testuser_' }
      }
    });
  });

  afterAll(async () => {
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany({
      where: {
        email: { contains: 'testuser_' }
      }
    });
    await prisma.$disconnect();
    server.close();
  });

  describe('POST /api/v1/auth/register', () => {
    it('should successfully register a new user', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: uniqueEmail,
          username: uniqueUsername,
          password: password
        })
        .expect(210); // Custom creation code

      expect(res.body).toHaveProperty('success', true);
      expect(res.body.data).toHaveProperty('accessToken');
      expect(res.body.data).toHaveProperty('refreshToken');
      expect(res.body.data.user).toHaveProperty('username', uniqueUsername);
      expect(res.body.data.user).toHaveProperty('email', uniqueEmail);

      accessToken = res.body.data.accessToken;
      refreshToken = res.body.data.refreshToken;
    });

    it('should throw EMAIL_ALREADY_EXISTS when using the same email', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: uniqueEmail,
          username: `other_${uniqueUsername}`,
          password: password
        })
        .expect(400);

      expect(res.body).toHaveProperty('success', false);
      expect(res.body.error).toHaveProperty('code', 'EMAIL_ALREADY_EXISTS');
    });

    it('should throw USERNAME_ALREADY_EXISTS when using the same username', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: `other_${uniqueEmail}`,
          username: uniqueUsername,
          password: password
        })
        .expect(400);

      expect(res.body).toHaveProperty('success', false);
      expect(res.body.error).toHaveProperty('code', 'USERNAME_ALREADY_EXISTS');
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('should login successfully with valid username', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: uniqueUsername,
          password: password
        })
        .expect(200);

      expect(res.body).toHaveProperty('success', true);
      expect(res.body.data).toHaveProperty('accessToken');
      expect(res.body.data).toHaveProperty('refreshToken');
    });

    it('should login successfully with valid email', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: uniqueEmail,
          password: password
        })
        .expect(200);

      expect(res.body).toHaveProperty('success', true);
    });

    it('should fail with INVALID_CREDENTIALS for wrong password', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: uniqueUsername,
          password: 'WrongPassword123!'
        })
        .expect(401);

      expect(res.body).toHaveProperty('success', false);
      expect(res.body.error).toHaveProperty('code', 'INVALID_CREDENTIALS');
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('should return user details with a valid bearer token', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('success', true);
      expect(res.body.data.user).toHaveProperty('email', uniqueEmail);
      expect(res.body.data.user).toHaveProperty('username', uniqueUsername);
    });

    it('should fail with UNAUTHORIZED when no token is sent', async () => {
      const res = await request(app)
        .get('/api/v1/auth/me')
        .expect(401);

      expect(res.body).toHaveProperty('success', false);
      expect(res.body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });
  });

  describe('PATCH /api/v1/auth/me', () => {
    it('should successfully update user profile details', async () => {
      const updatedUsername = `${uniqueUsername}_mod`;
      const res = await request(app)
        .patch('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          username: updatedUsername
        })
        .expect(200);

      expect(res.body).toHaveProperty('success', true);
      expect(res.body.data.user).toHaveProperty('username', updatedUsername);
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('should log out successfully and revoke refresh token', async () => {
      const res = await request(app)
        .post('/api/v1/auth/logout')
        .send({
          refreshToken: refreshToken
        })
        .expect(200);

      expect(res.body).toHaveProperty('success', true);
    });
  });
});
