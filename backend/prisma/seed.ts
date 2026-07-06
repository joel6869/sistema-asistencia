import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/lib/security.js';

const prisma = new PrismaClient();

async function main() {
  await prisma.configurationVersion.upsert({
    where: {
      id: 'config-inicial',
    },
    update: {
      isActive: true,
      toleranceMinutes: 0,
    },
    create: {
      id: 'config-inicial',
      name: 'Configuracion institucional inicial',
      validFrom: new Date('2026-01-01T00:00:00.000Z'),
      entryTime: '06:30',
      exitTime: '15:00',
      toleranceMinutes: 0,
      workDays: [1, 2, 3, 4, 5],
      isActive: true,
    },
  });

  await prisma.user.upsert({
    where: {
      ci: '0000001',
    },
    update: {
      password: hashPassword('admin123'),
      role: 'ADMIN',
      status: 'ACTIVE',
    },
    create: {
      ci: '0000001',
      name: 'Administrador del sistema',
      password: hashPassword('admin123'),
      role: 'ADMIN',
      status: 'ACTIVE',
      employee: {
        create: {
          ci: '0000001',
          fullName: 'Administrador del sistema',
          position: 'Administrador',
          department: 'Observatorio',
          status: 'ACTIVE',
        },
      },
    },
  });

  await prisma.user.upsert({
    where: {
      ci: '1234567',
    },
    update: {
      password: hashPassword('1234567'),
      role: 'EMPLOYEE',
      status: 'ACTIVE',
    },
    create: {
      ci: '1234567',
      name: 'Funcionario de prueba',
      password: hashPassword('1234567'),
      role: 'EMPLOYEE',
      status: 'ACTIVE',
      employee: {
        create: {
          ci: '1234567',
          fullName: 'Funcionario de prueba',
          position: 'Tecnico operativo',
          department: 'Unidad de monitoreo',
          status: 'ACTIVE',
        },
      },
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
