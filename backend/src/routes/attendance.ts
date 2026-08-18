import { Router } from 'express';
import {
  deleteAttendanceMark,
  getAttendanceSummary,
  listAttendances,
  listAttendancesByCi,
  registerAttendance,
  saveAdminAttendance,
  subscribeAttendances,
} from '../modules/attendance/attendance.controller.js';
import { requireAuth, requireRole, requireSelfOrAdmin } from '../lib/security.js';

const router = Router();

router.get('/attendances', requireAuth, requireRole('ADMIN'), listAttendances);
router.get('/attendances/live', requireAuth, subscribeAttendances);
router.get('/attendances/summary/today', requireAuth, requireRole('ADMIN'), getAttendanceSummary);
router.get('/attendances/ci/:ci', requireAuth, requireSelfOrAdmin((req) => String(req.params.ci ?? '')), listAttendancesByCi);
router.post('/attendances/register', requireAuth, registerAttendance);
router.put('/attendances/admin', requireAuth, requireRole('ADMIN'), saveAdminAttendance);
router.delete('/attendances/:id/:type', requireAuth, requireRole('ADMIN'), deleteAttendanceMark);

export default router;
