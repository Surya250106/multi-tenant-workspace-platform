import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import { prisma } from '../prisma/client';
import { AppError } from '../utils/errors';
import { sendSuccess } from '../utils/response';
import { generateAccessToken } from '../middleware/auth';

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, username, password } = req.body;

    if (!email || !username || !password) {
      throw new AppError('VALIDATION_ERROR', 'Missing required fields', 400);
    }

    // Check duplicate email
    const existingEmail = await prisma.user.findUnique({ where: { email } });
    if (existingEmail) {
      throw new AppError('EMAIL_ALREADY_EXISTS', 'Email is already registered', 400);
    }

    // Check duplicate username
    const existingUsername = await prisma.user.findUnique({ where: { username } });
    if (existingUsername) {
      throw new AppError('USERNAME_ALREADY_EXISTS', 'Username is already taken', 400);
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        email,
        username,
        password_hash: passwordHash
      }
    });

    const memberships = await prisma.workspaceMember.findMany({
      where: { user_id: user.id }
    });
    const workspaceRoles = memberships.reduce((acc, m) => {
      acc[m.workspace_id] = m.role;
      return acc;
    }, {} as Record<string, string>);

    const accessToken = generateAccessToken({ sub: user.id, email: user.email, workspaceRoles });
    
    // Create an opaque refresh token
    const refreshTokenStr = `ref_${Math.random().toString(36).substring(2)}${Date.now()}`;
    await prisma.refreshToken.create({
      data: {
        token: refreshTokenStr,
        user_id: user.id,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
      }
    });

    return sendSuccess(res, {
      accessToken,
      refreshToken: refreshTokenStr,
      user: {
        id: user.id,
        email: user.email,
        username: user.username
      }
    }, 210); // Custom 210 status for registration
  } catch (err) {
    next(err);
  }
}

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { username, email, password } = req.body;
    const identifier = username || email;

    if (!identifier || !password) {
      throw new AppError('VALIDATION_ERROR', 'Missing username/email or password', 400);
    }

    // Can login via username or email
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { username: identifier },
          { email: identifier }
        ]
      }
    });

    if (!user) {
      throw new AppError('INVALID_CREDENTIALS', 'Invalid username or password', 401);
    }

    if (user.is_deleted) {
      throw new AppError('ACCOUNT_DISABLED', 'Account no longer active', 401);
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      throw new AppError('INVALID_CREDENTIALS', 'Invalid username or password', 401);
    }

    const memberships = await prisma.workspaceMember.findMany({
      where: { user_id: user.id }
    });
    const workspaceRoles = memberships.reduce((acc, m) => {
      acc[m.workspace_id] = m.role;
      return acc;
    }, {} as Record<string, string>);

    const accessToken = generateAccessToken({ sub: user.id, email: user.email, workspaceRoles });
    
    const refreshTokenStr = `ref_${Math.random().toString(36).substring(2)}${Date.now()}`;
    await prisma.refreshToken.create({
      data: {
        token: refreshTokenStr,
        user_id: user.id,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      }
    });

    return sendSuccess(res, {
      accessToken,
      refreshToken: refreshTokenStr
    });
  } catch (err) {
    next(err);
  }
}

export async function getMe(req: any, res: Response, next: NextFunction) {
  try {
    const user = await prisma.user.findFirst({
      where: {
        id: req.userId,
        is_deleted: false
      }
    });

    if (!user) {
      throw new AppError('ACCOUNT_DISABLED', 'Account no longer active', 401);
    }

    return sendSuccess(res, {
      user: {
        id: user.id,
        email: user.email,
        username: user.username
      }
    });
  } catch (err) {
    next(err);
  }
}

export async function updateMe(req: any, res: Response, next: NextFunction) {
  try {
    const { username } = req.body;

    const updated = await prisma.user.update({
      where: { id: req.userId },
      data: { username }
    });

    return sendSuccess(res, {
      user: {
        id: updated.id,
        email: updated.email,
        username: updated.username
      }
    });
  } catch (err) {
    next(err);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    const { refreshToken } = req.body;

    if (refreshToken) {
      await prisma.refreshToken.deleteMany({
        where: { token: refreshToken }
      });
    }

    return sendSuccess(res, { message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction) {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      throw new AppError('VALIDATION_ERROR', 'Refresh token is missing', 400);
    }

    const tokenRecord = await prisma.refreshToken.findUnique({
      where: { token: refreshToken }
    });

    if (!tokenRecord || tokenRecord.expires_at < new Date()) {
      throw new AppError('INVALID_REFRESH_TOKEN', 'Refresh token is invalid or expired', 401);
    }

    const user = await prisma.user.findFirst({
      where: {
        id: tokenRecord.user_id,
        is_deleted: false
      }
    });
    if (!user) {
      throw new AppError('ACCOUNT_DISABLED', 'Account no longer active', 401);
    }

    // Refresh token rotation
    await prisma.refreshToken.delete({ where: { id: tokenRecord.id } });

    const memberships = await prisma.workspaceMember.findMany({
      where: { user_id: user.id }
    });
    const workspaceRoles = memberships.reduce((acc, m) => {
      acc[m.workspace_id] = m.role;
      return acc;
    }, {} as Record<string, string>);

    const newAccessToken = generateAccessToken({ sub: user.id, email: user.email, workspaceRoles });
    const newRefreshToken = `ref_${Math.random().toString(36).substring(2)}${Date.now()}`;

    await prisma.refreshToken.create({
      data: {
        token: newRefreshToken,
        user_id: user.id,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      }
    });

    return sendSuccess(res, {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteUser(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = req.params;

    const user = await prisma.user.findFirst({
      where: { id: userId }
    });

    if (!user) {
      throw new AppError('RESOURCE_NOT_FOUND', 'User not found', 404);
    }

    // 1. Apply soft delete
    await prisma.user.update({
      where: { id: userId },
      data: {
        is_deleted: true,
        deleted_at: new Date()
      }
    });

    // 2. Clear all refresh tokens
    await prisma.refreshToken.deleteMany({
      where: { user_id: userId }
    });

    // 3. Eject active websocket channels dynamically
    const { disconnectUserSocket } = await import('../websocket/server');
    disconnectUserSocket(userId);

    return sendSuccess(res, { message: 'User soft-deleted successfully' });
  } catch (err) {
    next(err);
  }
}
