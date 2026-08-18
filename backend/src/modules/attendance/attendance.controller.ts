import crypto from 'node:crypto';
import { Request, Response } from 'express';
import { AttendanceStatus } from '@prisma/client';
import {
  calculateDistanceMeters,
  calculateLateMinutes,
  GeoPoint,
  getDateKey,
  getDayStart,
  getUtcDateKey,
  normalizeLocationPoints,
  saveAttendancePhoto,
  serializeAttendance,
} from '../../lib/domain.js';
import { writeAuditLog } from '../../lib/audit.js';
import { prisma } from '../../lib/prisma.js';
import { AuthenticatedRequest, cleanText, isValidGeoPoint, isValidIsoDate, isValidTime } from '../../lib/security.js';
import { addSseClient, broadcastAttendanceUpdate } from '../../lib/sse.js';

interface AttendancePayload {
  ci: string;
  type: 'ENTRY' | 'EXIT';
  location?: GeoPoint;
  photoDataUrl?: string;
  observation?: string | null;
}

interface AdminAttendancePayload {
  employeeId: string;
  attendanceDate: string;
  entryTime?: string | null;
  exitTime?: string | null;
  status?: AttendanceStatus | 'AUTO';
  notes?: string | null;
  entryObservation?: string | null;
  exitObservation?: string | null;
  justificationNote?: string | null;
}

export async function listAttendances(_req: Request, res: Response) {
  const attendances = await prisma.attendance.findMany({
    include: {
      configurationVersion: true,
    },
    orderBy: [{ attendanceDate: 'desc' }, { createdAt: 'desc' }],
  });

  res.status(200).json({
    data: attendances.map(serializeAttendance),
    total: attendances.length,
  });
}

export function subscribeAttendances(req: AuthenticatedRequest & Request, res: Response) {
  const clientId = crypto.randomUUID();
  addSseClient(clientId, res);
}

export async function getAttendanceSummary(_req: Request, res: Response) {
  const today = getDayStart(new Date());
  const [activeEmployees, todayAttendances] = await Promise.all([
    prisma.employee.count({
      where: {
        status: 'ACTIVE',
      },
    }),
    prisma.attendance.findMany({
      where: {
        attendanceDate: today,
      },
    }),
  ]);

  res.status(200).json({
    data: {
      date: getUtcDateKey(today),
      activeEmployees,
      registered: todayAttendances.length,
      present: todayAttendances.filter((attendance) => ['PRESENT', 'JUSTIFIED'].includes(attendance.status)).length,
      late: todayAttendances.filter((attendance) => attendance.status === 'LATE').length,
      outsideArea: todayAttendances.filter((attendance) => isOutsideAreaAttendance(attendance.notes)).length,
      pending: Math.max(activeEmployees - todayAttendances.length, 0),
    },
  });
}

export async function listAttendancesByCi(req: Request<{ ci: string }>, res: Response) {
  const employee = await prisma.employee.findUnique({
    where: {
      ci: req.params.ci,
    },
  });

  if (!employee) {
    res.status(404).json({
      message: 'Empleado no encontrado',
    });
    return;
  }

  const attendances = await prisma.attendance.findMany({
    where: {
      employeeId: employee.id,
    },
    include: {
      configurationVersion: true,
    },
    orderBy: {
      attendanceDate: 'desc',
    },
  });

  res.status(200).json({
    data: attendances.map(serializeAttendance),
    total: attendances.length,
  });
}

