import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import attendanceRoutes from './routes/attendance.js';
import auditRoutes from './routes/audit.js';
import authRoutes from './routes/auth.js';
import configurationRoutes from './routes/configuration.js';
import employeeRoutes from './routes/employees.js';
import healthRoutes from './routes/health.js';
import holidayRoutes from './routes/holidays.js';

dotenv.config();

const app = express();
const allowedOrigins = (process.env.CORS_ORIGIN ?? '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error('Origen no permitido por CORS'));
    },
  }),
);
app.use(morgan('dev'));
app.use(express.json({ limit: '5mb' }));
app.use(
  '/uploads',
  express.static(path.join(process.cwd(), 'uploads'), {
    dotfiles: 'deny',
    fallthrough: false,
    index: false,
    maxAge: '1h',
  }),
);

app.use('/api', healthRoutes);
app.use('/api', authRoutes);
app.use('/api', employeeRoutes);
app.use('/api', attendanceRoutes);
app.use('/api', auditRoutes);
app.use('/api', configurationRoutes);
app.use('/api', holidayRoutes);

// Servir archivos estáticos del frontend en producción
if (process.env.NODE_ENV === 'production') {
  const frontendPath = fs.existsSync(path.join(process.cwd(), 'frontend/dist'))
    ? path.join(process.cwd(), 'frontend/dist')
    : path.join(process.cwd(), '../frontend/dist');

  if (fs.existsSync(frontendPath)) {
    app.use(express.static(frontendPath));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
        return next();
      }
      res.sendFile(path.join(frontendPath, 'index.html'));
    });
  }
}

app.use((_req, res) => {
  res.status(404).json({
    message: 'Ruta no encontrada',
  });
});

app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error);
  res.status(500).json({
    message: 'Error interno del servidor',
  });
});

export default app;
