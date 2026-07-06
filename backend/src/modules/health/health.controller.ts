import { Request, Response } from 'express';

export function getHealthStatus(_req: Request, res: Response) {
  res.status(200).json({
    status: 'ok',
    service: 'backend',
    timestamp: new Date().toISOString(),
  });
}