import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateRatingInput,
  validateSchoolInput,
  validateUserInput,
  validateEventInput,
  validateRegisterRequestInput,
  validateBehaviorInput,
  validateProfileUpdateInput,
  computeSchoolStats,
  sanitizeUser,
} from './scoring.js';

test('validateBehaviorInput validates teacher and student behavior evaluations', () => {
  const badType = validateBehaviorInput({
    schoolId: 1,
    personName: 'Alisher',
    personType: 'guest',
    ecoScore: 5,
  });
  assert.equal(badType.valid, false);

  const ok = validateBehaviorInput({
    schoolId: 2,
    personName: '  Dilbar Azizova ',
    personType: 'teacher',
    classOrSubject: 'Biologiya fani',
    behaviorStatus: 'excellent',
    ecoScore: 5,
    note: "Eko-loyihalarda faol yetakchi",
    recordedAt: '2026-11-18',
  });
  assert.equal(ok.valid, true);
  assert.equal(ok.data.personName, 'Dilbar Azizova');
  assert.equal(ok.data.personType, 'teacher');
  assert.equal(ok.data.behaviorStatus, 'excellent');
  assert.equal(ok.data.ecoScore, 5);
});

test('validateProfileUpdateInput validates profile fields and password changes', () => {
  const missingCurrent = validateProfileUpdateInput({
    fullName: 'Bexruz',
    newPassword: 'newpassword123',
  });
  assert.equal(missingCurrent.valid, false);

  const valid = validateProfileUpdateInput({
    fullName: '  Kamola Karimova  ',
    phone: '+998 90 123 45 67',
    bio: 'Maktab ekologik kengashi rahbari',
  });
  assert.equal(valid.valid, true);
  assert.equal(valid.data.fullName, 'Kamola Karimova');
  assert.equal(valid.data.phone, '+998 90 123 45 67');
});

test('validateEventInput validates school event title, description, and date', () => {
  const bad = validateEventInput({ title: 'Hi', description: 'Short' });
  assert.equal(bad.valid, false);

  const ok = validateEventInput({
    title: "Yashil ko'chat ekish aksiyasi",
    description: "Maktab hovlisiga 120 ta archa va chinor ko'chatlari ekildi.",
    eventDate: '2026-11-18',
  });
  assert.equal(ok.valid, true);
  assert.equal(ok.data.eventDate, '2026-11-18');
});

test('validateUserInput supports director role with schoolId', () => {
  const dir = validateUserInput({
    username: 'dir_24',
    password: 'secret',
    fullName: 'Kamola Rustamova',
    role: 'director',
    schoolId: 1,
  });
  assert.equal(dir.valid, true);
  assert.equal(dir.data.role, 'director');
  assert.equal(dir.data.schoolId, 1);
});

test('validateRegisterRequestInput validates registration application fields and requestedRole', () => {
  const shortPw = validateRegisterRequestInput({
    fullName: 'Jasur Alimov',
    username: 'jasur_eko',
    password: '123',
  });
  assert.equal(shortPw.valid, false);

  const valid = validateRegisterRequestInput({
    fullName: '  Jasur Alimov ',
    username: ' Jasur_Eko ',
    password: 'secret123',
    note: '  Maktab ekologik nazoratchisi  ',
    requestedRole: 'admin',
  });
  assert.equal(valid.valid, true);
  assert.equal(valid.data.username, 'jasur_eko');
  assert.equal(valid.data.fullName, 'Jasur Alimov');
  assert.equal(valid.data.note, 'Maktab ekologik nazoratchisi');
  assert.equal(valid.data.requestedRole, 'admin');
});

test('validateRatingInput accepts integers 1 through 5 and trims comments', () => {
  const res = validateRatingInput(5, '  Ajoyib eko-bog!  ');
  assert.equal(res.valid, true);
  assert.equal(res.rating, 5);
  assert.equal(res.comment, 'Ajoyib eko-bog!');
});

test('validateRatingInput rejects out-of-range and fractional ratings', () => {
  assert.equal(validateRatingInput(0).valid, false);
  assert.equal(validateRatingInput(6).valid, false);
  assert.equal(validateRatingInput(3.5).valid, false);
  assert.equal(validateRatingInput('abc').valid, false);
  assert.equal(validateRatingInput(null).valid, false);
});

test('validateSchoolInput enforces name and district and provides sensible defaults', () => {
  const invalid = validateSchoolInput({ name: 'AB', district: 'Chilonzor' });
  assert.equal(invalid.valid, false);

  const valid = validateSchoolInput({
    name: '24-sonli Eko Maktab',
    district: 'Chilonzor tumani',
  });
  assert.equal(valid.valid, true);
  assert.equal(valid.data.name, '24-sonli Eko Maktab');
  assert.equal(valid.data.district, 'Chilonzor tumani');
  assert.ok(valid.data.address.length > 0);
  assert.ok(valid.data.ecoFocus.length > 0);
});

test('validateUserInput normalizes username and enforces role whitelist', () => {
  const bad = validateUserInput({ username: 'a', password: '123', fullName: 'Ali' });
  assert.equal(bad.valid, false);

  const good = validateUserInput({
    username: '  Komissiya_01 ',
    password: 'secret123',
    fullName: 'Dilnoza Saidova',
    role: 'superadmin',
  });
  assert.equal(good.valid, true);
  assert.equal(good.data.username, 'komissiya_01');
  assert.equal(good.data.role, 'user');
});

test('computeSchoolStats calculates accurate rounded averages', () => {
  assert.deepEqual(computeSchoolStats([]), { avgRating: 0, ratingsCount: 0 });
  assert.deepEqual(computeSchoolStats([5, 4, 4]), { avgRating: 4.33, ratingsCount: 3 });
  assert.deepEqual(computeSchoolStats([5, 5]), { avgRating: 5, ratingsCount: 2 });
});

test('sanitizeUser strips password_hash and maps profile fields cleanly', () => {
  const clean = sanitizeUser({
    id: 1,
    username: 'bexruz',
    full_name: 'Bexruz (Admin)',
    password_hash: '$2a$10$secret',
    role: 'admin',
    avatar_url: '/uploads/avatar-1.png',
    bio: 'Bosh administrator',
    phone: '+998901112233',
    created_at: '2026-11-18T10:00:00Z',
    ratings_count: 2,
  });
  assert.equal('password_hash' in clean, false);
  assert.equal(clean.fullName, 'Bexruz (Admin)');
  assert.equal(clean.avatarUrl, '/uploads/avatar-1.png');
  assert.equal(clean.bio, 'Bosh administrator');
  assert.equal(clean.isPrimaryAdmin, true);
  assert.equal(clean.ratingsCount, 2);
});
