// SSE (Server-Sent Events) broadcast manager for real-time attendance updates
// Clients connect to GET /api/attendances/live and receive push events

import { Response } from 'express';

interface SseClient {
  id: string;
  res: Response;
}

const clients = new Map<string, SseClient>();

export function addSseClient(id: string, res: Response) {
  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
  res.flushHeaders();

  // Send initial heartbeat
  res.write(`data: {"type":"connected"}\n\n`);

  clients.set(id, { id, res });

  // Remove client on disconnect
  res.on('close', () => {
    clients.delete(id);
  });
}

export function broadcastAttendanceUpdate(payload: Record<string, unknown>) {
  const message = `data: ${JSON.stringify({ type: 'attendance_update', payload })}\n\n`;
  for (const client of clients.values()) {
    try {
      client.res.write(message);
    } catch {
      clients.delete(client.id);
    }
  }
}

// Periodic heartbeat to keep connections alive (every 30s)
setInterval(() => {
  const heartbeat = `data: {"type":"heartbeat"}\n\n`;
  for (const client of clients.values()) {
    try {
      client.res.write(heartbeat);
    } catch {
      clients.delete(client.id);
    }
  }
}, 30000);
