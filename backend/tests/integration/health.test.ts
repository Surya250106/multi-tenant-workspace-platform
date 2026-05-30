import request from 'supertest';
import { app, server } from '../../src/index';
import { prisma } from '../../src/prisma/client';

describe('Phase 1 Integration Health Check Tests', () => {
  afterAll(async () => {
    // Close prisma and express server after tests finish
    await prisma.$disconnect();
    server.close();
  });

  it('should return 200 and success true for liveness probe (/api/v1/health)', async () => {
    const res = await request(app)
      .get('/api/v1/health')
      .expect(200);

    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('requestId');
    expect(res.body.data).toHaveProperty('status', 'UP');
  });

  it('should return 200 and success true for readiness probe (/api/v1/ready) when database is live', async () => {
    const res = await request(app)
      .get('/api/v1/ready')
      .expect(200);

    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('requestId');
    expect(res.body.data).toHaveProperty('status', 'READY');
    expect(res.body.data.services).toHaveProperty('database', 'UP');
  });

  it('should return 404 for unknown endpoints', async () => {
    const res = await request(app)
      .get('/api/v1/non-existent-route')
      .expect(404);

    expect(res.body).toHaveProperty('success', false);
    expect(res.body.error).toHaveProperty('code', 'RESOURCE_NOT_FOUND');
  });
});
