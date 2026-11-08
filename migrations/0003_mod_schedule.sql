-- Migração do Módulo 3 (mod-schedule-kanban): Salas, Turmas, Semanas, Grade Horária, Bastião e Snapshots
-- Banco Cloudflare D1 Único (nova-acropole-db)

CREATE TABLE IF NOT EXISTS sch_rooms (
    id TEXT PRIMARY KEY,               -- ex: 'ac-guinevere', 'ac-percival', 'sam-sala1'
    location_id TEXT NOT NULL,         -- Chave lógica ('aguas-claras', 'samambaia')
    name TEXT NOT NULL,                -- 'Guinevere', 'Percival', 'Gawain', 'Galahad', 'Merlin', 'Lancelot', 'Salão Camelot (Térreo)'
    capacity INTEGER NOT NULL,         -- 44, 22, 22, 19, 14, 13, 80
    floor_label TEXT,
    display_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS sch_cohorts (
    id TEXT PRIMARY KEY,               -- ex: 'ac-T21A'
    location_id TEXT NOT NULL,
    code TEXT NOT NULL,                -- ex: 'T21A', 'T32A'
    symbolic_name TEXT,                -- ex: '"Sabedoria"', '"Harmonia"'
    level_number INTEGER NOT NULL DEFAULT 1,
    principal_professor_id TEXT,       -- Chave lógica opcional para prof_professors.id
    principal_professor_name TEXT,     -- Desnormalizado para funcionamento independente de M2
    monitor_name TEXT,
    scribe_name TEXT,
    cached_headcount INTEGER NOT NULL DEFAULT 0,
    start_date TEXT,
    estimated_end_date TEXT,
    is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS sch_weeks (
    id TEXT PRIMARY KEY,               -- ex: 'ac-2025-W39'
    location_id TEXT NOT NULL,
    week_start_date TEXT NOT NULL,
    week_end_date TEXT NOT NULL,
    label TEXT NOT NULL,               -- ex: '22/09 a 27/09/2025'
    status TEXT NOT NULL DEFAULT 'PUBLISHED' CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED'))
);

CREATE TABLE IF NOT EXISTS sch_sessions (
    id TEXT PRIMARY KEY,
    location_id TEXT NOT NULL,
    week_id TEXT REFERENCES sch_weeks(id) ON DELETE CASCADE, -- NULL = Grade Matriz Permanente
    base_session_id TEXT,              -- Aponta para sch_sessions.id da Grade Matriz quando clonada para Semana Específica
    is_overridden INTEGER NOT NULL DEFAULT 0,
    day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 7), -- 1 = Segunda .. 6 = Sábado, 7 = Domingo
    slot_label TEXT NOT NULL,          -- '1º Horário', '2º Horário', 'Yoga', 'Complementar', 'Evento'
    start_minute INTEGER NOT NULL,     -- 1200 (20:00), 1270 (21:10)
    end_minute INTEGER NOT NULL,       -- 1260 (21:00), 1330 (22:10)
    room_id TEXT REFERENCES sch_rooms(id), -- NULL quando na gaveta lateral (NAO_ALOCADO)
    subject_name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'Filosofia',
    professor_id TEXT,                 -- Chave lógica para prof_professors.id
    professor_name TEXT NOT NULL,      -- Desnormalizado
    substitute_professor_id TEXT,
    substitute_professor_name TEXT,
    is_bastiao INTEGER NOT NULL DEFAULT 0,
    event_status TEXT NOT NULL DEFAULT 'CONFIRMADO' CHECK (event_status IN ('CONFIRMADO', 'ALTERADO', 'CANCELADO', 'NAO_ALOCADO')),
    notes TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sch_session_cohorts (
    session_id TEXT NOT NULL REFERENCES sch_sessions(id) ON DELETE CASCADE,
    cohort_id TEXT NOT NULL REFERENCES sch_cohorts(id) ON DELETE CASCADE,
    PRIMARY KEY (session_id, cohort_id)
);

CREATE TABLE IF NOT EXISTS sch_snapshots (
    snapshot_key TEXT PRIMARY KEY,     -- ex: 'aguas-claras:matrix' ou 'aguas-claras:ac-2025-W39'
    location_id TEXT NOT NULL,
    week_id TEXT,
    version_hash TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sch_sessions_prof_day ON sch_sessions(professor_id, day_of_week, start_minute, end_minute);
CREATE INDEX IF NOT EXISTS idx_sch_sessions_sub_day ON sch_sessions(substitute_professor_id, day_of_week, start_minute, end_minute);
CREATE INDEX IF NOT EXISTS idx_sch_sessions_loc_week ON sch_sessions(location_id, week_id, day_of_week, room_id);
CREATE INDEX IF NOT EXISTS idx_sch_rooms_loc ON sch_rooms(location_id, is_active, display_order);
CREATE INDEX IF NOT EXISTS idx_sch_cohorts_loc ON sch_cohorts(location_id, is_active, code);

-- Seed de Salas Reais (Sede Águas Claras e Samambaia)
INSERT OR IGNORE INTO sch_rooms (id, location_id, name, capacity, floor_label, display_order, is_active) VALUES
('ac-guinevere', 'aguas-claras', 'Guinevere', 44, '1º Andar', 1, 1),
('ac-percival', 'aguas-claras', 'Percival', 22, '1º Andar', 2, 1),
('ac-gawain', 'aguas-claras', 'Gawain', 22, '1º Andar', 3, 1),
('ac-galahad', 'aguas-claras', 'Galahad', 19, '2º Andar', 4, 1),
('ac-merlin', 'aguas-claras', 'Merlin', 14, '2º Andar', 5, 1),
('ac-lancelot', 'aguas-claras', 'Lancelot', 13, '2º Andar', 6, 1),
('ac-salao-camelot', 'aguas-claras', 'Salão Camelot', 80, 'Térreo', 7, 1),
('ac-biblioteca', 'aguas-claras', 'Biblioteca', 15, 'Térreo', 8, 1),
('sam-sala-1', 'samambaia', 'Sala Platão', 35, 'Térreo', 1, 1),
('sam-sala-2', 'samambaia', 'Sala Sócrates', 25, 'Térreo', 2, 1);

-- Seed de Turmas Ativas (2025)
INSERT OR IGNORE INTO sch_cohorts (id, location_id, code, symbolic_name, level_number, principal_professor_id, principal_professor_name, cached_headcount, is_active) VALUES
('ac-T21A', 'aguas-claras', 'T21A', 'Sabedoria', 1, 'prof-gustavo', 'Gustavo', 28, 1),
('ac-T21B', 'aguas-claras', 'T21B', 'Harmonia', 1, 'prof-debora', 'Débora', 18, 1),
('ac-T32A', 'aguas-claras', 'T32A', 'Justiça', 2, 'prof-luisa', 'Luísa', 16, 1),
('ac-T41A', 'aguas-claras', 'T41A', 'Coragem', 3, 'prof-daysy', 'Daysy', 14, 1),
('ac-T52B', 'aguas-claras', 'T52B', 'Verdade', 4, 'prof-maria-clara', 'Maria Clara', 12, 1),
('sam-T10A', 'samambaia', 'T10A', 'Paz', 1, 'prof-daysy', 'Daysy', 20, 1);

-- Seed da Semana 22/09 a 27/09/2025
INSERT OR IGNORE INTO sch_weeks (id, location_id, week_start_date, week_end_date, label, status) VALUES
('ac-2025-W39', 'aguas-claras', '2025-09-22', '2025-09-27', '22/09 a 27/09/2025', 'PUBLISHED'),
('sam-2025-W39', 'samambaia', '2025-09-22', '2025-09-27', '22/09 a 27/09/2025', 'PUBLISHED');

-- Seed de Aulas da Grade Matriz Permanente (week_id = NULL)
-- 20:00 às 21:00 (1200 a 1260) [1º Horário] e 21:10 às 22:10 (1270 a 1330) [2º Horário]
INSERT OR IGNORE INTO sch_sessions (id, location_id, week_id, day_of_week, slot_label, start_minute, end_minute, room_id, subject_name, category, professor_id, professor_name, is_bastiao, event_status) VALUES
('ses-mat-seg-1', 'aguas-claras', NULL, 1, '1º Horário', 1200, 1260, 'ac-guinevere', 'Ética e Moralidade', 'Filosofia', 'prof-gustavo', 'Gustavo', 0, 'CONFIRMADO'),
('ses-mat-seg-2', 'aguas-claras', NULL, 1, '2º Horário', 1270, 1330, 'ac-guinevere', 'Bhagavad Gita', 'Filosofia', 'prof-gustavo', 'Gustavo', 0, 'CONFIRMADO'),
('ses-mat-seg-3', 'aguas-claras', NULL, 1, '1º Horário', 1200, 1260, 'ac-percival', 'Simbologia do Antigo Egito', 'Filosofia', 'prof-debora', 'Débora', 0, 'CONFIRMADO'),
('ses-mat-ter-1', 'aguas-claras', NULL, 2, '1º Horário', 1200, 1260, 'ac-gawain', 'A Voz do Silêncio', 'Filosofia', 'prof-luisa', 'Luísa', 0, 'CONFIRMADO'),
('ses-mat-qua-1', 'aguas-claras', NULL, 3, '1º Horário', 1200, 1260, 'ac-galahad', 'Mito da Caverna de Platão', 'Filosofia', 'prof-daysy', 'Daysy', 0, 'CONFIRMADO'),
('ses-mat-qui-1', 'aguas-claras', NULL, 4, '1º Horário', 1200, 1260, 'ac-merlin', 'Aristóteles e a Metafísica', 'Filosofia', 'prof-gama', 'Gama', 0, 'CONFIRMADO'),
('ses-mat-sab-1', 'aguas-claras', NULL, 6, 'Matutino', 540, 660, 'ac-salao-camelot', 'Seminário Especial de Filosofia', 'Filosofia', 'prof-gustavo', 'Gustavo', 0, 'CONFIRMADO'),
-- Sessão na gaveta lateral (não alocada)
('ses-mat-unsched-1', 'aguas-claras', NULL, 2, '2º Horário', 1270, 1330, NULL, 'Estudo de Textos Clássicos', 'Filosofia', 'prof-eduardo', 'Eduardo', 0, 'NAO_ALOCADO');

-- Vincula Sessões às Turmas
INSERT OR IGNORE INTO sch_session_cohorts (session_id, cohort_id) VALUES
('ses-mat-seg-1', 'ac-T21A'),
('ses-mat-seg-2', 'ac-T21A'),
('ses-mat-seg-3', 'ac-T21B'),
('ses-mat-ter-1', 'ac-T32A'),
('ses-mat-qua-1', 'ac-T41A'),
('ses-mat-qui-1', 'ac-T52B'),
('ses-mat-sab-1', 'ac-T21A'),
('ses-mat-sab-1', 'ac-T21B'),
('ses-mat-unsched-1', 'ac-T21B');

