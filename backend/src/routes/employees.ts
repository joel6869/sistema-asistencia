import { Router } from 'express';
import {
  createEmployee,
  deactivateEmployee,
  getEmployeeByCi,
  listEmployees,
  updateEmployee,
} from '../modules/employees/employees.controller.js';
import { requireAuth, requireRole, requireSelfOrAdmin } from '../lib/security.js';

const router = Router();

router.get('/employees', requireAuth, requireRole('ADMIN'), listEmployees);
router.get('/employees/ci/:ci', requireAuth, requireSelfOrAdmin((req) => String(req.params.ci ?? '')), getEmployeeByCi);
router.post('/employees', requireAuth, requireRole('ADMIN'), createEmployee);
router.put('/employees/:id', requireAuth, requireRole('ADMIN'), updateEmployee);
router.patch('/employees/:id/deactivate', requireAuth, requireRole('ADMIN'), deactivateEmployee);
router.delete('/employees/:id', requireAuth, requireRole('ADMIN'), deactivateEmployee);

export default router;
