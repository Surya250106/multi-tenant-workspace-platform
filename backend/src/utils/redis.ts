import { createClient } from 'redis';
import { logger } from './logger';

const REDIS_URL = process.env.REDIS_URL || 'redis://redis:6379';

// Publisher and Rate Limiter client
export const redisClient = createClient({ url: REDIS_URL });

// Subscriber client
export const redisSubClient = createClient({ url: REDIS_URL });

redisClient.on('connect', () => logger.info('Redis Publisher connected', { url: REDIS_URL }));
redisClient.on('error', (err) => logger.error('Redis Publisher error', err));

redisSubClient.on('connect', () => logger.info('Redis Subscriber connected', { url: REDIS_URL }));
redisSubClient.on('error', (err) => logger.error('Redis Subscriber error', err));

export async function connectRedis() {
  if (!redisClient.isOpen) {
    await redisClient.connect();
  }
  if (!redisSubClient.isOpen) {
    await redisSubClient.connect();
  }
}
