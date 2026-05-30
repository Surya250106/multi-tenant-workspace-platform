import request from 'supertest';
import { app, server } from '../../src/index';
import { prisma } from '../../src/prisma/client';
import { redisClient } from '../../src/utils/redis';

describe('Redis Login Rate Limiting Integration Tests', () => {
  beforeAll(async () => {
    // Ensure Redis connection is open
    if (!redisClient.isOpen) {
      await redisClient.connect().catch(() => {});
    }
    if (redisClient.isOpen) {
      const keys = await redisClient.keys('rate_limit:login:*');
      for (const k of keys) {
        await redisClient.del(k);
      }
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
    if (redisClient.isOpen) {
      // Clear rate limiting keys created during test
      const keys = await redisClient.keys('rate_limit:login:*');
      for (const k of keys) {
        await redisClient.del(k);
      }
      await redisClient.disconnect();
    }
    server.close();
  });

  it('should allow up to 10 login attempts, then block with RATE_LIMIT_EXCEEDED', async () => {
    // Skip if Redis is down or unavailable (graceful test bypass for isolated local test runs)
    if (!redisClient.isOpen) {
      console.warn('Redis client not connected. Skipping rate limit test.');
      return;
    }

    const testUsername = 'nonexistent_rate_user';
    const testPassword = 'InvalidPassword123';

    // 1. Perform 10 failed login attempts (should return 401 INVALID_CREDENTIALS)
    for (let i = 0; i < 10; i++) {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({
          username: testUsername,
          password: testPassword
        });
      
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    }

    // 2. The 11th login attempt should be blocked by rate limiter (returning 429 RATE_LIMIT_EXCEEDED)
    const blockedRes = await request(app)
      .post('/api/v1/auth/login')
      .send({
        username: testUsername,
        password: testPassword
      });

    expect(blockedRes.status).toBe(429);
    expect(blockedRes.body.success).toBe(false);
    expect(blockedRes.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
  });
});
