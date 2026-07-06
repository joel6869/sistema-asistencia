import { Router } from 'express';
import {
  getCurrentConfiguration,
  updateCurrentConfiguration,
} from '../modules/configuration/configuration.controller.js';
import { requireAuth, requireRole } from '../lib/security.js';

const router = Router();

router.get('/configuration/current', requireAuth, getCurrentConfiguration);
router.put('/configuration/current', requireAuth, requireRole('ADMIN'), updateCurrentConfiguration);

export default router;
