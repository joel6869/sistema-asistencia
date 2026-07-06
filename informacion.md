# Sistema Web de Control Inteligente de Asistencia del Personal

## Descripcion general

El proyecto busca automatizar el control de asistencia del personal del Observatorio Agroambiental y Productivo. Actualmente el registro se realiza en planillas de Excel, donde se anotan manualmente la hora de ingreso, la hora de salida, los retrasos, descuentos y el liquido estimado del sueldo mensual.

El sistema no pretende cambiar la metodologia institucional, sino digitalizarla, reducir errores y generar reportes mensuales muy cercanos al formato usado actualmente.

## Objetivos principales

- Registrar asistencia diaria de cada funcionario.
- Usar siempre la hora oficial del servidor.
- Registrar ubicacion GPS del empleado.
- Registrar fotografia como evidencia.
- Calcular retrasos automaticamente.
- Aplicar reglas institucionales configurables.
- Generar reportes mensuales.
- Mantener historial completo de cambios.
- Reducir el uso de papel y planillas manuales.

## Principio de uso

El funcionario debe tardar menos de 10 segundos en registrar su asistencia. Toda la complejidad debe quedar del lado del sistema y del administrador.

## Roles

### Empleado

Puede:

- Registrar entrada.
- Registrar salida.
- Consultar historial.
- Ver registros diarios.
- Ver estados de asistencia.
- Consultar observaciones y justificativos.

No puede modificar informacion administrativa.

### Administrador

Puede:

- Registrar y modificar empleados.
- Configurar horarios.
- Registrar feriados.
- Configurar parametros salariales.
- Configurar reglas de descuentos.
- Modificar asistencias justificadas.
- Aprobar o rechazar justificativos.
- Generar reportes.
- Exportar informacion.
- Consultar estadisticas.
- Administrar configuraciones.

## Flujo de asistencia

1. El funcionario abre el sistema desde el navegador del celular.
2. Ingresa su Carnet de Identidad.
3. El sistema identifica al funcionario.
4. Al registrar entrada o salida, el sistema toma la fecha y hora desde el servidor.
5. El navegador solicita permiso de ubicacion GPS.
6. El funcionario toma una fotografia como evidencia.
7. El sistema guarda el registro completo.
8. Se muestra confirmacion de registro correcto.

## Datos guardados por marcacion

- Fecha.
- Hora oficial del servidor.
- CI del funcionario.
- Tipo de marcacion: entrada o salida.
- Fotografia.
- Latitud, longitud y precision GPS.
- Estado calculado.
- Configuracion institucional usada.

## Reglas de negocio

### Horario oficial

La configuracion define hora de ingreso, hora de salida y dias laborales.

### Dias laborales

Inicialmente se trabaja de lunes a viernes. Sabados, domingos y feriados no generan descuentos.

### Actividades especiales

El administrador puede registrar horarios excepcionales para fechas especificas.

### Retrasos

El sistema compara la entrada registrada con el horario vigente. Si existe retraso, calcula minutos y los acumula mensualmente.

### Justificativos

El administrador puede aprobar un justificativo y ajustar el horario valido de un dia especifico. Toda modificacion debe quedar auditada.

## Parametros salariales

Todos los funcionarios comparten la configuracion institucional:

- Haber basico.
- Descuentos de ley.
- Tabla de descuentos por retraso acumulado.

Ejemplo de tabla:

| Minutos acumulados | Descuento |
| --- | ---: |
| 0 a 15 | 0 Bs |
| 16 a 30 | 30 Bs |
| 31 a 45 | 70 Bs |
| 46 a 60 | 120 Bs |
| 61 a 90 | 180 Bs |

## Versionado de configuracion

Cada configuracion debe guardarse como una version con fecha de inicio y fecha de finalizacion. Cada asistencia queda asociada a la version vigente para que los reportes historicos no cambien cuando se actualicen reglas o salarios.

## Reportes

### Hoja 1

Formato similar a la planilla institucional:

- Fecha.
- Nombre.
- Cargo.
- Hora de entrada.
- Hora de salida.
- Firma.
- Retrasos.

### Hoja 2

Resumen mensual:

- Nombre.
- CI.
- Cargo.
- Mes.
- Haber basico.
- Descuentos de ley.
- Liquido antes de descuentos.
- Minutos acumulados de retraso.
- Descuento aplicado.
- Liquido estimado.
- Observaciones.
- Justificaciones del mes.

## Estadisticas esperadas

- Funcionarios presentes.
- Funcionarios ausentes.
- Funcionarios con retraso.
- Total de retrasos del mes.
- Minutos acumulados.
- Calendario de asistencias.
- Tendencia mensual.
- Estadisticas individuales.

## Auditoria

Toda modificacion administrativa debe registrar:

- Usuario administrador.
- Fecha y hora.
- Registro modificado.
- Valor anterior.
- Valor nuevo.
- Motivo del cambio.

Ninguna modificacion debe eliminar informacion historica.

## Seguridad

- Hora tomada exclusivamente desde el servidor.
- Registro GPS con precision.
- Fotografia obligatoria en cada marcacion.
- Compresion de imagenes para optimizar almacenamiento.
- Control de acceso por roles.
- Proteccion de fotografias y datos personales.
- Auditoria completa de cambios.

## Tecnologias

- Frontend: React + Vite.
- Backend: Node.js + Express + TypeScript.
- Base de datos: PostgreSQL.
- ORM: Prisma.
- Imagenes: Sharp, pendiente de integrar.
- Mapas: Leaflet con OpenStreetMap, pendiente de integrar.
- Reportes: ExcelJS y PDF, pendiente de integrar.

## Resultado esperado

Una plataforma web moderna, rapida y responsiva donde los funcionarios registren entrada y salida desde cualquier navegador, y el administrador gestione horarios, excepciones, justificativos, configuraciones y reportes mensuales con calculos consistentes.
