/**
 * Pure validation and scoring helpers for Eko Komisiya.
 * Decoupled from Express/SQLite for deterministic unit testing.
 */

export function validateRatingInput(rawRating, rawComment = '') {
  const numericRating = Number(rawRating);
  if (!Number.isInteger(numericRating) || numericRating < 1 || numericRating > 5) {
    return {
      valid: false,
      error: "Baho 1 dan 5 gacha bo'lgan butun son bo'lishi kerak",
    };
  }

  const comment = typeof rawComment === 'string' ? rawComment.trim().slice(0, 300) : '';
  return {
    valid: true,
    rating: numericRating,
    comment,
  };
}

export function validateSchoolInput(payload = {}) {
  const name = typeof payload.name === 'string' ? payload.name.trim() : '';
  const district = typeof payload.district === 'string' ? payload.district.trim() : '';
  const address = typeof payload.address === 'string' ? payload.address.trim() : '';
  const ecoFocus = typeof payload.ecoFocus === 'string' ? payload.ecoFocus.trim() : '';

  if (name.length < 3 || name.length > 120) {
    return {
      valid: false,
      error: "Maktab nomi kamida 3 ta belgidan iborat bo'lishi kerak",
    };
  }
  if (district.length < 2 || district.length > 80) {
    return {
      valid: false,
      error: "Tuman yoki hudud nomi kiritilishi shart",
    };
  }
  if (address.length > 180) {
    return {
      valid: false,
      error: "Manzil 180 ta belgidan oshmasligi kerak",
    };
  }
  if (ecoFocus.length > 160) {
    return {
      valid: false,
      error: "Ekologik yo'nalish tavsifi 160 ta belgidan oshmasligi kerak",
    };
  }

  return {
    valid: true,
    data: {
      name,
      district,
      address: address || `${district}, markaziy ko'cha`,
      ecoFocus: ecoFocus || "Chiqindilarni saralash va ko'kalamzorlashtirish",
    },
  };
}

export function validateUserInput(payload = {}) {
  const username = typeof payload.username === 'string' ? payload.username.trim().toLowerCase() : '';
  const password = typeof payload.password === 'string' ? payload.password : '';
  const fullName = typeof payload.fullName === 'string' ? payload.fullName.trim() : '';
  const allowedRoles = ['admin', 'director', 'user'];
  const role = allowedRoles.includes(payload.role) ? payload.role : 'user';
  const rawSchoolId = payload.schoolId !== undefined && payload.schoolId !== '' && payload.schoolId !== null
    ? Number(payload.schoolId)
    : null;

  if (!/^[a-z0-9_.-]{3,32}$/.test(username)) {
    return {
      valid: false,
      error: "Login 3–32 ta lotin harfi, raqam yoki _ . - belgisidan iborat bo'lishi kerak",
    };
  }
  if (password.length < 4 || password.length > 100) {
    return {
      valid: false,
      error: "Parol kamida 4 ta belgidan iborat bo'lishi kerak",
    };
  }
  if (fullName.length < 2 || fullName.length > 80) {
    return {
      valid: false,
      error: "To'liq ism kiritilishi shart (kamida 2 ta belgi)",
    };
  }
  if (role === 'director' && rawSchoolId !== null && (!Number.isInteger(rawSchoolId) || rawSchoolId <= 0)) {
    return {
      valid: false,
      error: "Direktor uchun to'g'ri maktab tanlanishi kerak",
    };
  }

  return {
    valid: true,
    data: {
      username,
      password,
      fullName,
      role,
      schoolId: role === 'director' ? rawSchoolId : null,
    },
  };
}

export function validateEventInput(payload = {}) {
  const title = typeof payload.title === 'string' ? payload.title.trim() : '';
  const description = typeof payload.description === 'string' ? payload.description.trim() : '';
  const rawDate = typeof payload.eventDate === 'string' ? payload.eventDate.trim() : '';

  if (title.length < 3 || title.length > 140) {
    return {
      valid: false,
      error: "Tadbir sarlavhasi 3 dan 140 ta belgigaacha bo'lishi kerak",
    };
  }
  if (description.length < 5 || description.length > 1200) {
    return {
      valid: false,
      error: "Tadbir tavsifi kamida 5 ta belgidan iborat bo'lishi kerak",
    };
  }

  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(rawDate);
  const eventDate = dateOk ? rawDate : new Date().toISOString().slice(0, 10);

  return {
    valid: true,
    data: {
      title,
      description,
      eventDate,
    },
  };
}

export function validateRegisterRequestInput(payload = {}) {
  const username = typeof payload.username === 'string' ? payload.username.trim().toLowerCase() : '';
  const password = typeof payload.password === 'string' ? payload.password : '';
  const fullName = typeof payload.fullName === 'string' ? payload.fullName.trim() : '';
  const note = typeof payload.note === 'string' ? payload.note.trim().slice(0, 240) : '';
  const requestedRole = payload.requestedRole === 'admin' ? 'admin' : 'user';

  if (fullName.length < 2 || fullName.length > 80) {
    return {
      valid: false,
      error: "To'liq ism (F.I.Sh.) kamida 2 ta belgidan iborat bo'lishi kerak",
    };
  }
  if (!/^[a-z0-9_.-]{3,32}$/.test(username)) {
    return {
      valid: false,
      error: "Login 3–32 ta lotin harfi, raqam yoki _ . - belgisidan iborat bo'lishi kerak",
    };
  }
  if (password.length < 6 || password.length > 100) {
    return {
      valid: false,
      error: "Parol kamida 6 ta belgidan iborat bo'lishi kerak",
    };
  }

  return {
    valid: true,
    data: {
      username,
      password,
      fullName,
      note,
      requestedRole,
    },
  };
}

