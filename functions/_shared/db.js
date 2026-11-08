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
    }
    schemaApplied.add(key);
  } catch (err) {
    console.error(`[ensureModuleSchema:${moduleId}] Erro ao verificar esquema:`, err);
  }
}

