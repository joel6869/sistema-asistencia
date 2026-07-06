import { Request, Response } from 'express';
import { writeAuditLog } from '../../lib/audit.js';
import { serializeConfiguration } from '../../lib/domain.js';
import { prisma } from '../../lib/prisma.js';
import { AuthenticatedRequest, isValidTime } from '../../lib/security.js';

interface ConfigurationPayload {
  entryTime: string;
  exitTime: string;
  toleranceMinutes?: number;
}

export async function getCurrentConfiguration(_req: Request, res: Response) {
  const configuration = await prisma.configurationVersion.findFirst({
    where: {
      isActive: true,
    },
    orderBy: {
      validFrom: 'desc',
    },
  });

  if (!configuration) {
    res.status(404).json({
      message: 'No existe una configuracion vigente. Ejecuta el seed inicial.',
    });
    return;
  }

  res.status(200).json({
    data: serializeConfiguration(configuration),
  });
}

export async function updateCurrentConfiguration(
  req: AuthenticatedRequest & Request<unknown, unknown, ConfigurationPayload>,
  res: Response,
) {
  const {
    entryTime,
    exitTime,
    toleranceMinutes = 0,
  } = req.body;

  if (!isValidTime(entryTime) || !isValidTime(exitTime)) {
    res.status(400).json({
      message: 'Debe configurar hora de ingreso y salida con formato HH:mm',
    });
    return;
  }

  const tolerance = Number(toleranceMinutes);

  if (!Number.isFinite(tolerance) || tolerance < 0 || tolerance > 240) {
    res.status(400).json({
      message: 'La tolerancia debe estar entre 0 y 240 minutos',
    });
    return;
  }

  const current = await prisma.configurationVersion.findFirst({
    where: { isActive: true },
    orderBy: { validFrom: 'desc' },
  });

  const configuration = await prisma.$transaction(async (tx) => {
    if (current) {
      await tx.configurationVersion.update({
          where: { id: current.id },
          data: {
            isActive: false,
            validUntil: new Date(),
          },
        });
    }

    const saved = await tx.configurationVersion.create({
          data: {
            name: 'Configuracion institucional',
            validFrom: new Date(),
            entryTime,
            exitTime,
            toleranceMinutes: Math.trunc(tolerance),
            isActive: true,
          },
        });

    return tx.configurationVersion.findUniqueOrThrow({
      where: { id: saved.id },
    });
  });

  res.status(200).json({
    message: 'Configuracion actualizada correctamente',
    data: serializeConfiguration(configuration),
  });

  await writeAuditLog({
    action: 'UPDATE_CONFIGURATION',
    actorCi: req.authUser?.ci,
    entity: 'ConfigurationVersion',
    entityId: configuration.id,
    oldValue: current
      ? {
          entryTime: current.entryTime,
          exitTime: current.exitTime,
          toleranceMinutes: current.toleranceMinutes,
        }
      : null,
    newValue: {
      entryTime: configuration.entryTime,
      exitTime: configuration.exitTime,
      toleranceMinutes: configuration.toleranceMinutes,
    },
  });
}
