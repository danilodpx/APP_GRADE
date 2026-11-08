-- Migração do Módulo 2 (mod-professors): Professores, Blocos Pessoais e Ausências
-- Banco Cloudflare D1 Único (nova-acropole-db)

CREATE TABLE IF NOT EXISTS prof_professors (
    id TEXT PRIMARY KEY,               -- ex: 'prof-gustavo', 'prof-debora'
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    specialty TEXT NOT NULL DEFAULT 'Filosofia',
    avatar_url TEXT,
    weekly_hours_target INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS prof_personal_blocks (
    id TEXT PRIMARY KEY,
    professor_id TEXT NOT NULL REFERENCES prof_professors(id) ON DELETE CASCADE,
    location_id TEXT NOT NULL,         -- Chave lógica para core_locations.id ('aguas-claras', 'samambaia')
    day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 7), -- ISO-8601: 1 = Segunda .. 6 = Sábado, 7 = Domingo
    start_minute INTEGER NOT NULL,     -- Minutos do dia (ex: 1110 = 18:30, 1140 = 19:00, 1200 = 20:00)
    end_minute INTEGER NOT NULL,       -- Minutos do dia (ex: 1170 = 19:30, 1260 = 21:00)
    block_type TEXT NOT NULL,          -- 'AULA', 'CAFE', 'RECEPCAO', 'ESTUDOS_SERIADOS', 'PEDAGOGOS'
    notes TEXT
);

CREATE TABLE IF NOT EXISTS prof_absences (
    id TEXT PRIMARY KEY,
    professor_id TEXT NOT NULL REFERENCES prof_professors(id) ON DELETE CASCADE,
    start_date TEXT NOT NULL,          -- YYYY-MM-DD
    end_date TEXT NOT NULL,            -- YYYY-MM-DD
    reason TEXT,
    default_substitute_id TEXT,        -- Chave lógica opcional para outro professor
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_prof_blocks_day ON prof_personal_blocks(professor_id, day_of_week, start_minute, end_minute);
CREATE INDEX IF NOT EXISTS idx_prof_absences_dates ON prof_absences(professor_id, start_date, end_date);

-- Seed dos Professores Reais da Operação 2025 (Nova Acrópole)
INSERT OR IGNORE INTO prof_professors (id, name, email, phone, specialty, weekly_hours_target, is_active) VALUES
('prof-gustavo', 'Gustavo', 'gustavo@acropole.org.br', '(61) 98111-0001', 'Filosofia / Ética', 12, 1),
('prof-debora', 'Débora', 'debora@acropole.org.br', '(61) 98111-0002', 'Filosofia / Simbologia', 10, 1),
('prof-luisa', 'Luísa', 'luisa@acropole.org.br', '(61) 98111-0003', 'Filosofia / Mitologia', 8, 1),
('prof-daysy', 'Daysy', 'daysy@acropole.org.br', '(61) 98111-0004', 'Filosofia / Psicologia', 10, 1),
('prof-maria-clara', 'Maria Clara', 'maria.clara@acropole.org.br', '(61) 98111-0005', 'Filosofia Aplicada', 8, 1),
('prof-gama', 'Gama', 'gama@acropole.org.br', '(61) 98111-0006', 'História da Filosofia', 10, 1),
('prof-eduardo', 'Eduardo', 'eduardo@acropole.org.br', '(61) 98111-0007', 'Pedagogia / Teoria do Conhecimento', 6, 1),
('prof-cintia', 'Cíntia', 'cintia@acropole.org.br', '(61) 98111-0008', 'Filosofia & Arte', 8, 1),
('prof-malu', 'Malu', 'malu@acropole.org.br', '(61) 98111-0009', 'Introdução à Filosofia', 8, 1);

-- Seed de Blocos Pessoais Recorrentes (Café, Recepção, Pedagogos, Estudos Seriados)
INSERT OR IGNORE INTO prof_personal_blocks (id, professor_id, location_id, day_of_week, start_minute, end_minute, block_type, notes) VALUES
('blk-gustavo-recep-seg', 'prof-gustavo', 'aguas-claras', 1, 1140, 1200, 'RECEPCAO', 'Recepção e acolhimento aos alunos novos'),
('blk-gustavo-pedag-qua', 'prof-gustavo', 'aguas-claras', 3, 1110, 1170, 'PEDAGOGOS', 'Reunião de alinhamento pedagógico'),
('blk-debora-cafe-ter', 'prof-debora', 'aguas-claras', 2, 1170, 1200, 'CAFE', 'Intervalo filosófico e atendimento'),
('blk-luisa-estudos-qui', 'prof-luisa', 'aguas-claras', 4, 1110, 1170, 'ESTUDOS_SERIADOS', 'Coordenação de estudos seriados'),
('blk-daysy-recep-sab', 'prof-daysy', 'samambaia', 6, 540, 600, 'RECEPCAO', 'Acolhimento matinal aos sábados');