export async function registerAttendance(req: AuthenticatedRequest & Request<unknown, unknown, AttendancePayload>, res: Response) {
  const { ci, type, photoDataUrl } = req.body;
  const location = isValidGeoPoint(req.body.location) ? req.body.location : undefined;
  const cleanObservation = cleanText(req.body.observation, 500);

  if (!ci || (type !== 'ENTRY' && type !== 'EXIT')) {
    res.status(400).json({
      message: 'Se requiere ci y type con valor ENTRY o EXIT',
    });
    return;
  }

  if (req.authUser?.role !== 'ADMIN' && req.authUser?.ci !== ci) {
    res.status(403).json({
      message: 'No puede registrar asistencia de otro funcionario',
    });
    return;
  }

  if (!photoDataUrl) {
    res.status(400).json({
      message: 'Debe adjuntar una fotografia para registrar la asistencia',
    });
    return;
  }

  const employee = await prisma.employee.findFirst({
    where: {
      ci,
      status: 'ACTIVE',
    },
  });

  if (!employee) {
    res.status(404).json({
      message: 'Empleado activo no encontrado',
    });
    return;
  }

  const configuration = await prisma.configurationVersion.findFirst({
    where: {
      isActive: true,
    },
    orderBy: {
      validFrom: 'desc',
    },
  });

  if (!configuration) {
    res.status(409).json({
      message: 'No existe una configuracion vigente para calcular la asistencia',
    });
    return;
  }

  const serverTime = new Date();
  const attendanceDate = getDayStart(serverTime);
  const locationPoints = normalizeLocationPoints(employee.locationPoints);
  const entryLocationNote =
    type === 'ENTRY' && employee.locationControlEnabled
      ? getEntryLocationNote(location, locationPoints, employee.locationRadiusMeters)
      : null;

  const existingRecord = await prisma.attendance.findUnique({
    where: {
      employeeId_attendanceDate: {
        employeeId: employee.id,
        attendanceDate,
      },
    },
  });

  if (type === 'ENTRY') {
    if (existingRecord?.entryTime) {
      res.status(409).json({
        message: 'La entrada ya fue registrada para hoy',
        data: serializeAttendance(existingRecord),
      });
      return;
    }

    const photoUrl = saveAttendancePhoto(photoDataUrl, employee.id, type);

    if (!photoUrl) {
      res.status(400).json({
        message: 'La fotografia enviada no tiene un formato valido',
      });
      return;
    }

    const rawLateMinutes = calculateLateMinutes(serverTime, configuration.entryTime);
    const lateMinutes = Math.max(0, rawLateMinutes - configuration.toleranceMinutes);
    const attendance = await prisma.attendance.upsert({
      where: {
        employeeId_attendanceDate: {
          employeeId: employee.id,
          attendanceDate,
        },
      },
      create: {
        employeeId: employee.id,
        configurationVersionId: configuration.id,
        attendanceDate,
        entryTime: serverTime,
        entryPhotoUrl: photoUrl,
        entryLatitude: location?.latitude,
        entryLongitude: location?.longitude,
        entryAccuracy: location?.accuracy,
        lateMinutes,
        status: lateMinutes > 0 ? 'LATE' : 'PRESENT',
        notes: entryLocationNote,
        entryObservation: cleanObservation,
      },
      update: {
        entryTime: serverTime,
        entryPhotoUrl: photoUrl,
        entryLatitude: location?.latitude,
        entryLongitude: location?.longitude,
        entryAccuracy: location?.accuracy,
        lateMinutes,
        status: lateMinutes > 0 ? 'LATE' : 'PRESENT',
        notes: entryLocationNote,
        entryObservation: cleanObservation,
      },
    });

    const message = entryLocationNote
      ? `Entrada registrada correctamente. Observacion: ${entryLocationNote}`
      : 'Entrada registrada correctamente';

    await writeAuditLog({
      action: 'REGISTER_ENTRY',
      actorCi: req.authUser?.ci,
      entity: 'Attendance',
      entityId: attendance.id,
      newValue: {
        attendanceDate: getUtcDateKey(attendanceDate),
        employeeCi: employee.ci,
        employeeName: employee.fullName,
        entryTime: serverTime.toISOString(),
        lateMinutes,
        status: attendance.status,
        outsideArea: Boolean(entryLocationNote),
      },
    });

    const serialized = serializeAttendance(attendance);
    broadcastAttendanceUpdate(serialized);

    res.status(201).json({
      message,
      serverTime: serverTime.toISOString(),
      data: serialized,
    });
    return;
  }

  if (!existingRecord?.entryTime) {
    res.status(409).json({
      message: 'Debe registrar entrada antes de registrar salida',
    });
    return;
  }

  if (existingRecord.exitTime) {
    res.status(409).json({
      message: 'La salida ya fue registrada para hoy',
      data: serializeAttendance(existingRecord),
    });
    return;
  }

  const photoUrl = saveAttendancePhoto(photoDataUrl, employee.id, type);

  if (!photoUrl) {
    res.status(400).json({
      message: 'La fotografia enviada no tiene un formato valido',
    });
    return;
  }

  const attendance = await prisma.attendance.update({
    where: {
      id: existingRecord.id,
    },
    data: {
      exitTime: serverTime,
      exitPhotoUrl: photoUrl,
      exitLatitude: location?.latitude,
      exitLongitude: location?.longitude,
      exitAccuracy: location?.accuracy,
      exitObservation: cleanObservation,
    },
  });

  await writeAuditLog({
    action: 'REGISTER_EXIT',
    actorCi: req.authUser?.ci,
    entity: 'Attendance',
    entityId: attendance.id,
    newValue: {
      attendanceDate: getUtcDateKey(attendance.attendanceDate),
      employeeCi: employee.ci,
      employeeName: employee.fullName,
      exitTime: serverTime.toISOString(),
      status: attendance.status,
    },
  });

  const serializedExit = serializeAttendance(attendance);
  broadcastAttendanceUpdate(serializedExit);

  res.status(201).json({
    message: 'Salida registrada correctamente',
    serverTime: serverTime.toISOString(),
    data: serializedExit,
  });
}

