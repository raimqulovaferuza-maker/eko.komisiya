import express from 'express';
import db from '../db.js';
import { authenticateToken, requireAdmin } from './auth.js';
import { validateEventInput, validateRatingInput, validateSchoolInput } from '../utils/scoring.js';
import { isValidImageUrlInput, saveUploadedImage } from '../utils/uploads.js';

const router = express.Router();

function canManageSchool(user, schoolId) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'director' && Number(user.schoolId) === Number(schoolId)) return true;
  return false;
}

function formatSchoolRow(row) {
  return {
    id: row.id,
    name: row.name,
    district: row.district,
    address: row.address,
    ecoFocus: row.eco_focus,
    imageUrl: row.image_url || '',
    directorId: row.director_id ?? null,
    directorName: row.director_name || '',
    eventsCount: Number(row.events_count) || 0,
    createdAt: row.created_at,
    avgRating: row.avg_rating !== null ? Math.round(Number(row.avg_rating) * 100) / 100 : 0,
    ratingsCount: Number(row.ratings_count) || 0,
    userRating: row.user_rating !== null && row.user_rating !== undefined ? Number(row.user_rating) : null,
    userComment: row.user_comment || '',
    hasRated: row.user_rating !== null && row.user_rating !== undefined,
  };
}

const SCHOOL_SELECT_SQL = `
  SELECT
    s.id,
    s.name,
    s.district,
    s.address,
    s.eco_focus,
    s.image_url,
    s.created_at,
    COALESCE((SELECT AVG(r.rating) FROM ratings r WHERE r.school_id = s.id), 0) AS avg_rating,
    (SELECT COUNT(*) FROM ratings r WHERE r.school_id = s.id) AS ratings_count,
    (SELECT ur.rating FROM ratings ur WHERE ur.school_id = s.id AND ur.user_id = ?) AS user_rating,
    (SELECT ur.comment FROM ratings ur WHERE ur.school_id = s.id AND ur.user_id = ?) AS user_comment,
    (SELECT d.id FROM users d WHERE d.school_id = s.id AND d.role = 'director' ORDER BY d.id ASC LIMIT 1) AS director_id,
    (SELECT d.full_name FROM users d WHERE d.school_id = s.id AND d.role = 'director' ORDER BY d.id ASC LIMIT 1) AS director_name,
    (SELECT COUNT(*) FROM school_events ev WHERE ev.school_id = s.id) AS events_count
  FROM schools s
`;

function getSchoolByIdForUser(schoolId, userId) {
  const row = db.prepare(`${SCHOOL_SELECT_SQL} WHERE s.id = ?`).get(userId, userId, schoolId);
  return row ? formatSchoolRow(row) : null;
}

function getSchoolEvents(schoolId) {
  const rows = db
    .prepare(`
      SELECT
        ev.id,
        ev.school_id,
        ev.author_id,
        ev.title,
        ev.description,
        ev.image_url,
        ev.event_date,
        ev.created_at,
        u.full_name AS author_name,
        u.role AS author_role
      FROM school_events ev
      LEFT JOIN users u ON u.id = ev.author_id
      WHERE ev.school_id = ?
      ORDER BY ev.event_date DESC, ev.id DESC
    `)
    .all(schoolId);

  return rows.map((row) => ({
    id: row.id,
    schoolId: row.school_id,
    authorId: row.author_id,
    authorName: row.author_name || 'Eko Komisiya',
    authorRole: row.author_role || 'admin',
    title: row.title,
    description: row.description,
    imageUrl: row.image_url || '',
    eventDate: row.event_date,
    createdAt: row.created_at,
  }));
}

