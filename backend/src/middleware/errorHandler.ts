import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';
import { sendError } from '../utils/response';
import { logger } from '../utils/logger';

export function errorHandlerMiddleware(
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  const requestId = (req as any).requestId;
  
  if (err instanceof AppError) {
    logger.warn('Operational error encountered', {
      requestId,
      code: err.code,
      message: err.message,
      statusCode: err.statusCode,
      details: err.details
    });
    return sendError(res, err.code, err.message, err.statusCode, err.details);
  }

  // Handle database constraints or other system errors
  logger.error('Unhandled system exception caught', err, { requestId });

  return sendError(
    res,
    'INTERNAL_SERVER_ERROR',
    'An unexpected error occurred on our server.',
    500,
    process.env.NODE_ENV === 'development' ? [{ message: err.message, stack: err.stack }] : []
  );
}
