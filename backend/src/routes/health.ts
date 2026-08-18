import { Router } from 'express';
import { getHealthStatus, restartServer } from '../modules/health/health.controller.js';

const router = Router();
router.get('/health', getHealthStatus);
router.post('/restart', restartServer);

export default router;