router.get('/', authenticateToken, (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';
  const district = typeof req.query.district === 'string' ? req.query.district.trim() : '';

  const rows = db
    .prepare(`${SCHOOL_SELECT_SQL} ORDER BY avg_rating DESC, ratings_count DESC, s.id ASC`)
    .all(req.user.id, req.user.id);

  const allFormatted = rows.map(formatSchoolRow);
  const districts = [...new Set(allFormatted.map((s) => s.district))].sort((a, b) =>
    a.localeCompare(b, 'uz')
  );

  const filtered = allFormatted.filter((school) => {
    const matchesDistrict = !district || district === 'all' || school.district === district;
    const matchesSearch =
      !search ||
      school.name.toLowerCase().includes(search) ||
      school.district.toLowerCase().includes(search) ||
      school.ecoFocus.toLowerCase().includes(search) ||
      school.address.toLowerCase().includes(search) ||
      school.directorName.toLowerCase().includes(search);
    return matchesDistrict && matchesSearch;
  });

  const totalVotes = allFormatted.reduce((sum, s) => sum + s.ratingsCount, 0);
  const ratedByUser = allFormatted.filter((s) => s.hasRated).length;
  const ratedSchools = allFormatted.filter((s) => s.ratingsCount > 0);
  const overallAvg =
    ratedSchools.length > 0
      ? Math.round(
          (ratedSchools.reduce((sum, s) => sum + s.avgRating, 0) / ratedSchools.length) * 100
        ) / 100
      : 0;

  return res.json({
    schools: filtered,
    districts,
    summary: {
      totalSchools: allFormatted.length,
      totalVotes,
      ratedByUser,
      overallAvg,
    },
  });
});

// Admin: list all ratings across schools and users for editing
router.get('/ratings/all', authenticateToken, requireAdmin, (_req, res) => {
  const rows = db
    .prepare(`
      SELECT
        r.id,
        r.school_id,
        r.user_id,
        r.rating,
        r.comment,
        r.created_at,
        s.name AS school_name,
        s.district AS school_district,
        u.username,
        u.full_name
      FROM ratings r
      JOIN schools s ON s.id = r.school_id
      JOIN users u ON u.id = r.user_id
      ORDER BY r.id DESC
    `)
    .all();

  return res.json({
    ratings: rows.map((row) => ({
      id: row.id,
      schoolId: row.school_id,
      schoolName: row.school_name,
      schoolDistrict: row.school_district,
      userId: row.user_id,
      username: row.username,
      userFullName: row.full_name,
      rating: row.rating,
      comment: row.comment || '',
      createdAt: row.created_at,
    })),
  });
});

// Admin: edit any user's rating
router.patch('/ratings/:ratingId', authenticateToken, requireAdmin, (req, res) => {
  const ratingId = Number(req.params.ratingId);
  if (!Number.isInteger(ratingId) || ratingId <= 0) {
    return res.status(400).json({ error: "Noto'g'ri baho identifikatori." });
  }

  const existing = db.prepare('SELECT id FROM ratings WHERE id = ?').get(ratingId);
  if (!existing) {
    return res.status(404).json({ error: 'Baho yozuvi topilmadi.' });
  }

  const validation = validateRatingInput(req.body?.rating, req.body?.comment);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  db.prepare('UPDATE ratings SET rating = ?, comment = ? WHERE id = ?').run(
    validation.rating,
    validation.comment,
    ratingId
  );

  return res.json({
    message: `Baho ${validation.rating} yulduzga o'zgartirildi.`,
    ratingId,
    rating: validation.rating,
  });
});

// Admin: delete any rating
router.delete('/ratings/:ratingId', authenticateToken, requireAdmin, (req, res) => {
  const ratingId = Number(req.params.ratingId);
  if (!Number.isInteger(ratingId) || ratingId <= 0) {
    return res.status(400).json({ error: "Noto'g'ri baho identifikatori." });
  }

  const existing = db.prepare('SELECT id FROM ratings WHERE id = ?').get(ratingId);
  if (!existing) {
    return res.status(404).json({ error: 'Baho yozuvi topilmadi.' });
  }

  db.prepare('DELETE FROM ratings WHERE id = ?').run(ratingId);
  return res.json({
    message: "Baho o'chirildi.",
    deletedId: ratingId,
  });
});

