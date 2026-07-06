# Estado actual del desarrollo

## Resumen

El proyecto cuenta con una base inicial organizada para continuar el desarrollo del sistema web de asistencia. La estructura separa frontend, backend, modelo de datos y configuracion de despliegue local.

## Completado

- Idea general, alcance funcional y reglas principales documentadas.
- Frontend creado con React + Vite.
- Backend creado con Node.js + Express + TypeScript.
- Endpoint de salud disponible en `/api/health`.
- Modelo Prisma inicial ampliado para empleados, asistencias, configuraciones, descuentos, feriados, justificativos y auditoria.
- Backend conectado a PostgreSQL mediante Prisma.
- Seed inicial con administrador, empleado demo, configuracion institucional y reglas de descuento.
- Fotografias de asistencia guardadas como archivos en `backend/uploads/attendance`.
- Docker Compose preparado para PostgreSQL, backend y frontend.
- Compilacion verificada para backend y frontend.

## En desarrollo

- API para consultar, crear, actualizar y desactivar empleados usando base de datos.
- Login inicial por CI para administrador y empleado.
- API para registrar entrada y salida con hora del servidor, ubicacion automatica opcional y fotografia obligatoria.
- Frontend con camara obligatoria al momento de marcar entrada o salida.
- Captura de camara con reintento, limpieza de errores de permisos y compresion JPEG antes de enviar al servidor.
- Ubicacion con alta precision usando varias lecturas y guardando la mejor precision disponible.
- Historial visual en calendario mensual con estados por color.
- Administrador puede editar, crear y eliminar/desactivar funcionarios.
- Administrador puede cargar foto de perfil y configurar haber basico individual por funcionario.
- Administrador puede configurar hora de ingreso, salida, tolerancia, descuentos de ley, descuento por dia y reglas por minutos.
- Pantalla de empleado con registro del dia e historial.
- Pantalla de administrador con vista general, funcionarios y configuracion.
- Preparacion de la arquitectura para autenticacion, reglas de negocio y reportes.

## Pendiente principal

- Middleware de seguridad por sesion/token para proteger rutas administrativas.
- CRUD completo de empleados con validaciones avanzadas.
- Migraciones formales versionadas de Prisma.
- Proteccion real de rutas administrativas mediante middleware de rol.
- Calculo automatico de retrasos segun horarios vigentes.
- Gestion de justificativos y aprobaciones.
- Versionado completo de configuraciones institucionales.
- Exportacion mensual a Excel y PDF.
- Auditoria de cambios administrativos.
- Pruebas automatizadas.
- Despliegue en nube.

## Siguiente fase recomendada

1. Crear migraciones formales versionadas de Prisma.
2. Implementar sesion/token y middleware de roles sin pedir contrasena al funcionario.
3. Completar validaciones del CRUD de empleados.
4. Agregar compresion real de fotografias.
5. Implementar justificativos, aprobaciones y auditoria administrativa.
6. Implementar reportes Excel/PDF.

## Nota tecnica

PowerShell puede bloquear `npm.ps1` por politica de ejecucion. En ese caso se debe usar `npm.cmd`, por ejemplo:

```powershell
cd 'C:\Users\BONNY\Desktop\sistema de assitencia'
& 'C:\Program Files\nodejs\npm.cmd' run build
```

El error `ENOENT: no such file or directory, open 'C:\Users\BONNY\package.json'` ocurre cuando se ejecuta npm desde una carpeta que no contiene el proyecto. La solucion es entrar primero a la carpeta raiz:

```powershell
cd 'C:\Users\BONNY\Desktop\sistema de assitencia'
& 'C:\Program Files\nodejs\npm.cmd' run dev
```
