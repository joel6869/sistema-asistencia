import fs from 'node:fs';
import path from 'node:path';
import { Attendance, ConfigurationVersion, Employee, User } from '@prisma/client';

export interface GeoPoint {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

export interface LocationPoint {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

export function getBoliviaTime(date: Date) {
  return new Date(date.getTime() - 4 * 60 * 60 * 1000);
}

export function getDateKey(date: Date) {
  const d = getBoliviaTime(date);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getUtcDateKey(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getDayStart(date: Date) {
  return new Date(`${getDateKey(date)}T00:00:00.000Z`);
}

export function calculateLateMinutes(date: Date, entryTime: string) {
  const [hours, minutes] = entryTime.split(':').map(Number);
  const boliviaDate = getBoliviaTime(date);
  const actualMinutes = boliviaDate.getUTCHours() * 60 + boliviaDate.getUTCMinutes();
  const expectedMinutes = hours * 60 + minutes;

  return Math.max(0, actualMinutes - expectedMinutes);
}

export function serializeEmployee(employee: Employee & { user: User }) {
  return {
    id: employee.id,
    ci: employee.ci,
    fullName: employee.fullName,
    position: employee.position,
    department: employee.department,
    departamentoBolivia: employee.departamentoBolivia,
    phone: employee.phone,
    profilePhotoUrl: employee.profilePhotoUrl,
    locationControlEnabled: employee.locationControlEnabled,
    locationRadiusMeters: employee.locationRadiusMeters,
    locationPoints: normalizeLocationPoints(employee.locationPoints),
    role: employee.user.role,
    status: employee.status,
    createdAt: employee.createdAt.toISOString(),
    updatedAt: employee.updatedAt.toISOString(),
  };
}

export function normalizeLocationPoints(value: unknown): LocationPoint[] {
  if (!Array.isArray(value)) return [];

  const points: Array<LocationPoint | null> = value
    .slice(0, 20)
    .map((item, index) => {
      if (!item || typeof item !== 'object') return null;
      const point = item as Partial<LocationPoint>;
      const latitude = Number(point.latitude);
      const longitude = Number(point.longitude);

      if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        latitude < -90 ||
        latitude > 90 ||
        longitude < -180 ||
        longitude > 180
      ) {
        return null;
      }

      return {
        id: point.id?.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80) || `point-${index + 1}`,
        name: point.name?.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 100) || `Punto ${index + 1}`,
        latitude,
        longitude,
      };
    });

  return points.filter((point): point is LocationPoint => point !== null);
}

export function calculateDistanceMeters(origin: GeoPoint, destination: LocationPoint) {
  const earthRadiusMeters = 6371000;
  const originLat = toRadians(origin.latitude);
  const destinationLat = toRadians(destination.latitude);
  const deltaLat = toRadians(destination.latitude - origin.latitude);
  const deltaLng = toRadians(destination.longitude - origin.longitude);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(originLat) *
      Math.cos(destinationLat) *
      Math.sin(deltaLng / 2) *
      Math.sin(deltaLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusMeters * c;
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

type AttendanceWithConfiguration = Attendance & {
  configurationVersion?: ConfigurationVersion | null;
};

export function serializeAttendance(attendance: AttendanceWithConfiguration) {
  return {
    id: attendance.id,
    employeeId: attendance.employeeId,
    attendanceDate: getUtcDateKey(attendance.attendanceDate),
    configuration: attendance.configurationVersion
      ? {
          entryTime: attendance.configurationVersion.entryTime,
          toleranceMinutes: attendance.configurationVersion.toleranceMinutes,
        }
      : undefined,
    entryTime: attendance.entryTime?.toISOString() ?? null,
    exitTime: attendance.exitTime?.toISOString() ?? null,
    lateMinutes: attendance.lateMinutes,
    status: attendance.status,
    entryLocation:
      attendance.entryLatitude === null || attendance.entryLongitude === null
        ? undefined
        : {
            latitude: attendance.entryLatitude,
            longitude: attendance.entryLongitude,
            accuracy: attendance.entryAccuracy ?? undefined,
          },
    exitLocation:
      attendance.exitLatitude === null || attendance.exitLongitude === null
        ? undefined
        : {
            latitude: attendance.exitLatitude,
            longitude: attendance.exitLongitude,
            accuracy: attendance.exitAccuracy ?? undefined,
          },
    entryPhotoDataUrl: attendance.entryPhotoUrl,
    exitPhotoDataUrl: attendance.exitPhotoUrl,
    notes: attendance.notes,
    entryObservation: attendance.entryObservation,
    exitObservation: attendance.exitObservation,
    justificationNote: attendance.justificationNote,
    createdAt: attendance.createdAt.toISOString(),
    updatedAt: attendance.updatedAt.toISOString(),
  };
}

export function serializeConfiguration(configuration: ConfigurationVersion) {
  return {
    id: configuration.id,
    name: configuration.name,
    entryTime: configuration.entryTime,
    exitTime: configuration.exitTime,
    toleranceMinutes: configuration.toleranceMinutes,
    workDays: configuration.workDays,
  };
}

export function saveAttendancePhoto(photoDataUrl: string, employeeId: string, type: 'ENTRY' | 'EXIT') {
  return saveImage(photoDataUrl, 'attendance', `${employeeId}-${type.toLowerCase()}`);
}

export function saveProfilePhoto(photoDataUrl: string, employeeId: string) {
  return saveImage(photoDataUrl, 'profiles', employeeId);
}

function saveImage(photoDataUrl: string, folder: string, prefix: string) {
  const matches = photoDataUrl.match(/^data:(image\/(png|jpeg|jpg|webp));base64,(.+)$/);

  if (!matches) {
    return null;
  }

  const extension = matches[2] === 'jpeg' ? 'jpg' : matches[2];
  const imageBuffer = Buffer.from(matches[3], 'base64');

  if (imageBuffer.length > 3 * 1024 * 1024) {
    return null;
  }

  const uploadDir = path.join(process.cwd(), 'uploads', folder);
  fs.mkdirSync(uploadDir, { recursive: true });

  const fileName = `${prefix}-${Date.now()}.${extension}`;
  const absolutePath = path.join(uploadDir, fileName);
  fs.writeFileSync(absolutePath, imageBuffer);

  return `/uploads/${folder}/${fileName}`;
}
