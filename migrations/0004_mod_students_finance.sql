-- Migração do Módulo 4 (mod-students-finance): Alunos, Papéis e Controle Financeiro / Mensalidades
-- Banco Cloudflare D1 Único (nova-acropole-db)

CREATE TABLE IF NOT EXISTS stu_students (
    id TEXT PRIMARY KEY,               -- ex: 'stu-mariana-silva', 'stu-demo-t21a'
    full_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    location_id TEXT NOT NULL,         -- Chave lógica ('aguas-claras', 'samambaia')
    cohort_code TEXT NOT NULL,         -- Chave lógica ('T21A', 'T21B', 'T32A', 'T41A', 'T52B', 'T10A') — sem FK rígida para M3
    course_track TEXT NOT NULL DEFAULT 'Filosofia Aplicada',
    role_in_cohort TEXT NOT NULL DEFAULT 'ALUNO' CHECK (role_in_cohort IN ('ALUNO', 'MONITOR', 'ESCRIBA')),
    progress_pct INTEGER NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
    financial_status TEXT NOT NULL DEFAULT 'EM_DIA' CHECK (financial_status IN ('EM_DIA', 'PENDENTE', 'ATRASADO', 'ISENTO')),
    monthly_fee_cents INTEGER NOT NULL DEFAULT 15000, -- R$ 150,00
    due_day INTEGER NOT NULL DEFAULT 10,
    avatar_url TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stu_financial_payments (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL REFERENCES stu_students(id) ON DELETE CASCADE,
    reference_month TEXT NOT NULL,     -- 'YYYY-MM'
    amount_cents INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('PAGO', 'PENDENTE', 'ATRASADO', 'CANCELADO')),
    paid_at TEXT,
    payment_method TEXT,               -- 'PIX', 'CARTAO', 'DINHEIRO', 'BOLETO'
    notes TEXT,
    recorded_by_email TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_stu_cohort_status ON stu_students(location_id, cohort_code, is_active, financial_status);
CREATE INDEX IF NOT EXISTS idx_stu_payments_student ON stu_financial_payments(student_id, reference_month);

-- Seed de Alunos Reais da Operação 2025 (Águas Claras e Samambaia)
INSERT OR IGNORE INTO stu_students (id, full_name, email, phone, location_id, cohort_code, course_track, role_in_cohort, progress_pct, financial_status, monthly_fee_cents, due_day, avatar_url, is_active) VALUES
('stu-demo-t21a', 'Aluno T21A Demo', 'aluno.t21a@acropole.org.br', '(61) 98000-0001', 'aguas-claras', 'T21A', 'Filosofia Aplicada', 'ALUNO', 65, 'EM_DIA', 15000, 10, 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150', 1),
('stu-mariana-silva', 'Mariana Silva', 'mariana.silva@acropole.org.br', '(61) 98000-0002', 'aguas-claras', 'T21A', 'Filosofia Aplicada', 'ESCRIBA', 75, 'EM_DIA', 15000, 10, 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150', 1),
('stu-carlos-mendes', 'Carlos Mendes', 'carlos.mendes@acropole.org.br', '(61) 98000-0003', 'aguas-claras', 'T21B', 'Psicologia & Simbologia', 'ALUNO', 32, 'PENDENTE', 15000, 10, 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150', 1),
('stu-ana-costa', 'Ana Costa', 'ana.costa@acropole.org.br', '(61) 98000-0004', 'aguas-claras', 'T21A', 'Filosofia Aplicada', 'MONITOR', 90, 'EM_DIA', 15000, 10, 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150', 1),
('stu-rafael-souza', 'Rafael Souza', 'rafael.souza@acropole.org.br', '(61) 98000-0005', 'aguas-claras', 'T32A', 'História das Religiões', 'ALUNO', 15, 'ATRASADO', 15000, 10, 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150', 1),
('stu-beatriz-oliveira', 'Beatriz Oliveira', 'beatriz.oliveira@acropole.org.br', '(61) 98000-0006', 'aguas-claras', 'T21A', 'Filosofia Aplicada', 'ALUNO', 55, 'EM_DIA', 15000, 10, 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150', 1),
('stu-pedro-santos', 'Pedro Santos', 'pedro.santos@acropole.org.br', '(61) 98000-0007', 'samambaia', 'T10A', 'Ética e Moral', 'ALUNO', 48, 'PENDENTE', 15000, 10, 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150', 1),
('stu-julia-martins', 'Julia Martins', 'julia.martins@acropole.org.br', '(61) 98000-0008', 'aguas-claras', 'T41A', 'Filosofia Aplicada', 'ALUNO', 82, 'EM_DIA', 15000, 10, 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150', 1);

-- Seed de Pagamentos e Mensalidades Iniciais (2025)
INSERT OR IGNORE INTO stu_financial_payments (id, student_id, reference_month, amount_cents, status, paid_at, payment_method, notes, recorded_by_email) VALUES
('pay-2025-01-demo', 'stu-demo-t21a', '2025-01', 15000, 'PAGO', '2025-01-09 14:22:00', 'PIX', 'Pagamento pontual via PIX QR Code', 'secretaria@acropole.org.br'),
('pay-2025-02-demo', 'stu-demo-t21a', '2025-02', 15000, 'PAGO', '2025-02-10 11:15:00', 'CARTAO', 'Cartão de Débito Secretaria', 'secretaria@acropole.org.br'),
('pay-2025-03-demo', 'stu-demo-t21a', '2025-03', 15000, 'PAGO', '2025-03-08 09:30:00', 'PIX', 'PIX automático', 'secretaria@acropole.org.br'),
('pay-2025-01-mariana', 'stu-mariana-silva', '2025-01', 15000, 'PAGO', '2025-01-08 16:00:00', 'PIX', 'Chave CNPJ', 'secretaria@acropole.org.br'),
('pay-2025-02-mariana', 'stu-mariana-silva', '2025-02', 15000, 'PAGO', '2025-02-09 10:40:00', 'PIX', 'PIX App', 'secretaria@acropole.org.br'),
('pay-2025-03-carlos', 'stu-carlos-mendes', '2025-03', 15000, 'PENDENTE', NULL, NULL, 'Aguardando vencimento em 10/03', 'secretaria@acropole.org.br'),
('pay-2025-02-rafael', 'stu-rafael-souza', '2025-02', 15000, 'ATRASADO', NULL, NULL, 'Mensalidade vencida sem comprovação', 'secretaria@acropole.org.br'),
('pay-2025-03-pedro', 'stu-pedro-santos', '2025-03', 15000, 'PENDENTE', NULL, NULL, 'Mensalidade gerada Samambaia', 'secretaria@acropole.org.br');

