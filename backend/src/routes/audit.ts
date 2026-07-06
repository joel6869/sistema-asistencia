import { Router } from 'express';
import { listAuditLogs } from '../modules/audit/audit.controller.js';
import { requireAuth, requireRole } from '../lib/security.js';

const router = Router();

router.get('/audit-logs', requireAuth, requireRole('ADMIN'), listAuditLogs);

export default router;
