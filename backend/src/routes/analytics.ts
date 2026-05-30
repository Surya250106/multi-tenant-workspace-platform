import { Router } from 'express';
import {
  getWorkspaceAnalyticsSummary,
  getMemberAnalytics,
  getWorkspaceTaskDistribution,
  getWorkspaceActivityVelocity
} from '../controllers/analytics';
import { authMiddleware } from '../middleware/auth';
import { requireWorkspaceRole } from '../middleware/rbac';

const router = Router();

// Apply base authentication checks
router.use(authMiddleware);

/**
 * WORKSPACE & MEMBER ANALYTICS SUMMARY
 */
router.get('/:workspaceId/analytics/summary', requireWorkspaceRole('guest'), getWorkspaceAnalyticsSummary);
router.get('/:workspaceId/analytics/member/:memberId', requireWorkspaceRole('guest'), getMemberAnalytics);
router.get('/:workspaceId/analytics/task-distribution', requireWorkspaceRole('guest'), getWorkspaceTaskDistribution);
router.get('/:workspaceId/analytics/activity-velocity', requireWorkspaceRole('guest'), getWorkspaceActivityVelocity);

export default router;
