import { Request, Response } from 'express';
import { prisma } from '../../lib/prisma.js';

export async function listAuditLogs(_req: Request, res: Response) {
  const logs = await prisma.auditLog.findMany({
    include: {
      actor: true,
    },
    orderBy: {
      createdAt: 'desc',
    },
    take: 300,
  });

  res.status(200).json({
    data: logs.map((log) => ({
      id: log.id,
      action: log.action,
      actor: log.actor
        ? {
            ci: log.actor.ci,
            name: log.actor.name,
            role: log.actor.role,
          }
        : null,
      entity: log.entity,
      entityId: log.entityId,
      oldValue: log.oldValue,
      newValue: log.newValue,
      reason: log.reason,
      createdAt: log.createdAt.toISOString(),
    })),
    total: logs.length,
  });
}
