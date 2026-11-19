import express from 'express';
import db from '../db.js';
import { authenticateToken } from './auth.js';
import { validateBehaviorInput } from '../utils/scoring.js';

const router = express.Router();

function formatBehaviorRow(row) {
  return {
    id: row.id,
    schoolId: row.school_id,
    schoolName: row.school_name || '',
    schoolDistrict: row.school_district || '',
    personName: row.person_name,
    personType: row.person_type,
    classOrSubject: row.class_or_subject || '',
    behaviorStatus: row.behavior_status,
    ecoScore: Number(row.eco_score),
    note: row.note || '',
    recordedBy: row.recorded_by,
    recordedByName: row.recorded_by_name || 'Komissiya',
    recordedByRole: row.recorded_by_role || 'user',
    recordedAt: row.recorded_at,
    createdAt: row.created_at,
  };
}

function canEditBehaviorRecord(user, record) {
  if (!user || !record) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'director' && Number(user.schoolId) === Number(record.school_id)) return true;
  return Number(record.recorded_by) === Number(user.id);
}

router.get('/', authenticateToken, (req, res) => {
  const schoolId = req.query.schoolId && req.query.schoolId !== 'all' ? Number(req.query.schoolId) : null;
  const personType =
    req.query.personType === 'teacher' || req.query.personType === 'student'
      ? req.query.personType
      : '';
  const status =
    typeof req.query.status === 'string' && req.query.status !== 'all' ? req.query.status.trim() : '';
  const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';

  const rows = db
    .prepare(`
      SELECT
        b.*,
        s.name AS school_name,
        s.district AS school_district,
        u.full_name AS recorded_by_name,
        u.role AS recorded_by_role
      FROM behavior_records b
      JOIN schools s ON s.id = b.school_id
      LEFT JOIN users u ON u.id = b.recorded_by
      ORDER BY b.recorded_at DESC, b.id DESC
    `)
    .all();

  const allRecords = rows.map((row) => ({
    ...formatBehaviorRow(row),
    canEdit: canEditBehaviorRecord(req.user, row),
  }));

  const filtered = allRecords.filter((rec) => {
    if (schoolId && rec.schoolId !== schoolId) return false;
    if (personType && rec.personType !== personType) return false;
    if (status && rec.behaviorStatus !== status) return false;
    if (
      search &&
      !rec.personName.toLowerCase().includes(search) &&
      !rec.classOrSubject.toLowerCase().includes(search) &&
      !rec.schoolName.toLowerCase().includes(search) &&
      !rec.note.toLowerCase().includes(search)
    ) {
      return false;
    }
    return true;
  });

  const teacherCount = allRecords.filter((r) => r.personType === 'teacher').length;
  const studentCount = allRecords.filter((r) => r.personType === 'student').length;
  const avgScore =
    allRecords.length > 0
      ? Math.round((allRecords.reduce((s, r) => s + r.ecoScore, 0) / allRecords.length) * 100) / 100
      : 0;

  return res.json({
    records: filtered,
    summary: {
      totalRecords: allRecords.length,
      teacherCount,
      studentCount,
      avgScore,
    },
  });
});

router.post('/', authenticateToken, (req, res) => {
  const payload = { ...req.body };
  if (req.user.role === 'director' && req.user.schoolId) {
    if (payload.schoolId && Number(payload.schoolId) !== Number(req.user.schoolId)) {
      return res.status(403).json({
        error: "Direktor faqat o'ziga biriktirilgan maktab uchun xulq-atvor yozuvi qo'sha oladi.",
      });
    }
    payload.schoolId = req.user.schoolId;
  }

  const check = validateBehaviorInput(payload);
  if (!check.valid) {
    return res.status(400).json({ error: check.error });
  }

  const { schoolId, personName, personType, classOrSubject, behaviorStatus, ecoScore, note, recordedAt } =
    check.data;

  const school = db.prepare('SELECT id, name FROM schools WHERE id = ?').get(schoolId);
  if (!school) {
    return res.status(404).json({ error: 'Tanlangan maktab topilmadi.' });
  }

  const insertRes = db
    .prepare(`
      INSERT INTO behavior_records (
        school_id, person_name, person_type, class_or_subject,
        behavior_status, eco_score, note, recorded_by, recorded_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(schoolId, personName, personType, classOrSubject, behaviorStatus, ecoScore, note, req.user.id, recordedAt);

  const createdRow = db
    .prepare(`
      SELECT
        b.*,
        s.name AS school_name,
        s.district AS school_district,
        u.full_name AS recorded_by_name,
        u.role AS recorded_by_role
      FROM behavior_records b
      JOIN schools s ON s.id = b.school_id
      LEFT JOIN users u ON u.id = b.recorded_by
      WHERE b.id = ?
    `)
    .get(insertRes.lastInsertRowid);

  return res.status(201).json({
    message: `${personType === 'teacher' ? 'Ustoz' : "O'quvchi"} (${personName}) xulq-atvori saqlandi.`,
    record: {
      ...formatBehaviorRow(createdRow),
      canEdit: true,
    },
  });
});

router.patch('/:id', authenticateToken, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Noto'g'ri yozuv identifikatori." });
  }

  const existing = db.prepare('SELECT * FROM behavior_records WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ error: 'Xulq-atvor yozuvi topilmadi.' });
  }

  if (!canEditBehaviorRecord(req.user, existing)) {
    return res.status(403).json({ error: "Bu yozuvni tahrirlashga ruxsatingiz yo'q." });
  }

  const merged = {
    schoolId: existing.school_id,
    personName: req.body?.personName ?? existing.person_name,
    personType: req.body?.personType ?? existing.person_type,
    classOrSubject: req.body?.classOrSubject ?? existing.class_or_subject,
    behaviorStatus: req.body?.behaviorStatus ?? existing.behavior_status,
    ecoScore: req.body?.ecoScore ?? existing.eco_score,
    note: req.body?.note ?? existing.note,
    recordedAt: req.body?.recordedAt ?? existing.recorded_at,
  };

  const check = validateBehaviorInput(merged);
  if (!check.valid) {
    return res.status(400).json({ error: check.error });
  }

  const { personName, personType, classOrSubject, behaviorStatus, ecoScore, note, recordedAt } = check.data;
  db.prepare(`
    UPDATE behavior_records
    SET person_name = ?, person_type = ?, class_or_subject = ?,
        behavior_status = ?, eco_score = ?, note = ?, recorded_at = ?
    WHERE id = ?
  `).run(personName, personType, classOrSubject, behaviorStatus, ecoScore, note, recordedAt, id);

  return res.json({
    message: `"${personName}" xulq-atvor ma'lumoti yangilandi.`,
  });
});

router.delete('/:id', authenticateToken, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "Noto'g'ri yozuv identifikatori." });
  }

  const existing = db.prepare('SELECT * FROM behavior_records WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ error: 'Xulq-atvor yozuvi topilmadi.' });
  }

  if (!canEditBehaviorRecord(req.user, existing)) {
    return res.status(403).json({ error: "Bu yozuvni o'chirishga ruxsatingiz yo'q." });
  }

  db.prepare('DELETE FROM behavior_records WHERE id = ?').run(id);
  return res.json({
    message: `"${existing.person_name}" xulq-atvor yozuvi o'chirildi.`,
    deletedId: id,
  });
});

export default router;
