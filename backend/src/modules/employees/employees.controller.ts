import { Request, Response } from 'express';
import { Employee, Prisma, Role, User } from '@prisma/client';
import { writeAuditLog } from '../../lib/audit.js';
import { normalizeLocationPoints, saveProfilePhoto, serializeEmployee } from '../../lib/domain.js';
import { prisma } from '../../lib/prisma.js';
import { AuthenticatedRequest, cleanText, hashPassword, isValidCi } from '../../lib/security.js';

interface EmployeePayload {
  ci: string;
  fullName: string;
  position: string;
  department?: string | null;
  departamentoBolivia?: string | null;
  phone?: string | null;
  profilePhotoDataUrl?: string | null;
  role?: Role;
  locationControlEnabled?: boolean;
  locationRadiusMeters?: number | string | null;
  locationPoints?: unknown;
}

export async function listEmployees(_req: Request, res: Response) {
  const employees = await prisma.employee.findMany({
    include: {
      user: true,
    },
    orderBy: {
      fullName: 'asc',
    },
  });

  res.status(200).json({
    data: employees.map(serializeEmployee),
    total: employees.length,
  });
}

type EmployeeWithUser = Employee & { user: User };

function toLocationPointsJson(value: unknown): Prisma.InputJsonValue {
  return normalizeLocationPoints(value) as unknown as Prisma.InputJsonValue;
}

export async function getEmployeeByCi(req: Request<{ ci: string }>, res: Response) {
  const employee = await prisma.employee.findUnique({
    where: {
      ci: req.params.ci,
    },
    include: {
      user: true,
    },
  });

  if (!employee) {
    res.status(404).json({
      message: 'Empleado no encontrado',
    });
    return;
  }

  res.status(200).json({
    data: serializeEmployee(employee as EmployeeWithUser),
  });
}

export async function createEmployee(req: AuthenticatedRequest & Request<unknown, unknown, EmployeePayload>, res: Response) {
  const {
    ci: rawCi,
    profilePhotoDataUrl = null,
    role = 'EMPLOYEE',
    locationControlEnabled = false,
    locationRadiusMeters = 800,
    locationPoints = [],
  } = req.body;
  const ci = cleanText(rawCi, 20);
  const fullName = cleanText(req.body.fullName, 120);
  const position = cleanText(req.body.position, 100);
  const department = cleanText(req.body.department, 100);
  const departamentoBolivia = cleanText(req.body.departamentoBolivia, 100);
  const phone = cleanText(req.body.phone, 40);

  if (!ci || !isValidCi(ci) || !fullName || !position) {
    res.status(400).json({
      message: 'Se requiere CI valido, nombre completo y cargo',
    });
    return;
  }

  if (role !== 'ADMIN' && role !== 'EMPLOYEE') {
    res.status(400).json({
      message: 'El rol debe ser ADMIN o EMPLOYEE',
    });
    return;
  }

  const exists = await prisma.employee.findUnique({
    where: {
      ci,
    },
  });

  if (exists) {
    res.status(409).json({
      message: 'Ya existe un empleado con ese CI',
    });
    return;
  }

  const employee = await prisma.employee.create({
    data: {
      ci,
      fullName,
      position,
      department,
      departamentoBolivia,
      phone,
      locationControlEnabled: Boolean(locationControlEnabled),
      locationRadiusMeters: Math.max(1, Number(locationRadiusMeters) || 800),
      locationPoints: toLocationPointsJson(locationPoints),
      user: {
        create: {
          ci,
          name: fullName,
          password: hashPassword(role === 'ADMIN' ? 'admin123' : ci),
          role,
          status: 'ACTIVE',
        },
      },
    },
    include: {
      user: true,
    },
  });

  if (profilePhotoDataUrl) {
    const profilePhotoUrl = saveProfilePhoto(profilePhotoDataUrl, employee.id);
    if (profilePhotoUrl) {
      const updated = await prisma.employee.update({
        where: { id: employee.id },
        data: { profilePhotoUrl },
        include: { user: true },
      });

      res.status(201).json({
        message: 'Empleado registrado correctamente',
        data: serializeEmployee(updated as EmployeeWithUser),
      });
      await writeAuditLog({
        action: 'CREATE_EMPLOYEE',
        actorCi: req.authUser?.ci,
        entity: 'Employee',
        entityId: updated.id,
        newValue: {
          ci: updated.ci,
          fullName: updated.fullName,
          position: updated.position,
          role,
        },
      });
      return;
    }
  }

  res.status(201).json({
    message: 'Empleado registrado correctamente',
    data: serializeEmployee(employee as EmployeeWithUser),
  });

  await writeAuditLog({
    action: 'CREATE_EMPLOYEE',
    actorCi: req.authUser?.ci,
    entity: 'Employee',
    entityId: employee.id,
    newValue: {
      ci: employee.ci,
      fullName: employee.fullName,
      position: employee.position,
      role,
    },
  });
}

