import express from 'express';
import bcrypt from 'bcryptjs';
import db from '../db.js';
import { authenticateToken, requireAdmin } from './auth.js';
import { sanitizeUser, validateUserInput } from '../utils/scoring.js';

const router = express.Router();

// Registration requests queue (Admin only)
router.get('/requests', authenticateToken, requireAdmin, (_req, res) => {
  const rows = db
    .prepare(`
      SELECT
        rr.id,
        rr.username,
        rr.full_name,
        rr.requested_role,
        rr.note,
        rr.status,
        rr.created_at,
        rr.reviewed_at,
        rev.username AS reviewed_by_username,
        rev.full_name AS reviewed_by_name
      FROM registration_requests rr
      LEFT JOIN users rev ON rev.id = rr.reviewed_by
      ORDER BY CASE WHEN rr.status = 'pending' THEN 0 ELSE 1 END, rr.id DESC
    `)
    .all();

  return res.json({
    requests: rows.map((row) => ({
      id: row.id,
      username: row.username,
      fullName: row.full_name,
      requestedRole: row.requested_role === 'admin' ? 'admin' : 'user',
      note: row.note || '',
      status: row.status,
      reviewedByName: row.reviewed_by_name || '',
      reviewedByUsername: row.reviewed_by_username || '',
      createdAt: row.created_at,
      reviewedAt: row.reviewed_at,
    })),
  });
});

router.post('/requests/:id/approve', authenticateToken, requireAdmin, (req, res) => {
  const reqId = Number(req.params.id);
  if (!Number.isInteger(reqId) || reqId <= 0) {
    return res.status(400).json({ error: "Noto'g'ri ariza identifikatori." });
  }

  const appRow = db.prepare('SELECT * FROM registration_requests WHERE id = ?').get(reqId);
  if (!appRow) {
    return res.status(404).json({ error: 'Ariza topilmadi.' });
  }
  if (appRow.status !== 'pending') {
    return res.status(400).json({ error: "Ushbu ariza allaqachon ko'rib chiqilgan." });
  }

  const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get(appRow.username);
  if (existingUser) {
    return res.status(409).json({
      error: `"${appRow.username}" logini bilan foydalanuvchi allaqachon mavjud.`,
    });
  }

  const assignedRole = appRow.requested_role === 'admin' ? 'admin' : 'user';

  const approveTx = db.transaction(() => {
    const insertRes = db
      .prepare('INSERT INTO users (username, full_name, password_hash, role) VALUES (?, ?, ?, ?)')
      .run(appRow.username, appRow.full_name, appRow.password_hash, assignedRole);

    db.prepare(
      "UPDATE registration_requests SET status = 'approved', reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ?"
    ).run(req.user.id, reqId);

    return insertRes.lastInsertRowid;
  });

  const newUserId = approveTx();
  const createdRow = db
    .prepare(
      'SELECT id, username, full_name, role, school_id, avatar_url, bio, phone, is_active, created_at FROM users WHERE id = ?'
    )
    .get(newUserId);

  return res.status(201).json({
    message:
      assignedRole === 'admin'
        ? `"${appRow.full_name}" (${appRow.username}) administrator sifatida tasdiqlandi.`
        : `"${appRow.full_name}" (${appRow.username}) arizasi qabul qilindi.`,
    user: sanitizeUser(createdRow),
  });
});

router.post('/requests/:id/reject', authenticateToken, requireAdmin, (req, res) => {
  const reqId = Number(req.params.id);
  if (!Number.isInteger(reqId) || reqId <= 0) {
    return res.status(400).json({ error: "Noto'g'ri ariza identifikatori." });
  }

  const appRow = db
    .prepare('SELECT id, username, full_name, status FROM registration_requests WHERE id = ?')
    .get(reqId);
  if (!appRow) {
    return res.status(404).json({ error: 'Ariza topilmadi.' });
  }
  if (appRow.status !== 'pending') {
    return res.status(400).json({ error: "Ushbu ariza allaqachon ko'rib chiqilgan." });
  }

  db.prepare(
    "UPDATE registration_requests SET status = 'rejected', reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ?"
  ).run(req.user.id, reqId);

  return res.json({
    message: `"${appRow.full_name}" (${appRow.username}) arizasi rad etildi.`,
  });
});

