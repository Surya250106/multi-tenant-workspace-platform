import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AppError } from '../utils/errors';
import { prisma } from '../prisma/client';

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      userEmail?: string;
      requestId?: string;
    }
  }
}

const JWT_SECRET = process.env.JWT_SECRET || 'jwt-secret-key';

export interface AuthenticatedRequest extends Request {
  userId?: string;
  userEmail?: string;
}

export function generateAccessToken(payload: { sub: string; email: string; workspaceRoles?: Record<string, string> }): string {
  // Access token expiry = 900 seconds (15 minutes)
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '900s' });
}

export function verifyAccessToken(token: string): any {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      throw new AppError('TOKEN_EXPIRED', 'Access token has expired', 401);
    }
    throw new AppError('UNAUTHORIZED', 'Access token is invalid', 401);
  }
}

export async function authMiddleware(req: any, _res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('UNAUTHORIZED', 'Access token is missing', 401);
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyAccessToken(token);
    
    // Check if user is soft-deleted in the database
    const user = await prisma.user.findFirst({
      where: {
        id: decoded.sub,
        is_deleted: false
      }
    });

    if (!user) {
      throw new AppError('ACCOUNT_DISABLED', 'Account no longer active', 401);
    }

    req.userId = decoded.sub;
    req.userEmail = decoded.email;
    next();
  } catch (err: any) {
    if (err instanceof AppError) {
      next(err);
    } else if (err.name === 'TokenExpiredError') {
      next(new AppError('TOKEN_EXPIRED', 'Access token has expired', 401));
    } else {
      next(new AppError('UNAUTHORIZED', 'Access token is invalid', 401));
    }
  }
}
