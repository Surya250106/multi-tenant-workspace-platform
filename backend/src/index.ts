import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import { register } from 'prom-client';
import { logger } from './utils/logger';
import { prisma } from './prisma/client';
import apiRouter from './routes/index';
import { errorHandlerMiddleware } from './middleware/errorHandler';
import { connectRedis, redisClient, redisSubClient } from './utils/redis';
import { initializeWebSocketServer, closeWebSocketServer } from './websocket/server';
import { httpRequestsTotal, httpRequestDurationSeconds, redisMemoryUsedBytes } from './metrics/prometheus';

const app = express();
const PORT = process.env.PORT || 8080;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

// Request ID Middleware
app.use((req: any, _res: any, next: NextFunction) => {
  req.requestId = (req.headers['x-request-id'] as string) || uuidv4();
  next();
});

// Structured Request Logger Middleware
app.use((req: any, res: any, next: NextFunction) => {
  const start = process.hrtime();
  res.on('finish', () => {
    const diff = process.hrtime(start);
    const durationSec = diff[0] + diff[1] / 1e9;
    const durationMs = durationSec * 1000;

    // Resolve route pattern (fallback to URL path)
    const route = req.route ? req.route.path : req.path;

    // Instrument HTTP metrics
    httpRequestsTotal.inc({
      method: req.method,
      route,
      status: res.statusCode.toString()
    });

    httpRequestDurationSeconds.observe(
      {
        method: req.method,
        route,
        status: res.statusCode.toString()
      },
      durationSec
    );

    logger.info('HTTP Request processed', {
      requestId: req.requestId,
      method: req.method,
      url: req.url,
      status: res.statusCode,
      durationMs
    });
  });
  next();
});

// Exact Success Response Envelope Helper
function sendSuccess(res: Response, data: any, statusCode: number = 200) {
  const requestId = (res.req as any).requestId || uuidv4();
  return res.status(statusCode).json({
    success: true,
    data,
    requestId
  });
}

// Exact Error Response Envelope Helper
function sendError(res: Response, code: string, message: string, statusCode: number = 400, details: any[] = []) {
  const requestId = (res.req as any).requestId || uuidv4();
  return res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      details
    },
    requestId
  });
}

/**
 * PHASE 1 MANDATORY ENDPOINTS
 */

// GET /api/v1/health - Liveness Check
app.get('/api/v1/health', (req: any, res: Response) => {
  logger.debug('Liveness probe called', { requestId: req.requestId });
  return sendSuccess(res, { status: 'UP', timestamp: new Date().toISOString() });
});

// GET /api/v1/ready - Readiness Check (Database connection check)
app.get('/api/v1/ready', async (req: any, res: Response) => {
  logger.debug('Readiness probe called', { requestId: req.requestId });
  try {
    // Perform simple database ping query
    await prisma.$executeRawUnsafe('SELECT 1;');
    return sendSuccess(res, { status: 'READY', services: { database: 'UP' } });
  } catch (err: any) {
    logger.error('Readiness probe failed', err, { requestId: req.requestId });
    return sendError(
      res,
      'INTERNAL_SERVER_ERROR',
      'Service is not ready to handle requests',
      503,
      [{ service: 'database', error: err.message || err }]
    );
  }
});

// GET /metrics - Prometheus Metrics Scraper Endpoint
app.get('/metrics', async (_req: Request, res: Response) => {
  try {
    if (redisClient && redisClient.isOpen) {
      try {
        const info = await redisClient.info('memory');
        const match = info.match(/used_memory:(\d+)/);
        if (match && match[1]) {
          redisMemoryUsedBytes.set(parseInt(match[1], 10));
        }
      } catch (redisErr) {
        logger.error('Failed to update Redis memory metric', redisErr);
      }
    }
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (err: any) {
    logger.error('Failed to retrieve metrics', err);
    res.status(500).end(err);
  }
});

// GET /metrics/postgres - Postgres Scrape Target Health Check
app.get('/metrics/postgres', async (_req: Request, res: Response) => {
  try {
    await prisma.$executeRawUnsafe('SELECT 1;');
    res.set('Content-Type', 'text/plain');
    res.send('# HELP postgres_up Postgres connection is active\n# TYPE postgres_up gauge\npostgres_up 1\n');
  } catch (err: any) {
    logger.error('Postgres metric check failed', err);
    res.status(503).send('# HELP postgres_up Postgres connection is active\n# TYPE postgres_up gauge\npostgres_up 0\n');
  }
});

// GET /metrics/redis - Redis Scrape Target Health Check
app.get('/metrics/redis', async (_req: Request, res: Response) => {
  try {
    if (!redisClient || !redisClient.isOpen) {
      throw new Error('Redis client not open');
    }
    await prisma.$executeRawUnsafe('SELECT 1;'); // Ensure DB works too, or just ping Redis:
    await redisClient.ping();
    res.set('Content-Type', 'text/plain');
    res.send('# HELP redis_up Redis connection is active\n# TYPE redis_up gauge\nredis_up 1\n');
  } catch (err: any) {
    logger.error('Redis metric check failed', err);
    res.status(503).send('# HELP redis_up Redis connection is active\n# TYPE redis_up gauge\nredis_up 0\n');
  }
});

// Mount Central API Routes
app.use('/api/v1', apiRouter);

// 404 Route Handler
app.use((req: any, res: Response) => {
  return sendError(res, 'RESOURCE_NOT_FOUND', `Route ${req.method} ${req.url} not found`, 404);
});

// Global Error Handler Middleware
app.use(errorHandlerMiddleware);

// Boot backend server
const isTest = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined;
const server = app.listen(isTest ? 0 : PORT, async () => {
  logger.info('Backend server booting successfully', {
    port: isTest ? (server.address() as any)?.port : PORT,
    environment: process.env.NODE_ENV || 'production',
    timestamp: new Date().toISOString()
  });

  try {
    await connectRedis();
    initializeWebSocketServer(server);
  } catch (err) {
    logger.error('Failed to initialize Redis or WebSockets', err);
  }
});

// Clean up Redis client handles when the server is closed
const originalClose = server.close.bind(server);
server.close = (callback?: any) => {
  Promise.all([
    redisClient.isOpen ? redisClient.disconnect() : Promise.resolve(),
    redisSubClient.isOpen ? redisSubClient.disconnect() : Promise.resolve(),
    closeWebSocketServer()
  ])
    .catch(() => {})
    .finally(() => {
      originalClose(callback);
    });
  return server;
};

export { app, server };
