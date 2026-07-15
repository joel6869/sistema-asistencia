import { Request, Response } from 'express';
import { cleanText, clearLoginAttempts, createAuthToken, isValidCi, registerLoginAttempt } from '../../lib/security.js';
import { writeAuditLog } from '../../lib/audit.js';
import { prisma } from '../../lib/prisma.js';

interface LoginPayload {
  ci: string;
}

export async function login(req: Request<unknown, unknown, LoginPayload>, res: Response) {
  const ci = cleanText(req.body.ci, 20);
  const attemptKey = `${req.ip}:${ci ?? 'unknown'}`;

  if (!ci || !isValidCi(ci)) {
    res.status(400).json({
      message: 'Ingrese su carnet de identidad',
    });
    return;
  }

  if (registerLoginAttempt(attemptKey)) {
    res.status(429).json({
      message: 'Demasiados intentos. Espere unos minutos e intente nuevamente',
    });
    return;
  }

  const employee = await prisma.employee.findFirst({
    where: {
      ci,
      status: 'ACTIVE',
      user: {
        status: 'ACTIVE',
      },
    },
    include: {
      user: true,
    },
  });

  if (!employee) {
    res.status(401).json({
      message: 'Carnet de identidad no registrado o inactivo',
    });
    return;
  }

  clearLoginAttempts(attemptKey);

  const token = createAuthToken({
    employeeId: employee.id,
    role: employee.user.role,
    userId: employee.user.id,
  });

  res.status(200).json({
    message: 'Ingreso correcto',
    data: {
      id: employee.id,
      ci: employee.ci,
      fullName: employee.fullName,
      position: employee.position,
      department: employee.department,
      departamentoBolivia: employee.departamentoBolivia,
      role: employee.user.role,
      status: employee.status,
      token,
    },
  });

  await writeAuditLog({
    action: 'LOGIN',
    actorCi: employee.ci,
    entity: 'User',
    entityId: employee.user.id,
    newValue: {
      ci: employee.ci,
      fullName: employee.fullName,
      role: employee.user.role,
    },
  });
}
