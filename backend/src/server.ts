// CRITICAL: Set timezone to UTC BEFORE any imports
// This ensures Prisma reads 'timestamp without time zone' columns correctly
// regardless of the server's local timezone (Alwaysdata uses Europe/Paris)
process.env.TZ = 'UTC';

import dotenv from 'dotenv';
import app from './app.js';

dotenv.config();

const port = Number(process.env.PORT || 4000);

app.listen(port, () => {
  console.log(`Backend running on port ${port} [TZ: ${process.env.TZ}]`);
});