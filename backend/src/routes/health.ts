import { Router } from 'express';
import { getHealthStatus } from '../modules/health/health.controller.js';

const router = Router();
router.get('/health', getHealthStatus);

export default router;