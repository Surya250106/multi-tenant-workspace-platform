import { PrismaClient } from '@prisma/client';
import { dbQueryDurationSeconds } from '../metrics/prometheus';

export const prisma = new PrismaClient();

prisma.$use(async (params, next) => {
  const start = process.hrtime();
  try {
    const result = await next(params);
    return result;
  } finally {
    const diff = process.hrtime(start);
    const duration = diff[0] + diff[1] / 1e9;
    // Track DB query duration metric
    dbQueryDurationSeconds.observe(
      {
        model: params.model || 'raw',
        operation: params.action
      },
      duration
    );
  }
});
export default prisma;
