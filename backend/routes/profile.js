import express from 'express';
import bcrypt from 'bcryptjs';
import db from '../db.js';
import { authenticateToken, USER_WITH_SCHOOL_SQL } from './auth.js';
import { sanitizeUser, validateProfileUpdateInput } from '../utils/scoring.js';
import { isValidImageUrlInput, saveUploadedImage } from '../utils/uploads.js';

const router = express.Router();

function loadFullProfile(userId) {
  const row = db.prepare(`${USER_WITH_SCHOOL_SQL} WHERE u.id = ?`).get(userId);
  if (!row) return null;

  const ratingsCount = db
    .prepare('SELECT COUNT(*) AS count FROM ratings WHERE user_id = ?')
    .get(userId).count;
  const behaviorCount = db
    .prepare('SELECT COUNT(*) AS count FROM behavior_records WHERE recorded_by = ?')
    .get(userId).count;

  const recentRatings = db
    .prepare(`
      SELECT r.id, r.rating, r.comment, r.created_at, s.id AS school_id, s.name AS school_name, s.district
      FROM ratings r
      JOIN schools s ON s.id = r.school_id
      WHERE r.user_id = ?
      ORDER BY r.id DESC
      LIMIT 6
    `)
    .all(userId);

  const recentBehaviors = db
    .prepare(`
      SELECT b.id, b.person_name, b.person_type, b.behavior_status, b.eco_score, b.recorded_at, s.name AS school_name
      FROM behavior_records b
      JOIN schools s ON s.id = b.school_id
      WHERE b.recorded_by = ?
      ORDER BY b.id DESC
      LIMIT 6
    `)
    .all(userId);

  return {
    user: sanitizeUser({ ...row, ratings_count: ratingsCount }),
    stats: {
      ratingsCount,
      behaviorCount,
    },
    recentRatings: recentRatings.map((r) => ({
      id: r.id,
      schoolId: r.school_id,
      schoolName: r.school_name,
      district: r.district,
      rating: r.rating,
      comment: r.comment || '',
      createdAt: r.created_at,
    })),
    recentBehaviors: recentBehaviors.map((b) => ({
      id: b.id,
      personName: b.person_name,
      personType: b.person_type,
      behaviorStatus: b.behavior_status,
      ecoScore: b.eco_score,
      recordedAt: b.recorded_at,
      schoolName: b.school_name,
    })),
  };
}

router.get('/', authenticateToken, (req, res) => {
  const profile = loadFullProfile(req.user.id);
  if (!profile) {
    return res.status(404).json({ error: 'Profil topilmadi.' });
  }
  return res.json(profile);
});

router.patch('/', authenticateToken, (req, res) => {
  const check = validateProfileUpdateInput(req.body);
  if (!check.valid) {
    return res.status(400).json({ error: check.error });
  }

  const { fullName, phone, bio, currentPassword, newPassword } = check.data;
  const userRow = db.prepare('SELECT id, password_hash FROM users WHERE id = ?').get(req.user.id);
  if (!userRow) {
    return res.status(404).json({ error: 'Foydalanuvchi topilmadi.' });
  }

  if (newPassword) {
    if (!bcrypt.compareSync(currentPassword, userRow.password_hash)) {
      return res.status(400).json({ error: "Joriy parol noto'g'ri kiritildi." });
    }
    const newHash = bcrypt.hashSync(newPassword, 10);
    db.prepare('UPDATE users SET full_name = ?, phone = ?, bio = ?, password_hash = ? WHERE id = ?').run(
      fullName,
      phone,
      bio,
      newHash,
      req.user.id
    );
  } else {
    db.prepare('UPDATE users SET full_name = ?, phone = ?, bio = ? WHERE id = ?').run(
      fullName,
      phone,
      bio,
      req.user.id
    );
  }

  const updated = loadFullProfile(req.user.id);
  return res.json({
    message: "Profil ma'lumotlari saqlandi.",
    ...updated,
  });
});

router.post('/avatar', authenticateToken, (req, res) => {
  let nextAvatarUrl = '';
  if (req.body?.imageDataUrl) {
    const saved = saveUploadedImage(req.body.imageDataUrl, `avatar-${req.user.id}`);
    if (!saved.valid) {
      return res.status(400).json({ error: saved.error });
    }
    nextAvatarUrl = saved.url;
  } else if (req.body?.imageUrl && isValidImageUrlInput(req.body.imageUrl)) {
    nextAvatarUrl = req.body.imageUrl.trim();
  } else {
    return res.status(400).json({ error: 'Rasm fayli yoki yaroqli rasm havolasi tanlanmadi.' });
  }

  db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').run(nextAvatarUrl, req.user.id);
  const updated = loadFullProfile(req.user.id);
  return res.json({
    message: 'Profil surati muvaffaqiyatli yangilandi.',
    ...updated,
  });
});

router.delete('/avatar', authenticateToken, (req, res) => {
  db.prepare("UPDATE users SET avatar_url = '' WHERE id = ?").run(req.user.id);
  const updated = loadFullProfile(req.user.id);
  return res.json({
    message: "Profil surati o'chirildi.",
    ...updated,
  });
});

export default router;
