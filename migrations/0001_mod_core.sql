-- Migração do Módulo 1 (mod-core): Localidades e Usuários
-- Banco Cloudflare D1 Único (nova-acropole-db)

CREATE TABLE IF NOT EXISTS core_locations (
    id TEXT PRIMARY KEY,               -- 'aguas-claras', 'samambaia'
    name TEXT NOT NULL UNIQUE,         -- 'Águas Claras', 'Samambaia'
    slug TEXT NOT NULL UNIQUE,
    is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS core_users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,       -- pbkdf2$100000$<salt_hex>$<hash_hex> (PBKDF2-SHA256)
    mfa_code TEXT DEFAULT '000000',    -- Código de verificação visual preservado da tela original (screen.png)
    role TEXT NOT NULL CHECK (role IN ('ADMIN', 'SECRETARIA', 'PROFESSOR', 'ALUNO')),
    default_location_id TEXT NOT NULL DEFAULT 'aguas-claras',
    linked_entity_id TEXT,             -- ID lógico opcional do professor ou aluno
    avatar_url TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_core_users_email ON core_users(email);
CREATE INDEX IF NOT EXISTS idx_core_users_role ON core_users(role);

-- Seed de Localidades Iniciais (Águas Claras e Samambaia)
INSERT OR IGNORE INTO core_locations (id, name, slug, is_active) VALUES
('aguas-claras', 'Águas Claras', 'aguas-claras', 1),
('samambaia', 'Samambaia', 'samambaia', 1);

-- Seed de Usuários Iniciais (Senha padrão: Acropole@2025, MFA: 000000)
-- Hash PBKDF2-SHA256 gerado com 100.000 iterações: pbkdf2$100000$0123456789abcdeffedcba9876543210$26b89659d7a4ee8064ef78123c4d21f5a186de476cee86beb9a53e7b13aa86ed
INSERT OR IGNORE INTO core_users (id, name, email, password_hash, mfa_code, role, default_location_id, linked_entity_id, avatar_url, is_active) VALUES
('usr-admin', 'Coordenação Geral', 'admin@acropole.org.br', 'pbkdf2$100000$0123456789abcdeffedcba9876543210$26b89659d7a4ee8064ef78123c4d21f5a186de476cee86beb9a53e7b13aa86ed', '000000', 'ADMIN', 'aguas-claras', NULL, NULL, 1),
('usr-secretaria', 'Secretaria Nova Acrópole', 'secretaria@acropole.org.br', 'pbkdf2$100000$0123456789abcdeffedcba9876543210$26b89659d7a4ee8064ef78123c4d21f5a186de476cee86beb9a53e7b13aa86ed', '000000', 'SECRETARIA', 'aguas-claras', NULL, NULL, 1),
('usr-gustavo', 'Prof. Gustavo', 'gustavo@acropole.org.br', 'pbkdf2$100000$0123456789abcdeffedcba9876543210$26b89659d7a4ee8064ef78123c4d21f5a186de476cee86beb9a53e7b13aa86ed', '000000', 'PROFESSOR', 'aguas-claras', 'prof-gustavo', NULL, 1),
('usr-aluno-t21a', 'Aluno T21A', 'aluno.t21a@acropole.org.br', 'pbkdf2$100000$0123456789abcdeffedcba9876543210$26b89659d7a4ee8064ef78123c4d21f5a186de476cee86beb9a53e7b13aa86ed', '000000', 'ALUNO', 'aguas-claras', 'stu-demo-t21a', NULL, 1);

