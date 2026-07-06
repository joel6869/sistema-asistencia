# Sistema Web de Asistencia

Sistema web para automatizar el control de asistencia del personal del Observatorio Agroambiental y Productivo.

## Objetivo

Reemplazar el registro manual en planillas por una plataforma que permita registrar entradas y salidas con hora oficial del servidor, ubicacion GPS, fotografia de evidencia, reglas institucionales configurables y reportes mensuales.

## Estructura

- `frontend`: interfaz web en React + Vite.
- `backend`: API en Node.js + Express + TypeScript.
- `backend/prisma`: modelo de base de datos con Prisma.
- `docker-compose.yml`: servicios locales para PostgreSQL, backend y frontend.

## Estado

La base tecnica compila y ya esta preparada para avanzar por modulos. El sistema todavia no esta listo para produccion; se esta construyendo la funcionalidad principal.

## Comandos utiles

En Windows, si PowerShell bloquea `npm`, usa `npm.cmd`:

```powershell
cd 'C:\Users\BONNY\Desktop\sistema de assitencia'
& 'C:\Program Files\nodejs\npm.cmd' run build --workspace backend
& 'C:\Program Files\nodejs\npm.cmd' run build --workspace frontend
```

Para desarrollo:

```powershell
cd 'C:\Users\BONNY\Desktop\sistema de assitencia'
& 'C:\Program Files\nodejs\npm.cmd' run dev
```

Para probar desde un celular usando el puerto `5173` de VS Code, solo abre la URL del frontend. El frontend usa rutas relativas `/api` y Vite reenvia esas peticiones al backend en `localhost:4000`, por eso ya no intenta conectarse al `localhost` del celular.

Si ejecutas `npm run dev` desde `C:\Users\BONNY`, npm buscara `C:\Users\BONNY\package.json` y fallara con `ENOENT`. Siempre debes estar dentro de la carpeta raiz del proyecto.

## Endpoints base disponibles

- `POST /api/auth/login`
- `GET /api/health`
- `GET /api/employees`
- `POST /api/employees`
- `PUT /api/employees/:id`
- `PATCH /api/employees/:id/deactivate`
- `GET /api/attendances`
- `GET /api/attendances/summary/today`
- `GET /api/attendances/ci/:ci`
- `POST /api/attendances/register`
- `GET /api/configuration/current`

## Accesos de prueba

Mientras se implementa autenticacion real:

- Administrador: CI `0000001`.
- Empleado: CI `1234567`.

El ingreso al sistema se realiza solo con Carnet de Identidad. La contrasena ya no se solicita en la interfaz.

## Base de datos

El backend ya usa PostgreSQL con Prisma. La URL local esta en `backend/.env`:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/asistencia_db
```

Comandos utiles:

```powershell
cd 'C:\Users\BONNY\Desktop\sistema de assitencia\backend'
& 'C:\Program Files\nodejs\npx.cmd' prisma db push
& 'C:\Program Files\nodejs\npm.cmd' run prisma:seed
```

Las fotografias de asistencia se guardan como archivos en `backend/uploads/attendance` y la base de datos almacena la ruta.
