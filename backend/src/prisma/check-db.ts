import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();
const maxRetries = 30;
const retryDelayMs = 2000;

async function checkDatabase() {
  logger.info('Database liveness check initializing...');

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Execute a simple query
      await prisma.$executeRawUnsafe('SELECT 1;');
      logger.info('Database is live and accepting connections!');
      await prisma.$disconnect();
      process.exit(0);
    } catch (err: any) {
      logger.warn(`Database not ready yet (Attempt ${attempt}/${maxRetries}): ${err.message || err}`);
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }

  logger.error('Database connection failed. Exceeded maximum retries.');
  await prisma.$disconnect();
  process.exit(1);
}

checkDatabase();