export async function saveAdminAttendance(
  req: AuthenticatedRequest & Request<unknown, unknown, AdminAttendancePayload>,
  res: Response,
) {
  const {
    employeeId,
    attendanceDate,
    entryTime = null,
    exitTime = null,
    status = 'PRESENT',
    notes = null,
    entryObservation = null,
    exitObservation = null,
    justificationNote = null,
  } = req.body;

  if (!employeeId || !isValidIsoDate(attendanceDate)) {
    res.status(400).json({
      message: 'Debe seleccionar funcionario y una fecha valida',
    });
    return;
  }

  if ((entryTime && !isValidTime(entryTime)) || (exitTime && !isValidTime(exitTime))) {
    res.status(400).json({
      message: 'Formato de hora no valido',
    });
    return;
  }

  if (!['AUTO', 'PENDING', 'PRESENT', 'LATE', 'ABSENT', 'JUSTIFIED', 'HOLIDAY', 'WEEKEND'].includes(status)) {
    res.status(400).json({
      message: 'Estado de asistencia no valido',
    });
    return;
  }

  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });

  if (!employee) {
    res.status(404).json({
      message: 'Empleado no encontrado',
    });
    return;
  }

  const configuration = await prisma.configurationVersion.findFirst({
    where: { isActive: true },
    orderBy: { validFrom: 'desc' },
  });
  const date = new Date(`${attendanceDate}T00:00:00.000Z`);
  const entryDateTime = entryTime ? new Date(`${attendanceDate}T${entryTime}:00-04:00`) : null;
  const exitDateTime = exitTime ? new Date(`${attendanceDate}T${exitTime}:00-04:00`) : null;
  const calculatedLateMinutes =
    entryDateTime && configuration
      ? Math.max(0, calculateLateMinutes(entryDateTime, configuration.entryTime) - configuration.toleranceMinutes)
      : 0;
  const finalStatus = resolveAdminAttendanceStatus(status, calculatedLateMinutes, Boolean(entryDateTime));
  const previousAttendance = await prisma.attendance.findUnique({
    where: {
      employeeId_attendanceDate: {
        employeeId,
        attendanceDate: date,
      },
    },
  });
  const attendance = await prisma.attendance.upsert({
    where: {
      employeeId_attendanceDate: {
        employeeId,
        attendanceDate: date,
      },
    },
    create: {
      employeeId,
      configurationVersionId: configuration?.id,
      attendanceDate: date,
      entryTime: entryDateTime,
      exitTime: exitDateTime,
      lateMinutes: calculatedLateMinutes,
      status: finalStatus,
      notes: cleanText(notes, 500),
      entryObservation: cleanText(entryObservation, 500),
      exitObservation: cleanText(exitObservation, 500),
      justificationNote: cleanText(justificationNote, 500),
    },
    update: {
      entryTime: entryDateTime,
      exitTime: exitDateTime,
      lateMinutes: calculatedLateMinutes,
      status: finalStatus,
      notes: cleanText(notes, 500),
      entryObservation: cleanText(entryObservation, 500),
      exitObservation: cleanText(exitObservation, 500),
      justificationNote: cleanText(justificationNote, 500),
    },
    include: {
      configurationVersion: true,
    },
  });

  await writeAuditLog({
    action: previousAttendance ? 'ADMIN_UPDATE_ATTENDANCE' : 'ADMIN_CREATE_ATTENDANCE',
    actorCi: req.authUser?.ci,
    entity: 'Attendance',
    entityId: attendance.id,
    oldValue: previousAttendance
      ? {
          entryTime: previousAttendance.entryTime?.toISOString() ?? null,
          exitTime: previousAttendance.exitTime?.toISOString() ?? null,
          lateMinutes: previousAttendance.lateMinutes,
          status: previousAttendance.status,
        }
      : null,
    newValue: {
      attendanceDate,
      employeeCi: employee.ci,
      employeeName: employee.fullName,
      entryTime: attendance.entryTime?.toISOString() ?? null,
      exitTime: attendance.exitTime?.toISOString() ?? null,
      lateMinutes: attendance.lateMinutes,
      status: attendance.status,
    },
  });

  const serializedAdmin = serializeAttendance(attendance);
  broadcastAttendanceUpdate(serializedAdmin);

  res.status(200).json({
    message: 'Marcado actualizado correctamente',
    data: serializedAdmin,
  });
}