router.get('/', authenticateToken, requireAdmin, (_req, res) => {
  const rows = db
    .prepare(`
      SELECT
        u.id,
        u.username,
        u.full_name,
        u.role,
        u.school_id,
        u.avatar_url,
        u.bio,
        u.phone,
        u.is_active,
        s.name AS school_name,
        u.created_at,
        COUNT(r.id) AS ratings_count
      FROM users u
      LEFT JOIN schools s ON s.id = u.school_id
      LEFT JOIN ratings r ON r.user_id = u.id
      GROUP BY u.id
      ORDER BY u.id ASC
    `)
    .all();

  return res.json({
    users: rows.map(sanitizeUser),
  });
});

router.post('/', authenticateToken, requireAdmin, (req, res) => {
  const check = validateUserInput(req.body);
  if (!check.valid) {
    return res.status(400).json({ error: check.error });
  }

  const { username, password, fullName, role, schoolId } = check.data;
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.status(409).json({ error: `"${username}" logini allaqachon band.` });
  }

  if (role === 'director' && schoolId !== null) {
    const school = db.prepare('SELECT id FROM schools WHERE id = ?').get(schoolId);
    if (!school) {
      return res.status(404).json({ error: 'Tanlangan maktab topilmadi.' });
    }
  }

  const passwordHash = bcrypt.hashSync(password, 10);

  const createTx = db.transaction(() => {
    if (role === 'director' && schoolId !== null) {
      db.prepare("UPDATE users SET school_id = NULL WHERE school_id = ? AND role = 'director'").run(
        schoolId
      );
    }

    const result = db
      .prepare(
        'INSERT INTO users (username, full_name, password_hash, role, school_id) VALUES (?, ?, ?, ?, ?)'
      )
      .run(username, fullName, passwordHash, role, schoolId);

    return result.lastInsertRowid;
  });

  const newUserId = createTx();

  const createdRow = db
    .prepare(`
      SELECT u.id, u.username, u.full_name, u.role, u.school_id, u.avatar_url, u.bio, u.phone, u.is_active, s.name AS school_name, u.created_at
      FROM users u
      LEFT JOIN schools s ON s.id = u.school_id
      WHERE u.id = ?
    `)
    .get(newUserId);

  return res.status(201).json({
    message: `Yangi akkaunt (${username}) muvaffaqiyatli yaratildi.`,
    user: sanitizeUser(createdRow),
  });
});

router.delete('/:id', authenticateToken, requireAdmin, (req, res) => {
  const targetId = Number(req.params.id);
  if (!Number.isInteger(targetId) || targetId <= 0) {
    return res.status(400).json({ error: "Noto'g'ri foydalanuvchi identifikatori." });
  }

  if (targetId === req.user.id) {
    return res.status(400).json({ error: "O'zingizning joriy akkauntingizni o'chirib bo'lmaydi." });
  }

  const existing = db.prepare('SELECT id, username, role FROM users WHERE id = ?').get(targetId);
  if (!existing) {
    return res.status(404).json({ error: 'Foydalanuvchi topilmadi.' });
  }

  if (existing.username === 'bexruz') {
    return res.status(403).json({ error: "Asosiy bosh administrator akkauntini o'chirib bo'lmaydi." });
  }

  if (existing.role === 'admin' && req.user.username !== 'bexruz') {
    return res.status(403).json({
      error: "Boshqa administratorni faqat asosiy administrator (bexruz) o'chirishi mumkin.",
    });
  }

  db.prepare('DELETE FROM users WHERE id = ?').run(targetId);
  return res.json({
    message: `"${existing.username}" akkaunti o'chirildi.`,
    deletedId: targetId,
  });
});

export default router;
