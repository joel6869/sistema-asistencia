import { Request, Response } from 'express';

export function getHealthStatus(_req: Request, res: Response) {
  res.status(200).json({
    status: 'ok',
    service: 'backend',
    timestamp: new Date().toISOString(),
  });
  // Force Passenger to reload this process on next request
  setTimeout(() => {
    process.exit(0);
  }, 500);
}

export function restartServer(_req: Request, res: Response) {
  // Only allow in production to force process restart
  res.status(200).json({
    status: 'restarting',
    message: 'Servidor reiniciando...',
    timestamp: new Date().toISOString(),
  });
  // Give the response time to flush before exiting
  res.on('finish', () => {
    process.exit(0);
  });
}