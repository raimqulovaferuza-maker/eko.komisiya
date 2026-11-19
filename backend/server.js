import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import db, { closeDatabase } from './db.js';
import authRoutes from './routes/auth.js';
import schoolsRoutes from './routes/schools.js';
import usersRoutes from './routes/users.js';
import behaviorRoutes from './routes/behavior.js';
import profileRoutes from './routes/profile.js';
import { createRateLimiter, securityHeaders } from './utils/ddosGuard.js';
import { uploadsDir } from './utils/uploads.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDir = path.resolve(__dirname, '../frontend');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.disable('x-powered-by');
app.set('trust proxy', 1);

// Global security headers & configurable CORS for production hosting
const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean)
  : null;

app.use(securityHeaders);
app.use(
  cors(
    corsOrigins && corsOrigins.length > 0
      ? { origin: corsOrigins, credentials: true }
      : undefined
  )
);

// Allow larger JSON body (6MB) strictly for image/event/avatar upload routes; enforce 64KB cap elsewhere
const uploadJsonParser = express.json({ limit: '6mb' });
const strictJsonParser = express.json({ limit: '64kb' });

app.use((req, res, next) => {
  const isImageUploadRoute =
    req.method === 'POST' &&
    (req.path === '/api/schools' ||
      req.path === '/api/profile/avatar' ||
      /^\/api\/schools\/\d+\/(image|events)$/.test(req.path));

  if (isImageUploadRoute) {
    return uploadJsonParser(req, res, next);
  }
  return strictJsonParser(req, res, next);
});

// Global DDoS / rate-limit guard for API endpoints
const apiRateLimiter = createRateLimiter({
  windowMs: 60_000,
  maxRequests: 150,
  blockDurationMs: 60_000,
  message: "So'rovlar soni juda ko'paydi (DDoS Guard). Birozdan so'ng qayta urining.",
});

// Health check with live SQLite verification for Docker / load balancers
app.get('/api/health', (_req, res) => {
  try {
    db.prepare('SELECT 1 AS ok').get();
    return res.json({
      ok: true,
      service: 'eko-komissiya',
      environment: process.env.NODE_ENV || 'development',
      uptimeSeconds: Math.round(process.uptime()),
      db: 'connected',
      ddosGuard: apiRateLimiter.getStats(),
    });
  } catch {
    return res.status(503).json({ ok: false, db: 'error' });
  }
});

// REST API routes protected by DDoS guard
app.use('/api', apiRateLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/schools', schoolsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/behavior', behaviorRoutes);
app.use('/api/profile', profileRoutes);

// API 404 handler
app.use('/api', (_req, res) => {
  res.status(404).json({ error: "API yo'nalishi topilmadi." });
});

// Serve uploaded images safely
app.use('/uploads', express.static(uploadsDir, { maxAge: '7d' }));

// Serve static frontend HTML/CSS/JS files
app.use(
  express.static(frontendDir, {
    extensions: ['html'],
    maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0,
  })
);

app.get('/', (_req, res) => {
  res.sendFile(path.join(frontendDir, 'index.html'));
});

// Global error handler
app.use((err, _req, res, _next) => {
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: "Yuklangan fayl yoki so'rov hajmi chegaradan oshib ketdi." });
  }
  console.error('Server xatoligi:', err);
  return res.status(500).json({ error: 'Serverda kutilmagan xatolik yuz berdi.' });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Eko Komisiya serveri http://0.0.0.0:${PORT} manzilida ishga tushdi`);
});

function handleShutdown(signal) {
  console.log(`${signal} qabul qilindi. Server xavfsiz yopilmoqda...`);
  server.close(() => {
    closeDatabase();
    process.exit(0);
  });
  setTimeout(() => {
    closeDatabase();
    process.exit(1);
  }, 5000).unref();
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

export default app;
