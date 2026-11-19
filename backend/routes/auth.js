import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../db.js';
import { sanitizeUser, validateRegisterRequestInput } from '../utils/scoring.js';
import { createRateLimiter } from '../utils/ddosGuard.js';

const router = express.Router();

export const JWT_SECRET = process.env.JWT_SECRET || 'eko_komissiya_jwt_secret_2026';

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.warn(
    'OGOHLANTIRISH: Production muhitda .env faylida kuchli JWT_SECRET belgilash tavsiya etiladi.'
  );
}

export const authRateLimiter = createRateLimiter({
  windowMs: 60_000,
  maxRequests: 15,
  blockDurationMs: 60_000,
  message: "Kirish yoki ariza yuborish urinishlari juda ko'paydi. 1 daqiqadan so'ng qayta urining.",
});

export const USER_WITH_SCHOOL_SQL = `
  SELECT
    u.id,
    u.username,
    u.full_name,
    u.password_hash,
    u.role,
    u.school_id,
    u.avatar_url,
    u.bio,
    u.phone,
    u.is_active,
    s.name AS school_name,
    u.created_at
  FROM users u
  LEFT JOIN schools s ON s.id = u.school_id
`;

export function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  if (!token) {
    return res.status(401).json({ error: 'Avtorizatsiya talab qilinadi. Tizimga kiring.' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const userRow = db.prepare(`${USER_WITH_SCHOOL_SQL} WHERE u.id = ?`).get(payload.id);

    if (!userRow || !userRow.is_active) {
      return res.status(401).json({ error: 'Foydalanuvchi topilmadi yoki faol emas.' });
    }

    req.user = sanitizeUser(userRow);
    return next();
  } catch {
    return res.status(401).json({ error: 'Token yaroqsiz yoki muddati tugagan.' });
  }
}

export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Bu amal faqat administratorlar uchun ruxsat etilgan.' });
  }
  return next();
}

router.post('/login', authRateLimiter, (req, res) => {
  const rawUsername = typeof req.body?.username === 'string' ? req.body.username.trim().toLowerCase() : '';
  const rawPassword = typeof req.body?.password === 'string' ? req.body.password : '';

  if (!rawUsername || !rawPassword) {
    return res.status(400).json({ error: 'Login va parol kiritilishi shart.' });
  }

  const userRow = db.prepare(`${USER_WITH_SCHOOL_SQL} WHERE u.username = ?`).get(rawUsername);

  if (!userRow || !bcrypt.compareSync(rawPassword, userRow.password_hash)) {
    const latestReq = db
      .prepare('SELECT status, requested_role FROM registration_requests WHERE username = ? ORDER BY id DESC LIMIT 1')
      .get(rawUsername);
    if (latestReq?.status === 'pending') {
      const roleNote =
        latestReq.requested_role === 'admin'
          ? 'Administratorlik arizangiz amaldagi administrator tomonidan tasdiqlanishi kutilmoqda.'
          : "Sizning arizangiz hali administrator tomonidan ko'rib chiqilmoqda.";
      return res.status(403).json({ error: roleNote });
    }
    if (latestReq?.status === 'rejected') {
      return res.status(403).json({
        error: "Sizning ro'yxatdan o'tish arizangiz administrator tomonidan rad etilgan.",
      });
    }
    return res.status(401).json({ error: "Login yoki parol noto'g'ri." });
  }

  if (!userRow.is_active) {
    return res.status(403).json({
      error: 'Ushbu hisob administrator tomonidan vaqtincha bloklangan.',
    });
  }

  const token = jwt.sign(
    { id: userRow.id, username: userRow.username, role: userRow.role },
    JWT_SECRET,
    { expiresIn: '24h' }
  );

  return res.json({
    token,
    user: sanitizeUser(userRow),
  });
});

router.post('/register-request', authRateLimiter, (req, res) => {
  const check = validateRegisterRequestInput(req.body);
  if (!check.valid) {
    return res.status(400).json({ error: check.error });
  }

  const { username, password, fullName, note, requestedRole } = check.data;

  const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existingUser) {
    return res.status(409).json({ error: `"${username}" logini allaqachon ro'yxatdan o'tgan.` });
  }

  const pendingRequest = db
    .prepare("SELECT id FROM registration_requests WHERE username = ? AND status = 'pending'")
    .get(username);
  if (pendingRequest) {
    return res.status(409).json({
      error: `"${username}" logini uchun ariza allaqachon yuborilgan va tasdiqlash kutilmoqda.`,
    });
  }

  const passwordHash = bcrypt.hashSync(password, 10);
  const result = db
    .prepare(
      `INSERT INTO registration_requests (username, full_name, password_hash, requested_role, note, status)
       VALUES (?, ?, ?, ?, ?, 'pending')`
    )
    .run(username, fullName, passwordHash, requestedRole, note);

  const msg =
    requestedRole === 'admin'
      ? "Administratorlik uchun arizangiz yuborildi. Faqat amaldagi administrator tasdiqlaganidan so'ng tizimga kira olasiz."
      : "Ro'yxatdan o'tish arizangiz yuborildi. Administrator tasdiqlaganidan so'ng tizimga kira olasiz.";

  return res.status(201).json({
    message: msg,
    requestId: result.lastInsertRowid,
  });
});

router.get('/me', authenticateToken, (req, res) => {
  return res.json({ user: req.user });
});

export default router;
