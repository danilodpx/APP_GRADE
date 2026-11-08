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

const M3_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS sch_rooms (
      id TEXT PRIMARY KEY,
      location_id TEXT NOT NULL,
      name TEXT NOT NULL,
      capacity INTEGER NOT NULL,
      floor_label TEXT,
      display_order INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1
  );`,
  `CREATE TABLE IF NOT EXISTS sch_cohorts (
      id TEXT PRIMARY KEY,
      location_id TEXT NOT NULL,
      code TEXT NOT NULL,
      symbolic_name TEXT,
      level_number INTEGER NOT NULL DEFAULT 1,
      principal_professor_id TEXT,
      principal_professor_name TEXT,
      monitor_name TEXT,
      scribe_name TEXT,
      cached_headcount INTEGER NOT NULL DEFAULT 0,
      start_date TEXT,
      estimated_end_date TEXT,
      is_active INTEGER NOT NULL DEFAULT 1
  );`,
  `CREATE TABLE IF NOT EXISTS sch_weeks (
      id TEXT PRIMARY KEY,
      location_id TEXT NOT NULL,
      week_start_date TEXT NOT NULL,
      week_end_date TEXT NOT NULL,
      label TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PUBLISHED' CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED'))
  );`,
  `CREATE TABLE IF NOT EXISTS sch_sessions (
      id TEXT PRIMARY KEY,
      location_id TEXT NOT NULL,
      week_id TEXT REFERENCES sch_weeks(id) ON DELETE CASCADE,
      base_session_id TEXT,
      is_overridden INTEGER NOT NULL DEFAULT 0,
      day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
      slot_label TEXT NOT NULL,
      start_minute INTEGER NOT NULL,
      end_minute INTEGER NOT NULL,
      room_id TEXT REFERENCES sch_rooms(id),
      subject_name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'Filosofia',
      professor_id TEXT,
      professor_name TEXT NOT NULL,
      substitute_professor_id TEXT,
      substitute_professor_name TEXT,
      is_bastiao INTEGER NOT NULL DEFAULT 0,
      event_status TEXT NOT NULL DEFAULT 'CONFIRMADO' CHECK (event_status IN ('CONFIRMADO', 'ALTERADO', 'CANCELADO', 'NAO_ALOCADO')),
      notes TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`,
  `CREATE TABLE IF NOT EXISTS sch_session_cohorts (
      session_id TEXT NOT NULL REFERENCES sch_sessions(id) ON DELETE CASCADE,
      cohort_id TEXT NOT NULL REFERENCES sch_cohorts(id) ON DELETE CASCADE,
      PRIMARY KEY (session_id, cohort_id)
  );`,
  `CREATE TABLE IF NOT EXISTS sch_snapshots (
      snapshot_key TEXT PRIMARY KEY,
      location_id TEXT NOT NULL,
      week_id TEXT,
      version_hash TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`,
  `CREATE INDEX IF NOT EXISTS idx_sch_sessions_prof_day ON sch_sessions(professor_id, day_of_week, start_minute, end_minute);`,
  `CREATE INDEX IF NOT EXISTS idx_sch_sessions_sub_day ON sch_sessions(substitute_professor_id, day_of_week, start_minute, end_minute);`,
  `CREATE INDEX IF NOT EXISTS idx_sch_sessions_loc_week ON sch_sessions(location_id, week_id, day_of_week, room_id);`,
  `INSERT OR IGNORE INTO sch_rooms (id, location_id, name, capacity, floor_label, display_order, is_active) VALUES
   ('ac-guinevere', 'aguas-claras', 'Guinevere', 44, '1º Andar', 1, 1),
   ('ac-percival', 'aguas-claras', 'Percival', 22, '1º Andar', 2, 1),
   ('ac-gawain', 'aguas-claras', 'Gawain', 22, '1º Andar', 3, 1),
   ('ac-galahad', 'aguas-claras', 'Galahad', 19, '2º Andar', 4, 1),
   ('ac-merlin', 'aguas-claras', 'Merlin', 14, '2º Andar', 5, 1),
   ('ac-lancelot', 'aguas-claras', 'Lancelot', 13, '2º Andar', 6, 1),
   ('ac-salao-camelot', 'aguas-claras', 'Salão Camelot', 80, 'Térreo', 7, 1),
   ('ac-biblioteca', 'aguas-claras', 'Biblioteca', 15, 'Térreo', 8, 1),
   ('sam-sala-1', 'samambaia', 'Sala Platão', 35, 'Térreo', 1, 1),
   ('sam-sala-2', 'samambaia', 'Sala Sócrates', 25, 'Térreo', 2, 1);`,
  `INSERT OR IGNORE INTO sch_cohorts (id, location_id, code, symbolic_name, level_number, principal_professor_id, principal_professor_name, cached_headcount, is_active) VALUES
   ('ac-T21A', 'aguas-claras', 'T21A', 'Sabedoria', 1, 'prof-gustavo', 'Gustavo', 28, 1),
   ('ac-T21B', 'aguas-claras', 'T21B', 'Harmonia', 1, 'prof-debora', 'Débora', 18, 1),
   ('ac-T32A', 'aguas-claras', 'T32A', 'Justiça', 2, 'prof-luisa', 'Luísa', 16, 1),
   ('ac-T41A', 'aguas-claras', 'T41A', 'Coragem', 3, 'prof-daysy', 'Daysy', 14, 1),
   ('ac-T52B', 'aguas-claras', 'T52B', 'Verdade', 4, 'prof-maria-clara', 'Maria Clara', 12, 1),
   ('sam-T10A', 'samambaia', 'T10A', 'Paz', 1, 'prof-daysy', 'Daysy', 20, 1);`,
  `INSERT OR IGNORE INTO sch_weeks (id, location_id, week_start_date, week_end_date, label, status) VALUES
   ('ac-2025-W39', 'aguas-claras', '2025-09-22', '2025-09-27', '22/09 a 27/09/2025', 'PUBLISHED'),
   ('sam-2025-W39', 'samambaia', '2025-09-22', '2025-09-27', '22/09 a 27/09/2025', 'PUBLISHED');`,
  `INSERT OR IGNORE INTO sch_sessions (id, location_id, week_id, day_of_week, slot_label, start_minute, end_minute, room_id, subject_name, category, professor_id, professor_name, is_bastiao, event_status) VALUES
   ('ses-mat-seg-1', 'aguas-claras', NULL, 1, '1º Horário', 1200, 1260, 'ac-guinevere', 'Ética e Moralidade', 'Filosofia', 'prof-gustavo', 'Gustavo', 0, 'CONFIRMADO'),
   ('ses-mat-seg-2', 'aguas-claras', NULL, 1, '2º Horário', 1270, 1330, 'ac-guinevere', 'Bhagavad Gita', 'Filosofia', 'prof-gustavo', 'Gustavo', 0, 'CONFIRMADO'),
   ('ses-mat-seg-3', 'aguas-claras', NULL, 1, '1º Horário', 1200, 1260, 'ac-percival', 'Simbologia do Antigo Egito', 'Filosofia', 'prof-debora', 'Débora', 0, 'CONFIRMADO'),
   ('ses-mat-ter-1', 'aguas-claras', NULL, 2, '1º Horário', 1200, 1260, 'ac-gawain', 'A Voz do Silêncio', 'Filosofia', 'prof-luisa', 'Luísa', 0, 'CONFIRMADO'),
   ('ses-mat-qua-1', 'aguas-claras', NULL, 3, '1º Horário', 1200, 1260, 'ac-galahad', 'Mito da Caverna de Platão', 'Filosofia', 'prof-daysy', 'Daysy', 0, 'CONFIRMADO'),
   ('ses-mat-qui-1', 'aguas-claras', NULL, 4, '1º Horário', 1200, 1260, 'ac-merlin', 'Aristóteles e a Metafísica', 'Filosofia', 'prof-gama', 'Gama', 0, 'CONFIRMADO'),
   ('ses-mat-sab-1', 'aguas-claras', NULL, 6, 'Matutino', 540, 660, 'ac-salao-camelot', 'Seminário Especial de Filosofia', 'Filosofia', 'prof-gustavo', 'Gustavo', 0, 'CONFIRMADO'),
   ('ses-mat-unsched-1', 'aguas-claras', NULL, 2, '2º Horário', 1270, 1330, NULL, 'Estudo de Textos Clássicos', 'Filosofia', 'prof-eduardo', 'Eduardo', 0, 'NAO_ALOCADO');`,
  `INSERT OR IGNORE INTO sch_session_cohorts (session_id, cohort_id) VALUES
   ('ses-mat-seg-1', 'ac-T21A'),
   ('ses-mat-seg-2', 'ac-T21A'),
   ('ses-mat-seg-3', 'ac-T21B'),
   ('ses-mat-ter-1', 'ac-T32A'),
   ('ses-mat-qua-1', 'ac-T41A'),
   ('ses-mat-qui-1', 'ac-T52B'),
   ('ses-mat-sab-1', 'ac-T21A'),
   ('ses-mat-sab-1', 'ac-T21B'),
   ('ses-mat-unsched-1', 'ac-T21B');`
];

const M4_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS stu_students (
      id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      location_id TEXT NOT NULL,
      cohort_code TEXT NOT NULL,
      course_track TEXT NOT NULL DEFAULT 'Filosofia Aplicada',
      role_in_cohort TEXT NOT NULL DEFAULT 'ALUNO' CHECK (role_in_cohort IN ('ALUNO', 'MONITOR', 'ESCRIBA')),
      progress_pct INTEGER NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
      financial_status TEXT NOT NULL DEFAULT 'EM_DIA' CHECK (financial_status IN ('EM_DIA', 'PENDENTE', 'ATRASADO', 'ISENTO')),
      monthly_fee_cents INTEGER NOT NULL DEFAULT 15000,
      due_day INTEGER NOT NULL DEFAULT 10,
      avatar_url TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`,
  `CREATE TABLE IF NOT EXISTS stu_financial_payments (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES stu_students(id) ON DELETE CASCADE,
      reference_month TEXT NOT NULL,
      amount_cents INTEGER NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('PAGO', 'PENDENTE', 'ATRASADO', 'CANCELADO')),
      paid_at TEXT,
      payment_method TEXT,
      notes TEXT,
      recorded_by_email TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );`,
  `CREATE INDEX IF NOT EXISTS idx_stu_cohort_status ON stu_students(location_id, cohort_code, is_active, financial_status);`,
  `CREATE INDEX IF NOT EXISTS idx_stu_payments_student ON stu_financial_payments(student_id, reference_month);`,
  `INSERT OR IGNORE INTO stu_students (id, full_name, email, phone, location_id, cohort_code, course_track, role_in_cohort, progress_pct, financial_status, monthly_fee_cents, due_day, avatar_url, is_active) VALUES
   ('stu-demo-t21a', 'Aluno T21A Demo', 'aluno.t21a@acropole.org.br', '(61) 98000-0001', 'aguas-claras', 'T21A', 'Filosofia Aplicada', 'ALUNO', 65, 'EM_DIA', 15000, 10, 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150', 1),
   ('stu-mariana-silva', 'Mariana Silva', 'mariana.silva@acropole.org.br', '(61) 98000-0002', 'aguas-claras', 'T21A', 'Filosofia Aplicada', 'ESCRIBA', 75, 'EM_DIA', 15000, 10, 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150', 1),
   ('stu-carlos-mendes', 'Carlos Mendes', 'carlos.mendes@acropole.org.br', '(61) 98000-0003', 'aguas-claras', 'T21B', 'Psicologia & Simbologia', 'ALUNO', 32, 'PENDENTE', 15000, 10, 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150', 1),
   ('stu-ana-costa', 'Ana Costa', 'ana.costa@acropole.org.br', '(61) 98000-0004', 'aguas-claras', 'T21A', 'Filosofia Aplicada', 'MONITOR', 90, 'EM_DIA', 15000, 10, 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150', 1),
   ('stu-rafael-souza', 'Rafael Souza', 'rafael.souza@acropole.org.br', '(61) 98000-0005', 'aguas-claras', 'T32A', 'História das Religiões', 'ALUNO', 15, 'ATRASADO', 15000, 10, 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150', 1),
   ('stu-beatriz-oliveira', 'Beatriz Oliveira', 'beatriz.oliveira@acropole.org.br', '(61) 98000-0006', 'aguas-claras', 'T21A', 'Filosofia Aplicada', 'ALUNO', 55, 'EM_DIA', 15000, 10, 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150', 1),
   ('stu-pedro-santos', 'Pedro Santos', 'pedro.santos@acropole.org.br', '(61) 98000-0007', 'samambaia', 'T10A', 'Ética e Moral', 'ALUNO', 48, 'PENDENTE', 15000, 10, 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150', 1),
   ('stu-julia-martins', 'Julia Martins', 'julia.martins@acropole.org.br', '(61) 98000-0008', 'aguas-claras', 'T41A', 'Filosofia Aplicada', 'ALUNO', 82, 'EM_DIA', 15000, 10, 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150', 1);`,
  `INSERT OR IGNORE INTO stu_financial_payments (id, student_id, reference_month, amount_cents, status, paid_at, payment_method, notes, recorded_by_email) VALUES
   ('pay-2025-01-demo', 'stu-demo-t21a', '2025-01', 15000, 'PAGO', '2025-01-09 14:22:00', 'PIX', 'Pagamento pontual via PIX QR Code', 'secretaria@acropole.org.br'),
   ('pay-2025-02-demo', 'stu-demo-t21a', '2025-02', 15000, 'PAGO', '2025-02-10 11:15:00', 'CARTAO', 'Cartão de Débito Secretaria', 'secretaria@acropole.org.br'),
   ('pay-2025-03-demo', 'stu-demo-t21a', '2025-03', 15000, 'PAGO', '2025-03-08 09:30:00', 'PIX', 'PIX automático', 'secretaria@acropole.org.br'),
   ('pay-2025-01-mariana', 'stu-mariana-silva', '2025-01', 15000, 'PAGO', '2025-01-08 16:00:00', 'PIX', 'Chave CNPJ', 'secretaria@acropole.org.br'),
   ('pay-2025-02-mariana', 'stu-mariana-silva', '2025-02', 15000, 'PAGO', '2025-02-09 10:40:00', 'PIX', 'PIX App', 'secretaria@acropole.org.br'),
   ('pay-2025-03-carlos', 'stu-carlos-mendes', '2025-03', 15000, 'PENDENTE', NULL, NULL, 'Aguardando vencimento em 10/03', 'secretaria@acropole.org.br'),
   ('pay-2025-02-rafael', 'stu-rafael-souza', '2025-02', 15000, 'ATRASADO', NULL, NULL, 'Mensalidade vencida sem comprovação', 'secretaria@acropole.org.br'),
   ('pay-2025-03-pedro', 'stu-pedro-santos', '2025-03', 15000, 'PENDENTE', NULL, NULL, 'Mensalidade gerada Samambaia', 'secretaria@acropole.org.br');`
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
      if (!schemaApplied.has('M1')) {
        await db.batch(M1_SCHEMA.map(sql => db.prepare(sql)));
        schemaApplied.add('M1');
      }
      const statements = M2_SCHEMA.map(sql => db.prepare(sql));
      await db.batch(statements);
    } else if (moduleId === 'M3') {
      if (!schemaApplied.has('M1')) {
        await db.batch(M1_SCHEMA.map(sql => db.prepare(sql)));
        schemaApplied.add('M1');
      }
      if (!schemaApplied.has('M2')) {
        await db.batch(M2_SCHEMA.map(sql => db.prepare(sql)));
        schemaApplied.add('M2');
      }
      const statements = M3_SCHEMA.map(sql => db.prepare(sql));
      await db.batch(statements);
    }
    schemaApplied.add(key);
  } catch (err) {
    console.error(`[ensureModuleSchema:${moduleId}] Erro ao verificar esquema:`, err);
  }
}

