import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema } from 'zod';
import { AppError } from '../utils/errors';

// 1. Central Express Request Validation Middleware
export function validate(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      schema.parse(req.body);
      next();
    } catch (err: any) {
      next(new AppError('VALIDATION_ERROR', 'Request validation failed', 400, err.errors || err));
    }
  };
}

// 2. Workspace Schemas
export const createWorkspaceSchema = z.object({
  name: z.string().min(1, 'Workspace name is required'),
  slug: z.string().optional()
});

export const addMemberSchema = z.object({
  email: z.string().email('Invalid email address'),
  role: z.enum(['admin', 'manager', 'member', 'guest'])
});

export const updateMemberSchema = z.object({
  role: z.enum(['admin', 'manager', 'member', 'guest'])
});

// 3. Project Schemas
export const createProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required'),
  description: z.string().optional()
});

export const updateProjectSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional()
});

// 4. Board Schemas
export const createBoardSchema = z.object({
  name: z.string().min(1, 'Board column name is required')
});

export const updateBoardSchema = z.object({
  name: z.string().min(1, 'Board column name is required')
});

// 5. Task Schemas
export const createTaskSchema = z.object({
  title: z.string().min(1, 'Task title is required'),
  description: z.string().optional().nullable(),
  priority: z.enum(['low', 'medium', 'high']),
  assigneeId: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable()
});

export const updateTaskSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional().nullable(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  assigneeId: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  status: z.enum(['todo', 'in_progress', 'in_review', 'done']).optional()
});

export const moveTaskSchema = z.object({
  boardId: z.string().min(1, 'Destination board column ID is required')
});

// 6. Comment Schemas
export const createCommentSchema = z.object({
  content: z.string().min(1, 'Comment content cannot be empty')
});

export const updateCommentSchema = z.object({
  content: z.string().min(1, 'Comment content cannot be empty')
});

// 7. Auth Schemas
export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  username: z.string().min(2, 'Username must be at least 2 characters'),
  password: z.string().min(6, 'Password must be at least 6 characters')
});

export const loginSchema = z.object({
  username: z.string().optional(),
  email: z.string().optional(),
  password: z.string().min(1, 'Password is required')
}).refine(data => data.username || data.email, {
  message: "Either username or email is required",
  path: ["username"]
});