function resolveAdminAttendanceStatus(
  requestedStatus: AttendanceStatus | 'AUTO',
  lateMinutes: number,
  hasEntryTime: boolean,
): AttendanceStatus {
  if (
    requestedStatus === 'ABSENT' ||
    requestedStatus === 'JUSTIFIED' ||
    requestedStatus === 'HOLIDAY' ||
    requestedStatus === 'WEEKEND' ||
    requestedStatus === 'PENDING'
  ) {
    return requestedStatus;
  }

  if (!hasEntryTime) {
    return 'PENDING';
  }

  return lateMinutes > 0 ? 'LATE' : 'PRESENT';
}

export async function deleteAttendanceMark(
  req: AuthenticatedRequest & Request<{ id: string; type: 'entry' | 'exit' | 'all' }>,
  res: Response,
) {
  if (!['entry', 'exit', 'all'].includes(req.params.type)) {
    res.status(400).json({
      message: 'Tipo de marcado no valido',
    });
    return;
  }

  const attendance = await prisma.attendance.findUnique({ where: { id: req.params.id } });

  if (!attendance) {
    res.status(404).json({
      message: 'Registro de asistencia no encontrado',
    });
    return;
  }

  if (req.params.type === 'all') {
    await prisma.attendance.delete({ where: { id: attendance.id } });
    await writeAuditLog({
      action: 'DELETE_ATTENDANCE',
      actorCi: req.authUser?.ci,
      entity: 'Attendance',
      entityId: attendance.id,
      oldValue: {
        attendanceDate: getUtcDateKey(attendance.attendanceDate),
        entryTime: attendance.entryTime?.toISOString() ?? null,
        exitTime: attendance.exitTime?.toISOString() ?? null,
        status: attendance.status,
      },
    });
    broadcastAttendanceUpdate({ id: attendance.id, deleted: true });
    res.status(200).json({ message: 'Registro eliminado correctamente' });
    return;
  }

  const updated = await prisma.attendance.update({
    where: { id: attendance.id },
    data:
      req.params.type === 'entry'
        ? {
            entryTime: null,
            entryPhotoUrl: null,
            entryLatitude: null,
            entryLongitude: null,
            entryAccuracy: null,
            entryObservation: null,
            lateMinutes: 0,
            status: attendance.exitTime ? attendance.status : 'PENDING',
          }
        : {
            exitTime: null,
            exitPhotoUrl: null,
            exitLatitude: null,
            exitLongitude: null,
            exitAccuracy: null,
            exitObservation: null,
          },
  });

  await writeAuditLog({
    action: req.params.type === 'entry' ? 'DELETE_ATTENDANCE_ENTRY' : 'DELETE_ATTENDANCE_EXIT',
    actorCi: req.authUser?.ci,
    entity: 'Attendance',
    entityId: attendance.id,
    oldValue: {
      attendanceDate: getUtcDateKey(attendance.attendanceDate),
      entryTime: attendance.entryTime?.toISOString() ?? null,
      exitTime: attendance.exitTime?.toISOString() ?? null,
      status: attendance.status,
    },
    newValue: {
      entryTime: updated.entryTime?.toISOString() ?? null,
      exitTime: updated.exitTime?.toISOString() ?? null,
      status: updated.status,
    },
  });

  const serializedDeleted = serializeAttendance(updated);
  broadcastAttendanceUpdate(serializedDeleted);

  res.status(200).json({
    message: 'Marcado eliminado correctamente',
    data: serializedDeleted,
  });
}

function getEntryLocationNote(
  location: GeoPoint | undefined,
  points: ReturnType<typeof normalizeLocationPoints>,
  radiusMeters: number,
) {
  if (points.length === 0) {
    return 'Control de ubicacion activo sin puntos permitidos configurados';
  }

  if (!location) {
    return 'Entrada registrada sin ubicacion GPS para validar el punto permitido';
  }

  const closest = points
    .map((point) => ({
      point,
      distanceMeters: calculateDistanceMeters(location, point),
    }))
    .sort((a, b) => a.distanceMeters - b.distanceMeters)[0];

  if (!closest) {
    return null;
  }

  const roundedDistance = Math.round(closest.distanceMeters);

  if (closest.distanceMeters <= radiusMeters) {
    return `Entrada dentro del rango. Punto: ${closest.point.name} (distancia aprox. ${roundedDistance} m)`;
  }

  return `Entrada fuera del radio permitido. Punto mas cercano: ${closest.point.name}, distancia aproximada ${roundedDistance} m`;
}

function isOutsideAreaAttendance(notes: string | null) {
  return Boolean(notes?.includes('Entrada fuera del radio permitido'));
}
