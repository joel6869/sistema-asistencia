import { Request, Response } from 'express';
import { writeAuditLog } from '../../lib/audit.js';
import { getDateKey, getDayStart } from '../../lib/domain.js';
import { prisma } from '../../lib/prisma.js';
import { AuthenticatedRequest, cleanText, isValidIsoDate } from '../../lib/security.js';

interface HolidayPayload {
  date: string;
  name: string;
  description?: string | null;
}

function serializeHoliday(holiday: { id: string; date: Date; name: string; description: string | null }) {
  return {
    id: holiday.id,
    date: getDateKey(holiday.date),
    name: holiday.name,
    description: holiday.description,
  };
}

export async function listHolidays(_req: Request, res: Response) {
  const holidays = await prisma.holiday.findMany({
    orderBy: {
      date: 'asc',
    },
  });

  res.status(200).json({
    data: holidays.map(serializeHoliday),
    total: holidays.length,
  });
}

export async function saveHoliday(req: AuthenticatedRequest & Request<unknown, unknown, HolidayPayload>, res: Response) {
  const { date } = req.body;
  const name = cleanText(req.body.name, 120);
  const description = cleanText(req.body.description, 300);

  if (!isValidIsoDate(date) || !name) {
    res.status(400).json({
      message: 'Debe indicar fecha valida y nombre del feriado',
    });
    return;
  }

  const holidayDate = getDayStart(new Date(`${date}T00:00:00.000Z`));
  const previousHoliday = await prisma.holiday.findUnique({ where: { date: holidayDate } });
  const holiday = await prisma.holiday.upsert({
    where: {
      date: holidayDate,
    },
    create: {
      date: holidayDate,
      name,
      description,
    },
    update: {
      name,
      description,
    },
  });

  res.status(200).json({
    message: 'Feriado guardado correctamente',
    data: serializeHoliday(holiday),
  });

  await writeAuditLog({
    action: previousHoliday ? 'UPDATE_HOLIDAY' : 'CREATE_HOLIDAY',
    actorCi: req.authUser?.ci,
    entity: 'Holiday',
    entityId: holiday.id,
    oldValue: previousHoliday ? serializeHoliday(previousHoliday) : null,
    newValue: serializeHoliday(holiday),
  });
}

export async function deleteHoliday(req: AuthenticatedRequest & Request<{ id: string }>, res: Response) {
  const holiday = await prisma.holiday.delete({
    where: {
      id: req.params.id,
    },
  });

  res.status(200).json({
    message: 'Feriado eliminado correctamente',
  });

  await writeAuditLog({
    action: 'DELETE_HOLIDAY',
    actorCi: req.authUser?.ci,
    entity: 'Holiday',
    entityId: holiday.id,
    oldValue: serializeHoliday(holiday),
  });
}
