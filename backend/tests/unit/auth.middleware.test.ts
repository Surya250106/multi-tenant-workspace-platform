import { authMiddleware, generateAccessToken, verifyAccessToken } from '../../src/middleware/auth';
import { RequestWithId } from '../../src/middleware/requestId';
import { Response } from 'express';
import * as jwt from 'jsonwebtoken';
import { prisma } from '../../src/prisma/client';

describe('Auth Middleware Unit Tests', () => {
  const mockPayload = { sub: 'user-123-uuid', email: 'test@example.com' };

  beforeAll(async () => {
    // Delete any conflict, and seed the test user record
    await prisma.user.deleteMany({ where: { id: 'user-123-uuid' } });
    await prisma.user.create({
      data: {
        id: 'user-123-uuid',
        email: 'test@example.com',
        username: 'testuser_123',
        password_hash: 'mocked_hash',
        is_deleted: false
      }
    });
  });

  afterAll(async () => {
    // Teardown seeded user
    await prisma.user.deleteMany({ where: { id: 'user-123-uuid' } });
    await prisma.$disconnect();
  });
  
  it('should successfully generate and verify valid access tokens', () => {
    const token = generateAccessToken(mockPayload);
    expect(token).toBeDefined();

    const decoded = verifyAccessToken(token);
    expect(decoded).toHaveProperty('sub', mockPayload.sub);
    expect(decoded).toHaveProperty('email', mockPayload.email);
    expect(decoded).toHaveProperty('exp');
  });

  it('should raise TOKEN_EXPIRED when verifying an expired token signature', () => {
    const JWT_SECRET = process.env.JWT_SECRET || 'jwt-secret-key';
    
    // Create pre-expired token manually
    const expiredToken = jwt.sign(
      { ...mockPayload, exp: Math.floor(Date.now() / 1000) - 60 },
      JWT_SECRET
    );

    expect(() => verifyAccessToken(expiredToken)).toThrow(
      expect.objectContaining({
        code: 'TOKEN_EXPIRED',
        statusCode: 401
      })
    );
  });

  it('should call next() and assign req.userId / req.userEmail on successful token verification', async () => {
    // Ensure user is active (not soft deleted)
    await prisma.user.update({
      where: { id: 'user-123-uuid' },
      data: { is_deleted: false }
    });

    const token = generateAccessToken(mockPayload);
    
    const req = {
      headers: {
        authorization: `Bearer ${token}`
      }
    } as unknown as RequestWithId;
    
    const res = {} as Response;
    const next = jest.fn();

    await authMiddleware(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.userId).toBe(mockPayload.sub);
    expect(req.userEmail).toBe(mockPayload.email);
  });

  it('should pass UNAUTHORIZED error to next() when Authorization header is completely missing', async () => {
    const req = {
      headers: {}
    } as unknown as RequestWithId;
    
    const res = {} as Response;
    const next = jest.fn();

    await authMiddleware(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'UNAUTHORIZED',
        statusCode: 401
      })
    );
  });

  it('should pass ACCOUNT_DISABLED to next() if the verified user has been soft-deleted', async () => {
    // Mark user as soft-deleted in the database
    await prisma.user.update({
      where: { id: 'user-123-uuid' },
      data: {
        is_deleted: true,
        deleted_at: new Date()
      }
    });

    const token = generateAccessToken(mockPayload);
    
    const req = {
      headers: {
        authorization: `Bearer ${token}`
      }
    } as unknown as RequestWithId;
    
    const res = {} as Response;
    const next = jest.fn();

    await authMiddleware(req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'ACCOUNT_DISABLED',
        statusCode: 401
      })
    );
  });
});
