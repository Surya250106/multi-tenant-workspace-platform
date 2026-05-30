import { Request, Response, NextFunction } from 'express';
import { redisClient } from '../utils/redis';
import { AppError } from '../utils/errors';

export async function loginRateLimiter(req: Request, _res: Response, next: NextFunction) {
  try {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `rate_limit:login:${ip}`;

    const attempts = await redisClient.incr(key);

    if (attempts === 1) {
      // 15 minutes expiry = 900 seconds
      await redisClient.expire(key, 900);
    }

    if (attempts > 10) {
      throw new AppError('RATE_LIMIT_EXCEEDED', 'Too many login attempts. Please try again in 15 minutes.', 429);
    }

    next();
  } catch (err) {
    next(err);
  }
}
