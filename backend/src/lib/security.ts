import crypto from 'node:crypto';
import { NextFunction, Request, Response } from 'express';
import { Role, UserStatus } from '@prisma/client';
import { prisma } from './prisma.js';

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
const PASSWORD_PREFIX = 'pbkdf2';
const PASSWORD_ITERATIONS = 120000;
const PASSWORD_KEY_LENGTH = 32;
const MAX_LOGIN_ATTEMPTS = 12;
const LOGIN_WINDOW_MS = 10 * 60 * 1000;

interface TokenPayload {
  exp: number;
  employeeId: string;
  role: Role;
  userId: string;
}

export interface AuthUser {
  ci: string;
  employeeId: string;
  fullName: string;
  role: Role;
  userId: string;
}

export type AuthenticatedRequest = Request & { authUser?: AuthUser };

const loginAttempts = new Map<string, { count: number; firstAttemptAt: number }>();

function getJwtSecret() {
  return process.env.JWT_SECRET || 'desarrollo-cambiar-esta-clave-en-produccion';
}

function base64Url(input: Buffer | string) {
  return Buffer.from(input).toString('base64url');
}

function timingSafeEqualText(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) return false;

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString('base64url');
  const derived = crypto.pbkdf2Sync(password, salt, PASSWORD_ITERATIONS, PASSWORD_KEY_LENGTH, 'sha256').toString('base64url');

  return `${PASSWORD_PREFIX}$${PASSWORD_ITERATIONS}$${salt}$${derived}`;
}

export function verifyPassword(password: string, storedPassword: string) {
  if (!storedPassword.startsWith(`${PASSWORD_PREFIX}$`)) {
    return timingSafeEqualText(password, storedPassword);
  }

  const [, iterationsValue, salt, storedHash] = storedPassword.split('$');
  const iterations = Number(iterationsValue);

  if (!iterations || !salt || !storedHash) return false;

  const derived = crypto.pbkdf2Sync(password, salt, iterations, PASSWORD_KEY_LENGTH, 'sha256').toString('base64url');

  return timingSafeEqualText(derived, storedHash);
}

export function createAuthToken(payload: Omit<TokenPayload, 'exp'>) {
  const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64Url(JSON.stringify({ ...payload, exp: Date.now() + TOKEN_TTL_MS }));
  const signature = crypto.createHmac('sha256', getJwtSecret()).update(`${header}.${body}`).digest('base64url');

  return `${header}.${body}.${signature}`;
}

function verifyAuthToken(token: string): TokenPayload | null {
  const [header, body, signature] = token.split('.');

  if (!header || !body || !signature) return null;

  const expected = crypto.createHmac('sha256', getJwtSecret()).update(`${header}.${body}`).digest('base64url');

  if (!timingSafeEqualText(signature, expected)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as TokenPayload;

    if (!payload.exp || payload.exp < Date.now() || !payload.userId || !payload.employeeId) return null;

    return payload;
  } catch {
    return null;
  }
}

export function registerLoginAttempt(key: string) {
  const now = Date.now();
  const current = loginAttempts.get(key);

  if (!current || now - current.firstAttemptAt > LOGIN_WINDOW_MS) {
    loginAttempts.set(key, { count: 1, firstAttemptAt: now });
    return false;
  }

  current.count += 1;
  loginAttempts.set(key, current);

  return current.count > MAX_LOGIN_ATTEMPTS;
}

export function clearLoginAttempts(key: string) {
  loginAttempts.delete(key);
}

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const header = req.header('authorization') ?? '';
  // Also accept token as query param for SSE connections (EventSource can't set headers)
  const queryToken = typeof req.query.token === 'string' ? req.query.token : '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : queryToken;
  const payload = token ? verifyAuthToken(token) : null;

  if (!payload) {
    res.status(401).json({ message: 'Sesion no valida o expirada' });
    return;
  }

  const employee = await prisma.employee.findUnique({
    where: { id: payload.employeeId },
    include: { user: true },
  });

  if (!employee || employee.status !== UserStatus.ACTIVE || employee.user.status !== UserStatus.ACTIVE) {
    res.status(401).json({ message: 'Usuario inactivo o no encontrado' });
    return;
  }

  req.authUser = {
    ci: employee.ci,
    employeeId: employee.id,
    fullName: employee.fullName,
    role: employee.user.role,
    userId: employee.user.id,
  };

  next();
}

export function requireRole(role: Role) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (req.authUser?.role !== role) {
      res.status(403).json({ message: 'No tiene permiso para realizar esta accion' });
      return;
    }

    next();
  };
}

export function requireSelfOrAdmin(getCi: (req: Request) => string | undefined) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const targetCi = getCi(req);

    if (req.authUser?.role === 'ADMIN' || (targetCi && req.authUser?.ci === targetCi)) {
      next();
      return;
    }

    res.status(403).json({ message: 'No tiene permiso para consultar este recurso' });
  };
}

export function cleanText(value: unknown, maxLength = 200) {
  if (typeof value !== 'string') return null;

  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, '').trim();

  return cleaned ? cleaned.slice(0, maxLength) : null;
}

export function isValidCi(value: unknown) {
  return typeof value === 'string' && /^[a-zA-Z0-9-]{3,20}$/.test(value.trim());
}

export function isValidIsoDate(value: unknown) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`));
}

export function isValidTime(value: unknown) {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function isValidGeoPoint(value: unknown): value is { latitude: number; longitude: number; accuracy?: number } {
  if (!value || typeof value !== 'object') return false;
  const point = value as { latitude?: unknown; longitude?: unknown; accuracy?: unknown };
  const latitude = Number(point.latitude);
  const longitude = Number(point.longitude);
  const accuracy = point.accuracy === undefined ? undefined : Number(point.accuracy);

  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180 &&
    (accuracy === undefined || (Number.isFinite(accuracy) && accuracy >= 0 && accuracy <= 10000))
  );
}
