import { Router } from 'express';
import authRouter from './auth';
import workspaceRouter from './workspace';
import boardRouter from './board';
import taskRouter from './task';
import analyticsRouter from './analytics';
import notificationRouter from './notification';

const router = Router();

// Mount routes
router.use('/auth', authRouter);
router.use('/workspaces', workspaceRouter);
router.use('/workspaces', analyticsRouter);
router.use('/notifications', notificationRouter);
router.use('/', boardRouter);
router.use('/', taskRouter);

export default router;
