import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';

export function sendSuccess(res: Response, data: any, statusCode: number = 200) {
  const requestId = (res.req as any).requestId || uuidv4();
  return res.status(statusCode).json({
    success: true,
    data,
    requestId
  });
}

export function sendError(res: Response, code: string, message: string, statusCode: number = 400, details: any[] = []) {
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
