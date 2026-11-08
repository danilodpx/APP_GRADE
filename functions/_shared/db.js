// functions/_shared/db.js
// Utilitários para conexão e auto-provisionamento incremental do banco D1 único (nova-acropole-db)

const schemaApplied = new Set();

const M1_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS core_locations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL UNIQUE,
      is_active INTEGER NOT NULL DEFAULT 1
  );`,
  `CREATE TABLE IF NOT EXISTS core_users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      mfa_code TEXT DEFAULT '000000',
      role TEXT NOT NULL CHECK (role IN ('ADMIN', 'SECRETARIA', 'PROFESSOR', 'ALUNO')),
      default_location_id TEXT NOT NULL DEFAULT 'aguas-claras',
      linked_entity_id TEXT,
      avatar_url TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`,
  `CREATE INDEX IF NOT EXISTS idx_core_users_email ON core_users(email);`,
  `CREATE INDEX IF NOT EXISTS idx_core_users_role ON core_users(role);`,
  `INSERT OR IGNORE INTO core_locations (id, name, slug, is_active) VALUES
   ('aguas-claras', 'Águas Claras', 'aguas-claras', 1),
   ('samambaia', 'Samambaia', 'samambaia', 1);`,
  `INSERT OR IGNORE INTO core_users (id, name, email, password_hash, mfa_code, role, default_location_id, linked_entity_id, avatar_url, is_active) VALUES
   ('usr-admin', 'Coordenação Geral', 'admin@acropole.org.br', 'pbkdf2$100000$0123456789abcdeffedcba9876543210$26b89659d7a4ee8064ef78123c4d21f5a186de476cee86beb9a53e7b13aa86ed', '000000', 'ADMIN', 'aguas-claras', NULL, NULL, 1),
   ('usr-secretaria', 'Secretaria Nova Acrópole', 'secretaria@acropole.org.br', 'pbkdf2$100000$0123456789abcdeffedcba9876543210$26b89659d7a4ee8064ef78123c4d21f5a186de476cee86beb9a53e7b13aa86ed', '000000', 'SECRETARIA', 'aguas-claras', NULL, NULL, 1),
   ('usr-gustavo', 'Prof. Gustavo', 'gustavo@acropole.org.br', 'pbkdf2$100000$0123456789abcdeffedcba9876543210$26b89659d7a4ee8064ef78123c4d21f5a186de476cee86beb9a53e7b13aa86ed', '000000', 'PROFESSOR', 'aguas-claras', 'prof-gustavo', NULL, 1),
   ('usr-aluno-t21a', 'Aluno T21A', 'aluno.t21a@acropole.org.br', 'pbkdf2$100000$0123456789abcdeffedcba9876543210$26b89659d7a4ee8064ef78123c4d21f5a186de476cee86beb9a53e7b13aa86ed', '000000', 'ALUNO', 'aguas-claras', 'stu-demo-t21a', NULL, 1);`
];

const M2_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS prof_professors (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      specialty TEXT NOT NULL DEFAULT 'Filosofia',
      avatar_url TEXT,
      weekly_hours_target INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1
  );`,
  `CREATE TABLE IF NOT EXISTS prof_personal_blocks (
      id TEXT PRIMARY KEY,
      professor_id TEXT NOT NULL REFERENCES prof_professors(id) ON DELETE CASCADE,
      location_id TEXT NOT NULL,
      day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
      start_minute INTEGER NOT NULL,
      end_minute INTEGER NOT NULL,
      block_type TEXT NOT NULL,
      notes TEXT
  );`,
  `CREATE TABLE IF NOT EXISTS prof_absences (
      id TEXT PRIMARY KEY,
      professor_id TEXT NOT NULL REFERENCES prof_professors(id) ON DELETE CASCADE,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      reason TEXT,
      default_substitute_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`,
  `CREATE INDEX IF NOT EXISTS idx_prof_blocks_day ON prof_personal_blocks(professor_id, day_of_week, start_minute, end_minute);`,
  `CREATE INDEX IF NOT EXISTS idx_prof_absences_dates ON prof_absences(professor_id, start_date, end_date);`,
  `INSERT OR IGNORE INTO prof_professors (id, name, email, phone, specialty, weekly_hours_target, is_active) VALUES
   ('prof-gustavo', 'Gustavo', 'gustavo@acropole.org.br', '(61) 98111-0001', 'Filosofia / Ética', 12, 1),
   ('prof-debora', 'Débora', 'debora@acropole.org.br', '(61) 98111-0002', 'Filosofia / Simbologia', 10, 1),
   ('prof-luisa', 'Luísa', 'luisa@acropole.org.br', '(61) 98111-0003', 'Filosofia / Mitologia', 8, 1),
   ('prof-daysy', 'Daysy', 'daysy@acropole.org.br', '(61) 98111-0004', 'Filosofia / Psicologia', 10, 1),
   ('prof-maria-clara', 'Maria Clara', 'maria.clara@acropole.org.br', '(61) 98111-0005', 'Filosofia Aplicada', 8, 1),
   ('prof-gama', 'Gama', 'gama@acropole.org.br', '(61) 98111-0006', 'História da Filosofia', 10, 1),
   ('prof-eduardo', 'Eduardo', 'eduardo@acropole.org.br', '(61) 98111-0007', 'Pedagogia / Teoria do Conhecimento', 6, 1),
   ('prof-cintia', 'Cíntia', 'cintia@acropole.org.br', '(61) 98111-0008', 'Filosofia & Arte', 8, 1),
   ('prof-malu', 'Malu', 'malu@acropole.org.br', '(61) 98111-0009', 'Introdução à Filosofia', 8, 1);`,
  `INSERT OR IGNORE INTO prof_personal_blocks (id, professor_id, location_id, day_of_week, start_minute, end_minute, block_type, notes) VALUES
   ('blk-gustavo-recep-seg', 'prof-gustavo', 'aguas-claras', 1, 1140, 1200, 'RECEPCAO', 'Recepção e acolhimento aos alunos novos'),
   ('blk-gustavo-pedag-qua', 'prof-gustavo', 'aguas-claras', 3, 1110, 1170, 'PEDAGOGOS', 'Reunião de alinhamento pedagógico'),
   ('blk-debora-cafe-ter', 'prof-debora', 'aguas-claras', 2, 1170, 1200, 'CAFE', 'Intervalo filosófico e atendimento'),
   ('blk-luisa-estudos-qui', 'prof-luisa', 'aguas-claras', 4, 1110, 1170, 'ESTUDOS_SERIADOS', 'Coordenação de estudos seriados'),
   ('blk-daysy-recep-sab', 'prof-daysy', 'samambaia', 6, 540, 600, 'RECEPCAO', 'Acolhimento matinal aos sábados');`
];

/**
 * Garante que o esquema do módulo especificado esteja presente no banco D1 sem apagar dados existentes.
 * Executado 1x por isolate em memória.
 */
export async function ensureModuleSchema(db, moduleId = 'M1') {
  if (!db) return;
  const key = `${moduleId}`;
  if (schemaApplied.has(key)) return;

  try {
    if (moduleId === 'M1') {
      const statements = M1_SCHEMA.map(sql => db.prepare(sql));
      await db.batch(statements);
    } else if (moduleId === 'M2') {
      // Garante M1 primeiro se não tiver sido aplicado
      if (!schemaApplied.has('M1')) {
        await db.batch(M1_SCHEMA.map(sql => db.prepare(sql)));
        schemaApplied.add('M1');
      }
      const statements = M2_SCHEMA.map(sql => db.prepare(sql));
      await db.batch(statements);
    }
    schemaApplied.add(key);
  } catch (err) {
    console.error(`[ensureModuleSchema:${moduleId}] Erro ao verificar esquema:`, err);
  }
}