export const BEHAVIOR_STATUSES = ['excellent', 'good', 'satisfactory', 'needs_attention'];
export const BEHAVIOR_PERSON_TYPES = ['teacher', 'student'];

export function validateBehaviorInput(payload = {}) {
  const schoolId = Number(payload.schoolId);
  const personName = typeof payload.personName === 'string' ? payload.personName.trim() : '';
  const personType = BEHAVIOR_PERSON_TYPES.includes(payload.personType) ? payload.personType : '';
  const classOrSubject =
    typeof payload.classOrSubject === 'string' ? payload.classOrSubject.trim().slice(0, 80) : '';
  const behaviorStatus = BEHAVIOR_STATUSES.includes(payload.behaviorStatus)
    ? payload.behaviorStatus
    : 'good';
  const ecoScore = Number(payload.ecoScore);
  const note = typeof payload.note === 'string' ? payload.note.trim().slice(0, 400) : '';
  const rawDate = typeof payload.recordedAt === 'string' ? payload.recordedAt.trim() : '';

  if (!Number.isInteger(schoolId) || schoolId <= 0) {
    return { valid: false, error: 'Maktab tanlanishi shart.' };
  }
  if (personName.length < 2 || personName.length > 80) {
    return { valid: false, error: "Ustoz yoki o'quvchi ismi kamida 2 ta belgi bo'lishi kerak." };
  }
  if (!personType) {
    return { valid: false, error: "Toifa 'teacher' (ustoz) yoki 'student' (o'quvchi) bo'lishi kerak." };
  }
  if (!Number.isInteger(ecoScore) || ecoScore < 1 || ecoScore > 5) {
    return { valid: false, error: "Xulq-atvor bahosi 1 dan 5 gacha butun son bo'lishi kerak." };
  }

  const recordedAt = /^\d{4}-\d{2}-\d{2}$/.test(rawDate)
    ? rawDate
    : new Date().toISOString().slice(0, 10);

  return {
    valid: true,
    data: {
      schoolId,
      personName,
      personType,
      classOrSubject: classOrSubject || (personType === 'teacher' ? 'Fan o\'qituvchisi' : 'O\'quvchi'),
      behaviorStatus,
      ecoScore,
      note,
      recordedAt,
    },
  };
}

export function validateProfileUpdateInput(payload = {}) {
  const fullName = typeof payload.fullName === 'string' ? payload.fullName.trim() : '';
  const phone = typeof payload.phone === 'string' ? payload.phone.trim().slice(0, 40) : '';
  const bio = typeof payload.bio === 'string' ? payload.bio.trim().slice(0, 300) : '';
  const currentPassword = typeof payload.currentPassword === 'string' ? payload.currentPassword : '';
  const newPassword = typeof payload.newPassword === 'string' ? payload.newPassword : '';

  if (fullName.length < 2 || fullName.length > 80) {
    return {
      valid: false,
      error: "To'liq ism kamida 2 ta belgidan iborat bo'lishi kerak.",
    };
  }
  if (newPassword && (newPassword.length < 4 || newPassword.length > 100)) {
    return {
      valid: false,
      error: "Yangi parol kamida 4 ta belgidan iborat bo'lishi kerak.",
    };
  }
  if (newPassword && !currentPassword) {
    return {
      valid: false,
      error: 'Parolni almashtirish uchun joriy parolni kiriting.',
    };
  }

  return {
    valid: true,
    data: {
      fullName,
      phone,
      bio,
      currentPassword,
      newPassword,
    },
  };
}

export function computeSchoolStats(ratingValues) {
  if (!Array.isArray(ratingValues) || ratingValues.length === 0) {
    return { avgRating: 0, ratingsCount: 0 };
  }
  const valid = ratingValues.filter((n) => Number.isFinite(Number(n)) && n >= 1 && n <= 5);
  if (valid.length === 0) {
    return { avgRating: 0, ratingsCount: 0 };
  }
  const sum = valid.reduce((acc, v) => acc + Number(v), 0);
  const avgRating = Math.round((sum / valid.length) * 100) / 100;
  return { avgRating, ratingsCount: valid.length };
}

export function sanitizeUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    username: row.username,
    fullName: row.full_name ?? row.fullName ?? '',
    role: row.role,
    schoolId: row.school_id ?? row.schoolId ?? null,
    schoolName: row.school_name ?? row.schoolName ?? null,
    avatarUrl: row.avatar_url ?? row.avatarUrl ?? '',
    bio: row.bio ?? '',
    phone: row.phone ?? '',
    isActive: row.is_active !== undefined ? Boolean(row.is_active) : true,
    isPrimaryAdmin: row.username === 'bexruz',
    createdAt: row.created_at ?? row.createdAt ?? null,
    ratingsCount: typeof row.ratings_count === 'number' ? row.ratings_count : (row.ratingsCount ?? 0),
  };
}