export async function updateEmployee(req: AuthenticatedRequest & Request<{ id: string }, unknown, Partial<EmployeePayload>>, res: Response) {
  const current = await prisma.employee.findUnique({
    where: {
      id: req.params.id,
    },
    include: {
      user: true,
    },
  });

  if (!current) {
    res.status(404).json({
      message: 'Empleado no encontrado',
    });
    return;
  }

  const requestedCi = cleanText(req.body.ci, 20);
  const requestedFullName = cleanText(req.body.fullName, 120);
  const requestedPosition = cleanText(req.body.position, 100);

  if (requestedCi && !isValidCi(requestedCi)) {
    res.status(400).json({
      message: 'CI no valido',
    });
    return;
  }

  if (req.body.role && req.body.role !== 'ADMIN' && req.body.role !== 'EMPLOYEE') {
    res.status(400).json({
      message: 'Rol no valido',
    });
    return;
  }

  if (requestedCi && requestedCi !== current.ci) {
    const exists = await prisma.employee.findUnique({
      where: {
        ci: requestedCi,
      },
    });

    if (exists) {
      res.status(409).json({
        message: 'Ya existe otro empleado con ese CI',
      });
      return;
    }
  }

  const profilePhotoUrl = req.body.profilePhotoDataUrl
    ? saveProfilePhoto(req.body.profilePhotoDataUrl, current.id)
    : undefined;

  const employee = await prisma.employee.update({
    where: {
      id: req.params.id,
    },
    data: {
      ci: requestedCi ?? undefined,
      fullName: requestedFullName ?? undefined,
      position: requestedPosition ?? undefined,
      department: 'department' in req.body ? cleanText(req.body.department, 100) : undefined,
      departamentoBolivia: 'departamentoBolivia' in req.body ? cleanText(req.body.departamentoBolivia, 100) : undefined,
      phone: 'phone' in req.body ? cleanText(req.body.phone, 40) : undefined,
      profilePhotoUrl,
      locationControlEnabled:
        'locationControlEnabled' in req.body ? Boolean(req.body.locationControlEnabled) : undefined,
      locationRadiusMeters:
        'locationRadiusMeters' in req.body
          ? Math.max(1, Number(req.body.locationRadiusMeters) || 800)
          : undefined,
      locationPoints: 'locationPoints' in req.body ? toLocationPointsJson(req.body.locationPoints) : undefined,
      user: {
        update: {
          ci: requestedCi ?? undefined,
          name: requestedFullName ?? undefined,
          role: req.body.role,
        },
      },
    },
    include: {
      user: true,
    },
  });

  res.status(200).json({
    message: 'Empleado actualizado correctamente',
    data: serializeEmployee(employee as EmployeeWithUser),
  });

  await writeAuditLog({
    action: 'UPDATE_EMPLOYEE',
    actorCi: req.authUser?.ci,
    entity: 'Employee',
    entityId: employee.id,
    oldValue: {
      ci: current.ci,
      fullName: current.fullName,
      position: current.position,
      department: current.department,
      phone: current.phone,
      role: current.user.role,
    },
    newValue: {
      ci: employee.ci,
      fullName: employee.fullName,
      position: employee.position,
      department: employee.department,
      phone: employee.phone,
      role: employee.user.role,
    },
  });
}

export async function deactivateEmployee(
  req: AuthenticatedRequest & Request<{ id: string }>,
  res: Response,
) {
  const current = await prisma.employee.findUnique({
    where: {
      id: req.params.id,
    },
  });

  if (!current) {
    res.status(404).json({
      message: 'Empleado no encontrado',
    });
    return;
  }

  const employee = await prisma.employee.update({
    where: {
      id: req.params.id,
    },
    data: {
      status: 'INACTIVE',
      user: {
        update: {
          status: 'INACTIVE',
        },
      },
    },
    include: {
      user: true,
    },
  });

  res.status(200).json({
    message: 'Empleado desactivado correctamente',
    data: serializeEmployee(employee),
  });

  await writeAuditLog({
    action: 'DEACTIVATE_EMPLOYEE',
    actorCi: req.authUser?.ci,
    entity: 'Employee',
    entityId: employee.id,
    oldValue: {
      ci: current.ci,
      fullName: current.fullName,
      status: current.status,
    },
    newValue: {
      ci: employee.ci,
      fullName: employee.fullName,
      status: employee.status,
    },
  });
}
