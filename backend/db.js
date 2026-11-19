import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = process.env.DB_PATH || path.join(dataDir, 'eko_komissiya.db');
const db = new Database(dbPath);

// Enable WAL mode and foreign key constraints
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize base schema
db.exec(`
  CREATE TABLE IF NOT EXISTS schools (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    district TEXT NOT NULL,
    address TEXT NOT NULL,
    eco_focus TEXT NOT NULL,
    image_url TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'director', 'user')),
    school_id INTEGER REFERENCES schools(id) ON DELETE SET NULL,
    avatar_url TEXT NOT NULL DEFAULT '',
    bio TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS registration_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    full_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    requested_role TEXT NOT NULL DEFAULT 'user' CHECK (requested_role IN ('user', 'admin')),
    note TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    reviewed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS ratings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    school_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE (school_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS school_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    school_id INTEGER NOT NULL,
    author_id INTEGER,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    image_url TEXT NOT NULL DEFAULT '',
    event_date TEXT NOT NULL DEFAULT (date('now')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
    FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS behavior_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    school_id INTEGER NOT NULL,
    person_name TEXT NOT NULL,
    person_type TEXT NOT NULL CHECK (person_type IN ('teacher', 'student')),
    class_or_subject TEXT NOT NULL DEFAULT '',
    behavior_status TEXT NOT NULL DEFAULT 'good' CHECK (behavior_status IN ('excellent', 'good', 'satisfactory', 'needs_attention')),
    eco_score INTEGER NOT NULL CHECK (eco_score >= 1 AND eco_score <= 5),
    note TEXT NOT NULL DEFAULT '',
    recorded_by INTEGER,
    recorded_at TEXT NOT NULL DEFAULT (date('now')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
    FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE SET NULL
  );
`);

function runMigrations() {
  // Add image_url to schools if missing on older DBs
  const schoolCols = db.prepare('PRAGMA table_info(schools)').all().map((c) => c.name);
  if (!schoolCols.includes('image_url')) {
    db.exec("ALTER TABLE schools ADD COLUMN image_url TEXT NOT NULL DEFAULT ''");
  }

  // Migrate users table if CHECK constraint lacks 'director' or school_id column is missing
  const usersSqlRow = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'")
    .get();
  const userCols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  const needsUsersMigration =
    !userCols.includes('school_id') ||
    (usersSqlRow?.sql && !usersSqlRow.sql.includes("'director'"));

  if (needsUsersMigration) {
    db.pragma('foreign_keys = OFF');
    const migrateTx = db.transaction(() => {
      db.exec(`
        CREATE TABLE users_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT NOT NULL UNIQUE,
          full_name TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'director', 'user')),
          school_id INTEGER REFERENCES schools(id) ON DELETE SET NULL,
          avatar_url TEXT NOT NULL DEFAULT '',
          bio TEXT NOT NULL DEFAULT '',
          phone TEXT NOT NULL DEFAULT '',
          is_active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        INSERT INTO users_new (id, username, full_name, password_hash, role, school_id, created_at)
        SELECT id, username, full_name, password_hash, role, NULL, created_at FROM users;

        DROP TABLE users;
        ALTER TABLE users_new RENAME TO users;
      `);
    });
    migrateTx();
    db.pragma('foreign_keys = ON');
  } else {
    if (!userCols.includes('avatar_url')) {
      db.exec("ALTER TABLE users ADD COLUMN avatar_url TEXT NOT NULL DEFAULT ''");
    }
    if (!userCols.includes('bio')) {
      db.exec("ALTER TABLE users ADD COLUMN bio TEXT NOT NULL DEFAULT ''");
    }
    if (!userCols.includes('phone')) {
      db.exec("ALTER TABLE users ADD COLUMN phone TEXT NOT NULL DEFAULT ''");
    }
    if (!userCols.includes('is_active')) {
      db.exec('ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1');
    }
  }

  // Add requested_role and reviewed_by to registration_requests if missing
  const reqCols = db.prepare('PRAGMA table_info(registration_requests)').all().map((c) => c.name);
  if (!reqCols.includes('requested_role')) {
    db.exec("ALTER TABLE registration_requests ADD COLUMN requested_role TEXT NOT NULL DEFAULT 'user'");
  }
  if (!reqCols.includes('reviewed_by')) {
    db.exec('ALTER TABLE registration_requests ADD COLUMN reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL');
  }
}