// Individual School Page Data + Events Feed + Behavior Summary
router.get('/:id', authenticateToken, (req, res) => {
  const schoolId = Number(req.params.id);
  if (!Number.isInteger(schoolId) || schoolId <= 0) {
    return res.status(400).json({ error: "Noto'g'ri maktab identifikatori." });
  }

  const school = getSchoolByIdForUser(schoolId, req.user.id);
  if (!school) {
    return res.status(404).json({ error: 'Maktab topilmadi.' });
  }

  const events = getSchoolEvents(schoolId);
  const behaviorRows = db
    .prepare(`
      SELECT id, person_name, person_type, class_or_subject, behavior_status, eco_score, note, recorded_at
      FROM behavior_records
      WHERE school_id = ?
      ORDER BY recorded_at DESC, id DESC
      LIMIT 6
    `)
    .all(schoolId);

  return res.json({
    school,
    events,
    behaviors: behaviorRows.map((b) => ({
      id: b.id,
      personName: b.person_name,
      personType: b.person_type,
      classOrSubject: b.class_or_subject,
      behaviorStatus: b.behavior_status,
      ecoScore: b.eco_score,
      note: b.note || '',
      recordedAt: b.recorded_at,
    })),
    canManage: canManageSchool(req.user, schoolId),
  });
});

// Admin: Create school (with optional image)
router.post('/', authenticateToken, requireAdmin, (req, res) => {
  const check = validateSchoolInput(req.body);
  if (!check.valid) {
    return res.status(400).json({ error: check.error });
  }

  let imageUrl = '';
  if (req.body?.imageDataUrl) {
    const saved = saveUploadedImage(req.body.imageDataUrl, 'school');
    if (!saved.valid) {
      return res.status(400).json({ error: saved.error });
    }
    imageUrl = saved.url;
  } else if (req.body?.imageUrl && isValidImageUrlInput(req.body.imageUrl)) {
    imageUrl = req.body.imageUrl.trim();
  }

  const { name, district, address, ecoFocus } = check.data;
  const result = db
    .prepare(
      'INSERT INTO schools (name, district, address, eco_focus, image_url) VALUES (?, ?, ?, ?, ?)'
    )
    .run(name, district, address, ecoFocus, imageUrl);

  const created = getSchoolByIdForUser(result.lastInsertRowid, req.user.id);
  return res.status(201).json({
    message: "Maktab muvaffaqiyatli qo'shildi.",
    school: created,
  });
});

// Admin or Assigned School Director: Upload / Update School Cover Photo
router.post('/:id/image', authenticateToken, (req, res) => {
  const schoolId = Number(req.params.id);
  if (!Number.isInteger(schoolId) || schoolId <= 0) {
    return res.status(400).json({ error: "Noto'g'ri maktab identifikatori." });
  }

  if (!canManageSchool(req.user, schoolId)) {
    return res.status(403).json({
      error: "Maktab rasmini faqat administrator yoki ushbu maktab direktori o'zgartira oladi.",
    });
  }

  const existing = db.prepare('SELECT id, name FROM schools WHERE id = ?').get(schoolId);
  if (!existing) {
    return res.status(404).json({ error: 'Maktab topilmadi.' });
  }

  let nextImageUrl = '';
  if (req.body?.imageDataUrl) {
    const saved = saveUploadedImage(req.body.imageDataUrl, `school-${schoolId}`);
    if (!saved.valid) {
      return res.status(400).json({ error: saved.error });
    }
    nextImageUrl = saved.url;
  } else if (req.body?.imageUrl && isValidImageUrlInput(req.body.imageUrl)) {
    nextImageUrl = req.body.imageUrl.trim();
  } else {
    return res.status(400).json({ error: 'Rasm fayli yoki yaroqli rasm havolasi yuborilmadi.' });
  }

  db.prepare('UPDATE schools SET image_url = ? WHERE id = ?').run(nextImageUrl, schoolId);
  const updated = getSchoolByIdForUser(schoolId, req.user.id);
  return res.json({
    message: `"${existing.name}" rasmi yangilandi.`,
    school: updated,
  });
});

