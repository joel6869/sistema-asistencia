import { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';

interface AuditPayload {
  action: string;
  actorCi?: string | null;
  entity: string;
  entityId: string;
  newValue?: Prisma.InputJsonValue | null;
  oldValue?: Prisma.InputJsonValue | null;
  reason?: string | null;
}

export async function writeAuditLog({
  action,
  actorCi,
  entity,
  entityId,
  newValue = null,
  oldValue = null,
  reason = null,
}: AuditPayload) {
  const actor = actorCi ? await prisma.user.findUnique({ where: { ci: actorCi } }) : null;

  await prisma.auditLog.create({
    data: {
      action,
      actorId: actor?.id,
      entity,
      entityId,
      newValue: newValue ?? Prisma.JsonNull,
      oldValue: oldValue ?? Prisma.JsonNull,
      reason,
    },
  });
}