function ensureBexruzAdmin() {
  const adminHash = bcrypt.hashSync('qwertyuiop10122012', 10);
  const oldAdmin = db.prepare("SELECT id FROM users WHERE username = 'admin'").get();
  const bexruz = db.prepare("SELECT id FROM users WHERE username = 'bexruz'").get();

  if (oldAdmin && !bexruz) {
    db.prepare(
      "UPDATE users SET username = 'bexruz', full_name = 'Bexruz (Admin)', password_hash = ?, role = 'admin' WHERE id = ?"
    ).run(adminHash, oldAdmin.id);
  } else if (oldAdmin && bexruz) {
    db.prepare('DELETE FROM users WHERE id = ?').run(oldAdmin.id);
  } else if (!bexruz) {
    db.prepare(
      "INSERT INTO users (username, full_name, password_hash, role) VALUES ('bexruz', 'Bexruz (Admin)', ?, 'admin')"
    ).run(adminHash);
  }
}

function seedDatabase() {
  runMigrations();
  ensureBexruzAdmin();

  const schoolCount = db.prepare('SELECT COUNT(*) AS count FROM schools').get().count;
  if (schoolCount === 0) {
    const insertUser = db.prepare(`
      INSERT OR IGNORE INTO users (username, full_name, password_hash, role, school_id)
      VALUES (?, ?, ?, ?, ?)
    `);

    const memberHash = bcrypt.hashSync('eko123', 10);
    insertUser.run('komissiya', 'Aziza Karimova', memberHash, 'user', null);
    insertUser.run('ekspert', 'Sardor Rahimov', memberHash, 'user', null);

    const user1 = db.prepare("SELECT id FROM users WHERE username = 'komissiya'").get();
    const user2 = db.prepare("SELECT id FROM users WHERE username = 'ekspert'").get();

    const insertSchool = db.prepare(`
      INSERT INTO schools (name, district, address, eco_focus)
      VALUES (?, ?, ?, ?)
    `);

    const seedSchools = [
      [
        "24-sonli Eko-Maktab",
        "Chilonzor tumani",
        "Bunyodkor shoh ko'chasi, 18-uy",
        "Quyosh panellari va yomg'ir suvini yig'ish tizimi",
      ],
      [
        "71-sonli Ixtisoslashtirilgan Maktab",
        "Yunusobod tumani",
        "Amir Temur ko'chasi, 104-uy",
        "Plastikni qayta ishlash va yashil laboratoriya",
      ],
      [
        "105-sonli Umumta'lim Maktabi",
        "Mirzo Ulug'bek tumani",
        "Mustaqillik shoh ko'chasi, 52-uy",
        "Maktab bog'i va kompost tayyorlash hududi",
      ],
      [
        "9-sonli Yashil Makon Maktabi",
        "Yakkasaroy tumani",
        "Shota Rustaveli ko'chasi, 37-uy",
        "Energiya tejamkor LED yoritish va eko-klub",
      ],
      [
        "42-sonli Innovatsion Maktab",
        "Shayxontohur tumani",
        "Navoiy ko'chasi, 29-uy",
        "Qog'ozsiz raqamli kundalik va daraxt ekish aksiyasi",
      ],
      [
        "18-sonli Tabiatsevarlar Maktabi",
        "Sergeli tumani",
        "Yangi Sergeli ko'chasi, 14-uy",
        "Chiqindilarni 4 xil toifada saralash punktlari",
      ],
    ];

    const schoolIds = seedSchools.map((s) => insertSchool.run(...s).lastInsertRowid);

    // Seed a school director assigned to 24-sonli Eko-Maktab
    insertUser.run('direktor1', 'Dilshod Xolmatov', memberHash, 'director', schoolIds[0]);
    const dir1 = db.prepare("SELECT id FROM users WHERE username = 'direktor1'").get();

    const insertRating = db.prepare(`
      INSERT OR IGNORE INTO ratings (school_id, user_id, rating, comment)
      VALUES (?, ?, ?, ?)
    `);

    const u1 = user1.id;
    const u2 = user2.id;

    const seedRatings = [
      [schoolIds[0], u1, 5, "Quyosh panellari samarali ishlamoqda"],
      [schoolIds[0], u2, 5, "Hovli toza va yashil hudud juda keng"],
      [schoolIds[1], u1, 4, "Saralash qutilari barcha qavatlarda bor"],
      [schoolIds[1], u2, 5, "Eko-laboratoriya namunali tashkil etilgan"],
      [schoolIds[2], u1, 4, "Kompost hududi yaxshi parvarish qilingan"],
      [schoolIds[2], u2, 4, "Yashil maydonlar kengaytirilmoqda"],
      [schoolIds[3], u1, 5, "Energiya tejamkorligi bo'yicha yuqori ko'rsatkich"],
      [schoolIds[4], u2, 3, "Qog'oz tejamkorligi yaxshi, bog'ni kengaytirish kerak"],
      [schoolIds[5], u1, 4, "Chiqindilarni saralash muntazam yo'lga qo'yilgan"],
    ];

    const seedTx = db.transaction((rows) => {
      for (const row of rows) {
        insertRating.run(...row);
      }
    });
    seedTx(seedRatings);

    // Seed sample eco-events for school pages
    const insertEvent = db.prepare(`
      INSERT INTO school_events (school_id, author_id, title, description, event_date)
      VALUES (?, ?, ?, ?, ?)
    `);
    insertEvent.run(
      schoolIds[0],
      dir1?.id || null,
      "Kuzgi ko'chat ekish hashar aksiyasi",
      "Maktab hovlisida o'quvchilar va ota-onalar ishtirokida 85 tup mevali va manzarali daraxt ko'chatlari ekildi.",
      '2026-11-12'
    );
    insertEvent.run(
      schoolIds[1],
      null,
      "Plastikni qayta ishlash haftaligi",
      "Har bir sinf o'rtasida plastik idishlarni saralab topshirish musobaqasi o'tkazilib, 140 kg xomashyo qayta ishlashga yuborildi.",
      '2026-11-15'
    );
  }

  const reqCount = db.prepare('SELECT COUNT(*) AS count FROM registration_requests').get().count;
  if (reqCount === 0) {
    const memberHash = bcrypt.hashSync('eko123', 10);
    const insertReq = db.prepare(
      `INSERT INTO registration_requests (username, full_name, password_hash, requested_role, note, status)
       VALUES (?, ?, ?, ?, ?, 'pending')`
    );
    insertReq.run(
      'malika_eko',
      'Malika Tursunova',
      memberHash,
      'user',
      "Chilonzor tumani maktablari bo'yicha eko-kuzatuvchi"
    );
    insertReq.run(
      'shahzod_admin',
      'Shahzod Rasulov',
      memberHash,
      'admin',
      "Tuman bo'yicha muvofiqlashtiruvchi adminlik uchun ariza"
    );
  }

  const behaviorCount = db.prepare('SELECT COUNT(*) AS count FROM behavior_records').get().count;
  if (behaviorCount === 0) {
    const allSchoolIds = db.prepare('SELECT id FROM schools ORDER BY id ASC').all().map((r) => r.id);
    const dirRow = db.prepare("SELECT id FROM users WHERE username = 'direktor1'").get();
    if (allSchoolIds.length >= 3) {
      const insertBehavior = db.prepare(`
        INSERT INTO behavior_records (
          school_id, person_name, person_type, class_or_subject,
          behavior_status, eco_score, note, recorded_by, recorded_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const seedBehaviors = [
        [
          allSchoolIds[0],
          'Gulnora Toshmatova',
          'teacher',
          'Biologiya va ekologiya fani',
          'excellent',
          5,
          "O'quvchilar bilan muntazam eko-to'garak va amaliy tajribalar o'tkazadi.",
          dirRow?.id || null,
          '2026-11-16',
        ],
        [
          allSchoolIds[0],
          'Jasurbek Abdullayev',
          'student',
          '9-A sinf',
          'excellent',
          5,
          "Maktab bog'ini sug'orish va chiqindilarni saralashda sinf sardori sifatida namuna.",
          dirRow?.id || null,
          '2026-11-16',
        ],
        [
          allSchoolIds[1],
          'Otabek Qodirov',
          'teacher',
          'Kimyo fani',
          'good',
          4,
          "Laboratoriya chiqindilarini xavfsiz utilizatsiya qilish tartibiga qat'iy amal qiladi.",
          null,
          '2026-11-15',
        ],
        [
          allSchoolIds[1],
          'Madina Olimova',
          'student',
          '8-B sinf',
          'good',
          4,
          "Plastik yig'ish haftaligida faol qatnashdi, tartib-intizomi namunali.",
          null,
          '2026-11-15',
        ],
        [
          allSchoolIds[2],
          'Sardorbek Ergashev',
          'student',
          '7-V sinf',
          'needs_attention',
          2,
          "Darsdan tashqari ekologik navbatchilikda qatnashmadi, ogohlantirish berildi.",
          null,
          '2026-11-14',
        ],
      ];
      const behaviorTx = db.transaction((rows) => {
        for (const r of rows) insertBehavior.run(...r);
      });
      behaviorTx(seedBehaviors);
    }
  }
}

seedDatabase();

export function closeDatabase() {
  try {
    db.pragma('wal_checkpoint(TRUNCATE)');
    db.close();
  } catch {
    // Ignore if already closed
  }
}

export default db;
