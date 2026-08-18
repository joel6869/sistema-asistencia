import { PrismaClient } from '@prisma/client';
import { getUtcDateKey, getDateKey } from './dist/lib/domain.js';

const prisma = new PrismaClient();

async function main() {
  const att = await prisma.attendance.findUnique({
    where: { id: 'cmrmcnsvc000ne9umjhpbc32v' }
  });
  if (!att) {
    console.log('Record not found');
    return;
  }
  console.log('attendanceDate raw:', att.attendanceDate);
  console.log('toISOString:', att.attendanceDate.toISOString());
  console.log('toString:', att.attendanceDate.toString());
  console.log('toUTCString:', att.attendanceDate.toUTCString());
  console.log('getUtcDateKey:', getUtcDateKey(att.attendanceDate));
  console.log('getDateKey:', getDateKey(att.attendanceDate));
}

main().catch(console.error).finally(() => prisma.$disconnect());
