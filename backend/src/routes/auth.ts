import { Router } from 'express';
import { login } from '../modules/auth/auth.controller.js';

const router = Router();

router.post('/auth/login', login);

export default router;