// Admin or Assigned School Director: Publish School Event
router.post('/:id/events', authenticateToken, (req, res) => {
  const schoolId = Number(req.params.id);
  if (!Number.isInteger(schoolId) || schoolId <= 0) {
    return res.status(400).json({ error: "Noto'g'ri maktab identifikatori." });
  }

  if (!canManageSchool(req.user, schoolId)) {
    return res.status(403).json({
      error: "Tadbirni faqat administrator yoki ushbu maktab direktori qo'sha oladi.",
    });
  }

  const existing = db.prepare('SELECT id FROM schools WHERE id = ?').get(schoolId);
  if (!existing) {
    return res.status(404).json({ error: 'Maktab topilmadi.' });
  }

  const check = validateEventInput(req.body);
  if (!check.valid) {
    return res.status(400).json({ error: check.error });
  }

  let eventImageUrl = '';
  if (req.body?.imageDataUrl) {
    const saved = saveUploadedImage(req.body.imageDataUrl, `event-${schoolId}`);
    if (!saved.valid) {
      return res.status(400).json({ error: saved.error });
    }
    eventImageUrl = saved.url;
  } else if (req.body?.imageUrl && isValidImageUrlInput(req.body.imageUrl)) {
    eventImageUrl = req.body.imageUrl.trim();
  }

  const { title, description, eventDate } = check.data;
  const result = db
    .prepare(`
      INSERT INTO school_events (school_id, author_id, title, description, image_url, event_date)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    .run(schoolId, req.user.id, title, description, eventImageUrl, eventDate);

  const events = getSchoolEvents(schoolId);
  const createdEvent = events.find((e) => e.id === Number(result.lastInsertRowid));

  return res.status(201).json({
    message: "Maktab tadbiri muvaffaqiyatli e'lon qilindi.",
    event: createdEvent,
  });
});

// Admin or Assigned School Director: Delete School Event
router.delete('/:id/events/:eventId', authenticateToken, (req, res) => {
  const schoolId = Number(req.params.id);
  const eventId = Number(req.params.eventId);
  if (!Number.isInteger(schoolId) || !Number.isInteger(eventId)) {
    return res.status(400).json({ error: "Noto'g'ri identifikator." });
  }

  if (!canManageSchool(req.user, schoolId)) {
    return res.status(403).json({ error: "Ushbu tadbirni o'chirishga ruxsat yo'q." });
  }

  const ev = db
    .prepare('SELECT id, title FROM school_events WHERE id = ? AND school_id = ?')
    .get(eventId, schoolId);
  if (!ev) {
    return res.status(404).json({ error: 'Tadbir topilmadi.' });
  }

  db.prepare('DELETE FROM school_events WHERE id = ?').run(eventId);
  return res.json({ message: `"${ev.title}" tadbiri o'chirildi.`, deletedId: eventId });
});

// Admin: Assign or Change Director for a School
router.patch('/:id/director', authenticateToken, requireAdmin, (req, res) => {
  const schoolId = Number(req.params.id);
  if (!Number.isInteger(schoolId) || schoolId <= 0) {
    return res.status(400).json({ error: "Noto'g'ri maktab identifikatori." });
  }

  const school = db.prepare('SELECT id, name FROM schools WHERE id = ?').get(schoolId);
  if (!school) {
    return res.status(404).json({ error: 'Maktab topilmadi.' });
  }

  const rawDirId = req.body?.directorId;
  const directorId = rawDirId === null || rawDirId === '' ? null : Number(rawDirId);

  if (directorId !== null && (!Number.isInteger(directorId) || directorId <= 0)) {
    return res.status(400).json({ error: "Noto'g'ri direktor identifikatori." });
  }

  const assignTx = db.transaction(() => {
    // Unassign any previous director linked to this school
    db.prepare("UPDATE users SET school_id = NULL WHERE school_id = ? AND role = 'director'").run(
      schoolId
    );

    if (directorId !== null) {
      const targetUser = db.prepare('SELECT id, full_name, role FROM users WHERE id = ?').get(directorId);
      if (!targetUser) {
        throw new Error('DIRECTOR_NOT_FOUND');
      }
      if (targetUser.role === 'admin') {
        throw new Error('CANNOT_ASSIGN_ADMIN');
      }
      db.prepare("UPDATE users SET role = 'director', school_id = ? WHERE id = ?").run(
        schoolId,
        directorId
      );
    }
  });

  try {
    assignTx();
  } catch (err) {
    if (err.message === 'DIRECTOR_NOT_FOUND') {
      return res.status(404).json({ error: 'Tanlangan foydalanuvchi topilmadi.' });
    }
    if (err.message === 'CANNOT_ASSIGN_ADMIN') {
      return res.status(400).json({ error: "Administratorni direktor sifatida biriktirib bo'lmaydi." });
    }
    throw err;
  }

  const updated = getSchoolByIdForUser(schoolId, req.user.id);
  return res.json({
    message: directorId
      ? `"${school.name}" maktabiga direktor biriktirildi.`
      : `"${school.name}" maktabidan direktor biriktiruvi olib tashlandi.`,
    school: updated,
  });
});

router.delete('/:id', authenticateToken, requireAdmin, (req, res) => {
  const schoolId = Number(req.params.id);
  if (!Number.isInteger(schoolId) || schoolId <= 0) {
    return res.status(400).json({ error: "Noto'g'ri maktab identifikatori." });
  }

  const existing = db.prepare('SELECT id, name FROM schools WHERE id = ?').get(schoolId);
  if (!existing) {
    return res.status(404).json({ error: 'Maktab topilmadi.' });
  }

  db.prepare('DELETE FROM schools WHERE id = ?').run(schoolId);
  return res.json({
    message: `"${existing.name}" maktabi o'chirildi.`,
    deletedId: schoolId,
  });
});

router.post('/:id/rate', authenticateToken, (req, res) => {
  const schoolId = Number(req.params.id);
  if (!Number.isInteger(schoolId) || schoolId <= 0) {
    return res.status(400).json({ error: "Noto'g'ri maktab identifikatori." });
  }

  const school = db.prepare('SELECT id, name FROM schools WHERE id = ?').get(schoolId);
  if (!school) {
    return res.status(404).json({ error: 'Maktab topilmadi.' });
  }

  const validation = validateRatingInput(req.body?.rating, req.body?.comment);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  const alreadyRated = db
    .prepare('SELECT id, rating FROM ratings WHERE school_id = ? AND user_id = ?')
    .get(schoolId, req.user.id);

  if (alreadyRated) {
    if (req.user.role === 'admin') {
      db.prepare('UPDATE ratings SET rating = ?, comment = ? WHERE id = ?').run(
        validation.rating,
        validation.comment,
        alreadyRated.id
      );
      const updated = getSchoolByIdForUser(schoolId, req.user.id);
      return res.json({
        message: `"${school.name}" maktabi bahosi ${validation.rating} yulduzga yangilandi.`,
        school: updated,
      });
    }

    return res.status(409).json({
      error: "Siz ushbu maktabni allaqachon baholagansiz (1 foydalanuvchi = 1 marta).",
    });
  }

  try {
    db.prepare('INSERT INTO ratings (school_id, user_id, rating, comment) VALUES (?, ?, ?, ?)').run(
      schoolId,
      req.user.id,
      validation.rating,
      validation.comment
    );
  } catch (err) {
    if (String(err.code).includes('SQLITE_CONSTRAINT')) {
      return res.status(409).json({
        error: "Siz ushbu maktabni allaqachon baholagansiz (1 foydalanuvchi = 1 marta).",
      });
    }
    throw err;
  }

  const updated = getSchoolByIdForUser(schoolId, req.user.id);
  return res.status(201).json({
    message: `"${school.name}" maktabiga ${validation.rating} yulduzli baho qo'yildi.`,
    school: updated,
  });
});

export default router;
