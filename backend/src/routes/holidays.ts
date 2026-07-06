import { Router } from 'express';
import { deleteHoliday, listHolidays, saveHoliday } from '../modules/holidays/holidays.controller.js';
import { requireAuth, requireRole } from '../lib/security.js';

const router = Router();

router.get('/holidays', requireAuth, listHolidays);
router.post('/holidays', requireAuth, requireRole('ADMIN'), saveHoliday);
router.delete('/holidays/:id', requireAuth, requireRole('ADMIN'), deleteHoliday);

export default router;
