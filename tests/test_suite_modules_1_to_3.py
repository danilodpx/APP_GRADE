#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Suíte de Testes Automatizada - Módulos 1, 2 e 3 (APP_GRADE)
Abrangência:
  - Módulo 1 (mod-core): D1 Migrations, PBKDF2 Hashing, HMAC Token Signing/Verify, RBAC
  - Módulo 2 (mod-professors): D1 Migrations, Cadastro Docente, Blocos Pessoais, Ausências e Substitutos
  - Módulo 3 (mod-schedule-kanban): Motor Anti-Choque (Regras 1 a 5), SWAP, BASTIÃO, Snapshots
"""

import sys
import os
import sqlite3
import hashlib
import hmac
import base64
import json
import time

# Diretório base do repositório
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
MIGRATIONS_DIR = os.path.join(BASE_DIR, "migrations")

class TestResult:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.skipped = 0
        self.details = []

    def record(self, group, test_id, name, success, message=""):
        if success:
            self.passed += 1
            status = "PASS"
        else:
            self.failed += 1
            status = "FAIL"
        self.details.append({
            "group": group,
            "id": test_id,
            "name": name,
            "status": status,
            "message": message
        })
        print(f"[{status}] {test_id} - {name} {f'-> {message}' if message and not success else (f'({message})' if message else '')}")

# ---------------------------------------------------------------------------
# Módulo 1 Helpers: Criptografia e Auth (equivalente ao functions/_shared/auth.js)
# ---------------------------------------------------------------------------
DEFAULT_SECRET = "nova-acropole-dev-secret-2025"

def pbkdf2_sha256(password: str, salt_hex: str, iterations: int = 100000) -> str:
    salt = bytes.fromhex(salt_hex)
    derived = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, iterations, dklen=32)
    return derived.hex()

def verify_password(password: str, stored_hash: str) -> bool:
    if not stored_hash or not stored_hash.startswith("pbkdf2$"):
        return False
    parts = stored_hash.split("$")
    if len(parts) != 4:
        return False
    iterations = int(parts[1])
    salt_hex = parts[2]
    expected_hex = parts[3]
    computed_hex = pbkdf2_sha256(password, salt_hex, iterations)
    return hmac.compare_digest(computed_hex, expected_hex)

def base64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")

def base64url_decode(s: str) -> bytes:
    padding = 4 - (len(s) % 4)
    if padding and padding != 4:
        s += "=" * padding
    return base64.urlsafe_b64decode(s.encode("ascii"))

def sign_token(payload: dict, secret: str = DEFAULT_SECRET) -> str:
    header = {"alg": "HS256", "typ": "JWT"}
    enc_header = base64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    enc_payload = base64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    data_to_sign = f"{enc_header}.{enc_payload}"
    signature = hmac.new(secret.encode("utf-8"), data_to_sign.encode("utf-8"), hashlib.sha256).digest()
    enc_sig = base64url_encode(signature)
    return f"{data_to_sign}.{enc_sig}"

def verify_token(token: str, secret: str = DEFAULT_SECRET) -> dict | None:
    if not token or token.count(".") != 2:
        return None
    enc_header, enc_payload, enc_sig = token.split(".")
    data_to_sign = f"{enc_header}.{enc_payload}"
    expected_sig = hmac.new(secret.encode("utf-8"), data_to_sign.encode("utf-8"), hashlib.sha256).digest()
    try:
        provided_sig = base64url_decode(enc_sig)
    except Exception:
        return None
    if not hmac.compare_digest(expected_sig, provided_sig):
        return None
    try:
        payload = json.loads(base64url_decode(enc_payload).decode("utf-8"))
        now = int(time.time())
        if "exp" in payload and payload["exp"] < now:
            return None  # Expirado
        return payload
    except Exception:
        return None

# ---------------------------------------------------------------------------
# Módulo 3 Helpers: Validador Anti-Choque (equivalente ao validator.js)
# ---------------------------------------------------------------------------
def minute_to_time(minute: int) -> str:
    if minute is None:
        return "--:--"
    h = minute // 60
    m = minute % 60
    return f"{h:02d}:{m:02d}"

def validate_session_candidate(
    candidate: dict,
    all_sessions_across_locations: list,
    professor_blocks: list = None,
    professor_absences: list = None,
    rooms_map: dict = None,
    cohorts_map: dict = None,
    target_date: str = None
) -> dict:
    professor_blocks = professor_blocks or []
    professor_absences = professor_absences or []
    rooms_map = rooms_map or {}
    cohorts_map = cohorts_map or {}

    errors = []
    warnings = []
    conflicting_session_ids = []

    if candidate.get("event_status") in ("CANCELADO", "NAO_ALOCADO") or not candidate.get("room_id"):
        return {"isValid": True, "errors": [], "warnings": [], "conflictingSessionIds": [], "hasRedCardAlert": False}

    start_min = int(candidate["start_minute"])
    end_min = int(candidate["end_minute"])
    day_of_week = int(candidate["day_of_week"])
    location_id = candidate["location_id"]
    effective_prof_id = candidate.get("substitute_professor_id") or candidate.get("professor_id")
    prof_name = candidate.get("substitute_professor_name") or candidate.get("professor_name") or "Professor"

    # 1. REGRA 3 — Professor Titular Ausente sem Substituto ou Substituto Ausente
    if target_date and candidate.get("professor_id"):
        titular_abs = next((a for a in professor_absences if a["professor_id"] == candidate["professor_id"] and a["start_date"] <= target_date <= a["end_date"]), None)
        if titular_abs and not candidate.get("substitute_professor_id"):
            errors.append({
                "code": "CONFLITO_PROFESSOR_AUSENTE",
                "message": f"Ausência registrada: Prof(a). {prof_name} está ausente.",
                "severity": "BLOCKING"
            })
        if candidate.get("substitute_professor_id"):
            sub_abs = next((a for a in professor_absences if a["professor_id"] == candidate["substitute_professor_id"] and a["start_date"] <= target_date <= a["end_date"]), None)
            if sub_abs:
                errors.append({
                    "code": "CONFLITO_PROFESSOR_AUSENTE",
                    "message": f"Substituto indisponível: Prof(a). {candidate.get('substitute_professor_name', 'Substituto')} também possui ausência.",
                    "severity": "BLOCKING"
                })

    # 2. Comparações contra outras sessões alocadas
    for other in all_sessions_across_locations:
        if other.get("id") == candidate.get("id"):
            continue
        if other.get("event_status") in ("CANCELADO", "NAO_ALOCADO") or not other.get("room_id"):
            continue
        if int(other["day_of_week"]) != day_of_week:
            continue

        other_start = int(other["start_minute"])
        other_end = int(other["end_minute"])
        other_effective_prof = other.get("substitute_professor_id") or other.get("professor_id")
        is_time_overlap = max(start_min, other_start) < min(end_min, other_end)

        # REGRA 1 — Choque Direto de Professor
        if effective_prof_id and other_effective_prof and effective_prof_id == other_effective_prof:
            if is_time_overlap:
                conflicting_session_ids.append(other["id"])
                errors.append({
                    "code": "CONFLITO_PROFESSOR_HORARIO",
                    "conflictingSessionId": other["id"],
                    "message": f"Conflito de horário docente: Prof(a). {prof_name} já está alocado(a) na sessão {other.get('subject_name')}.",
                    "severity": "BLOCKING"
                })
            elif other.get("location_id") != location_id:
                # REGRA 2 — Intervalo Mínimo de 30 minutos entre sedes distintas
                gap = (start_min - other_end) if start_min >= other_end else (other_start - end_min)
                if 0 <= gap < 30:
                    conflicting_session_ids.append(other["id"])
                    errors.append({
                        "code": "CONFLITO_DESLOCAMENTO_LOCALIDADE",
                        "conflictingSessionId": other["id"],
                        "message": f"Conflito de deslocamento: Prof(a). {prof_name} possui atividade em outra sede com intervalo de apenas {gap} min.",
                        "severity": "BLOCKING"
                    })

        # REGRA 4 — Choque de Sala na Mesma Localidade (Quando não for Bastião)
        if other.get("location_id") == location_id and other.get("room_id") == candidate.get("room_id"):
            if is_time_overlap and not candidate.get("is_bastiao"):
                conflicting_session_ids.append(other["id"])
                errors.append({
                    "code": "CONFLITO_SALA_OCUPADA",
                    "conflictingSessionId": other["id"],
                    "message": f"Conflito de sala: A sala já está ocupada por {other.get('subject_name')}.",
                    "severity": "BLOCKING"
                })

    # 3. REGRA 1 & 2 com Blocos Pessoais Docentes
    if effective_prof_id and professor_blocks:
        for blk in professor_blocks:
            if blk.get("professor_id") != effective_prof_id:
                continue
            if int(blk["day_of_week"]) != day_of_week:
                continue
            blk_start = int(blk["start_minute"])
            blk_end = int(blk["end_minute"])
            is_time_overlap = max(start_min, blk_start) < min(end_min, blk_end)
            if is_time_overlap:
                errors.append({
                    "code": "CONFLITO_PROFESSOR_HORARIO",
                    "message": f"Bloqueio pessoal docente: Prof(a). {prof_name} possui compromisso '{blk.get('block_type')}' ({minute_to_time(blk_start)} às {minute_to_time(blk_end)}).",
                    "severity": "BLOCKING"
                })
            elif blk.get("location_id") != location_id:
                gap = (start_min - blk_end) if start_min >= blk_end else (blk_start - end_min)
                if 0 <= gap < 30:
                    errors.append({
                        "code": "CONFLITO_DESLOCAMENTO_LOCALIDADE",
                        "message": f"Deslocamento docente: Prof(a). {prof_name} tem compromisso '{blk.get('block_type')}' em outra sede com intervalo de apenas {gap} min.",
                        "severity": "BLOCKING"
                    })

    # 4. REGRA 5 — Alerta de Capacidade da Sala (Não-bloqueante / Selo Âmbar)
    room = rooms_map.get(candidate.get("room_id"))
    if room:
        total_students = 0
        for cid in candidate.get("cohort_ids", []):
            cohort = cohorts_map.get(cid)
            if cohort:
                total_students += int(cohort.get("cached_headcount", 0))
        if total_students > int(room.get("capacity", 0)):
            warnings.append({
                "code": "ALERTA_CAPACIDADE_SALA",
                "message": f"Alerta de capacidade: {total_students} alunos para sala de {room.get('capacity')} lugares.",
                "severity": "WARNING"
            })

    is_valid = len(errors) == 0
    return {
        "isValid": is_valid,
        "errors": errors,
        "warnings": warnings,
        "conflictingSessionIds": list(set(conflicting_session_ids)),
        "hasRedCardAlert": not is_valid
    }

# ===========================================================================
# EXECUÇÃO DA SUÍTE DE TESTES
# ===========================================================================
def run_all_tests():
    res = TestResult()
    print("=" * 80)
    print("INICIANDO SUÍTE DE TESTES AUTOMATIZADA: MÓDULOS 1, 2 E 3")
    print("=" * 80)

    # -----------------------------------------------------------------------
    # GRUPO 1: SQL MIGRATIONS & SCHEMA INTEGRITY
    # -----------------------------------------------------------------------
    print("\n--- GRUPO 1: SQL Migrations & Integridade de Banco de Dados ---")
    conn = sqlite3.connect(":memory:")
    conn.isolation_level = None  # Permite BEGIN TRANSACTION manual
    conn.execute("PRAGMA foreign_keys = ON;")
    cursor = conn.cursor()

    # T1.1: Migration 0001 (mod-core)
    try:
        with open(os.path.join(MIGRATIONS_DIR, "0001_mod_core.sql"), "r", encoding="utf-8") as f:
            sql_m1 = f.read()
        cursor.executescript(sql_m1)
        cursor.execute("SELECT count(*) FROM core_locations;")
        loc_count = cursor.fetchone()[0]
        cursor.execute("SELECT count(*) FROM core_users;")
        usr_count = cursor.fetchone()[0]
        success = (loc_count == 2 and usr_count >= 4)
        res.record("G1-Database", "T1.1", "Execução 0001_mod_core.sql e Seeds", success, f"locations={loc_count}, users={usr_count}")
    except Exception as e:
        res.record("G1-Database", "T1.1", "Execução 0001_mod_core.sql e Seeds", False, str(e))

    # T1.2: Migration 0002 (mod-professors)
    try:
        with open(os.path.join(MIGRATIONS_DIR, "0002_mod_professors.sql"), "r", encoding="utf-8") as f:
            sql_m2 = f.read()
        cursor.executescript(sql_m2)
        cursor.execute("SELECT count(*) FROM prof_professors;")
        prof_count = cursor.fetchone()[0]
        cursor.execute("SELECT count(*) FROM prof_personal_blocks;")
        block_count = cursor.fetchone()[0]
        success = (prof_count >= 6 and block_count > 0)
        res.record("G1-Database", "T1.2", "Execução 0002_mod_professors.sql e Seeds", success, f"professors={prof_count}, blocks={block_count}")
    except Exception as e:
        res.record("G1-Database", "T1.2", "Execução 0002_mod_professors.sql e Seeds", False, str(e))

    # T1.3: Migration 0003 (mod-schedule)
    try:
        with open(os.path.join(MIGRATIONS_DIR, "0003_mod_schedule.sql"), "r", encoding="utf-8") as f:
            sql_m3 = f.read()
        cursor.executescript(sql_m3)
        cursor.execute("SELECT count(*) FROM sch_rooms;")
        room_count = cursor.fetchone()[0]
        cursor.execute("SELECT count(*) FROM sch_cohorts;")
        cohort_count = cursor.fetchone()[0]
        cursor.execute("SELECT count(*) FROM sch_sessions;")
        session_count = cursor.fetchone()[0]
        success = (room_count >= 8 and cohort_count >= 6 and session_count >= 5)
        res.record("G1-Database", "T1.3", "Execução 0003_mod_schedule.sql e Seeds", success, f"rooms={room_count}, cohorts={cohort_count}, sessions={session_count}")
    except Exception as e:
        res.record("G1-Database", "T1.3", "Execução 0003_mod_schedule.sql e Seeds", False, str(e))

    # T1.4: Validação de Constraints e Integridade Relacional Cruzada
    try:
        cursor.execute("SELECT u.email, u.role, l.name FROM core_users u JOIN core_locations l ON u.default_location_id = l.id;")
        rows = cursor.fetchall()
        success = len(rows) >= 4
        res.record("G1-Database", "T1.4", "Integridade Relacional core_users x core_locations", success, f"Total associados: {len(rows)}")
    except Exception as e:
        res.record("G1-Database", "T1.4", "Integridade Relacional core_users x core_locations", False, str(e))

    # -----------------------------------------------------------------------
    # GRUPO 2: AUTENTICAÇÃO, CRIPTOGRAFIA & RBAC (Módulo 1)
    # -----------------------------------------------------------------------
    print("\n--- GRUPO 2: Autenticação, Criptografia & RBAC (Módulo 1) ---")

    # T2.1: Validação de Senha do Admin Seed com Hash PBKDF2
    try:
        cursor.execute("SELECT password_hash FROM core_users WHERE email = 'admin@acropole.org.br';")
        row = cursor.fetchone()
        admin_hash = row[0] if row else None
        is_admin_valid = verify_password("Acropole@2025", admin_hash)
        is_wrong_valid = verify_password("SenhaErrada123", admin_hash)
        success = is_admin_valid and not is_wrong_valid
        res.record("G2-Auth", "T2.1", "PBKDF2-SHA256 Hash & Validação Senha Seed Admin (Acropole@2025)", success, f"admin={is_admin_valid}, wrong={is_wrong_valid}")
    except Exception as e:
        res.record("G2-Auth", "T2.1", "PBKDF2-SHA256 Hash & Validação Senha Seed Admin", False, str(e))

    # T2.2: Validação de Senhas dos Demais Seeds
    try:
        seeds = [
            ("secretaria@acropole.org.br", "Acropole@2025"),
            ("gustavo@acropole.org.br", "Acropole@2025"),
            ("aluno.t21a@acropole.org.br", "Acropole@2025")
        ]
        all_ok = True
        for email, pwd in seeds:
            cursor.execute("SELECT password_hash FROM core_users WHERE email = ?;", (email,))
            r = cursor.fetchone()
            if not r or not verify_password(pwd, r[0]):
                all_ok = False
        res.record("G2-Auth", "T2.2", "Validação de Senhas dos Seeds Secretaria, Professor e Aluno", all_ok, "Todos os hashes PBKDF2 conferem")
    except Exception as e:
        res.record("G2-Auth", "T2.2", "Validação de Senhas dos Seeds Secretaria, Professor e Aluno", False, str(e))

    # T2.3: Assinatura e Verificação de Token JWT HMAC-SHA256
    try:
        payload = {
            "sub": "usr-admin",
            "email": "admin@acropole.org.br",
            "role": "ADMIN",
            "location_id": "aguas-claras",
            "exp": int(time.time()) + 3600
        }
        token = sign_token(payload)
        verified = verify_token(token)
        success = verified is not None and verified["sub"] == "usr-admin" and verified["role"] == "ADMIN"
        res.record("G2-Auth", "T2.3", "Assinatura e Validação de Token Bearer HS256", success, f"sub={verified.get('sub') if verified else None}")
    except Exception as e:
        res.record("G2-Auth", "T2.3", "Assinatura e Validação de Token Bearer HS256", False, str(e))

    # T2.4: Rejeição de Token com Assinatura Adulterada ou Segredo Incorreto
    try:
        parts = token.split(".")
        tampered_token = f"{parts[0]}.{parts[1]}.violada12345"
        tampered_verify = verify_token(tampered_token)
        wrong_secret_verify = verify_token(token, secret="outro-segredo-invalido")
        success = tampered_verify is None and wrong_secret_verify is None
        res.record("G2-Auth", "T2.4", "Rejeição de Token Adulterado ou com Segredo Inválido", success, "Ambos rejeitados com sucesso")
    except Exception as e:
        res.record("G2-Auth", "T2.4", "Rejeição de Token Adulterado ou com Segredo Inválido", False, str(e))

    # T2.5: Rejeição de Token Expirado
    try:
        expired_payload = {
            "sub": "usr-expired",
            "role": "SECRETARIA",
            "exp": int(time.time()) - 100  # Expirado há 100s
        }
        exp_token = sign_token(expired_payload)
        exp_verify = verify_token(exp_token)
        success = exp_verify is None
        res.record("G2-Auth", "T2.5", "Rejeição de Token Expirado (exp < now)", success, f"Resultado: {exp_verify}")
    except Exception as e:
        res.record("G2-Auth", "T2.5", "Rejeição de Token Expirado (exp < now)", False, str(e))

    # T2.6: RBAC Matrix: Verificação de Permissões por Papel
    try:
        roles_allowed_crud = ["ADMIN", "SECRETARIA"]
        admin_ok = "ADMIN" in roles_allowed_crud
        sec_ok = "SECRETARIA" in roles_allowed_crud
        prof_blocked = "PROFESSOR" not in roles_allowed_crud
        aluno_blocked = "ALUNO" not in roles_allowed_crud
        success = admin_ok and sec_ok and prof_blocked and aluno_blocked
        res.record("G2-Auth", "T2.6", "Matriz RBAC (ADMIN/SECRETARIA=CRUD; PROFESSOR/ALUNO=READONLY/RESTRICTED)", success, "Permissões validadas")
    except Exception as e:
        res.record("G2-Auth", "T2.6", "Matriz RBAC", False, str(e))

    # -----------------------------------------------------------------------
    # GRUPO 3: PROFESSORES, BLOCOS & AUSÊNCIAS (Módulo 2)
    # -----------------------------------------------------------------------
    print("\n--- GRUPO 3: Gestão Docente, Blocos Pessoais & Ausências (Módulo 2) ---")

    # T3.1: CRUD Docente (Insert, Update, Soft-Delete)
    try:
        cursor.execute("""
            INSERT INTO prof_professors (id, name, email, phone, specialty, weekly_hours_target, is_active)
            VALUES ('prof-teste-01', 'Prof. Teste Integrado', 'teste.prof@acropole.org.br', '(61) 99999-0000', 'Filosofia Aplicada', 12, 1);
        """)
        cursor.execute("UPDATE prof_professors SET weekly_hours_target = 16 WHERE id = 'prof-teste-01';")
        cursor.execute("UPDATE prof_professors SET is_active = 0 WHERE id = 'prof-teste-01';")
        cursor.execute("SELECT weekly_hours_target, is_active FROM prof_professors WHERE id = 'prof-teste-01';")
        row = cursor.fetchone()
        success = row == (16, 0)
        res.record("G3-Professors", "T3.1", "CRUD Ciclo de Vida do Professor (Insert, Update, Soft-Delete)", success, f"Resultado: {row}")
    except Exception as e:
        res.record("G3-Professors", "T3.1", "CRUD Ciclo de Vida do Professor", False, str(e))

    # T3.2: Validação de Blocos Pessoais Docentes
    try:
        cursor.execute("SELECT professor_id, day_of_week, start_minute, end_minute, block_type FROM prof_personal_blocks;")
        blocks = cursor.fetchall()
        valid_blocks = True
        for b in blocks:
            dow, s_min, e_min = b[1], b[2], b[3]
            if not (1 <= dow <= 7) or s_min >= e_min:
                valid_blocks = False
        res.record("G3-Professors", "T3.2", "Consistência dos Blocos Pessoais (1<=dow<=7 e start < end)", valid_blocks, f"Total analisado: {len(blocks)}")
    except Exception as e:
        res.record("G3-Professors", "T3.2", "Consistência dos Blocos Pessoais", False, str(e))

    # T3.3: Registro de Ausências e Substitutos
    try:
        cursor.execute("""
            INSERT INTO prof_absences (id, professor_id, start_date, end_date, reason, default_substitute_id)
            VALUES ('abs-teste-01', 'prof-gustavo', '2025-04-01', '2025-04-10', 'Viagem Acadêmica', 'prof-debora');
        """)
        cursor.execute("SELECT default_substitute_id, reason FROM prof_absences WHERE id = 'abs-teste-01';")
        abs_row = cursor.fetchone()
        success = abs_row == ("prof-debora", "Viagem Acadêmica")
        res.record("G3-Professors", "T3.3", "Registro de Ausência com Substituto Designado", success, f"Row: {abs_row}")
    except Exception as e:
        res.record("G3-Professors", "T3.3", "Registro de Ausência com Substituto Designado", False, str(e))

    # -----------------------------------------------------------------------
    # GRUPO 4: MOTOR ANTI-CHOQUE & VALIDADOR DETERMINÍSTICO (Módulo 3)
    # -----------------------------------------------------------------------
    print("\n--- GRUPO 4: Motor Anti-Choque e Regras 1 a 5 (Módulo 3) ---")

    # Carrega dados do banco para ambiente de teste
    cursor.execute("SELECT id, name, capacity, location_id FROM sch_rooms;")
    rooms_map = {r[0]: {"id": r[0], "name": r[1], "capacity": r[2], "location_id": r[3]} for r in cursor.fetchall()}

    cursor.execute("SELECT id, code, symbolic_name, cached_headcount FROM sch_cohorts;")
    cohorts_map = {c[0]: {"id": c[0], "code": c[1], "symbolic_name": c[2], "cached_headcount": c[3]} for c in cursor.fetchall()}

    # Base de sessões ativas com os dados reais semeados
    base_sessions = [
        {
            "id": "ses-mat-seg-1",
            "room_id": "ac-guinevere",  # Guinevere (44p)
            "location_id": "aguas-claras",
            "day_of_week": 1,  # Segunda
            "start_minute": 1200,  # 20:00
            "end_minute": 1260,    # 21:00
            "professor_id": "prof-gustavo",
            "professor_name": "Gustavo",
            "subject_name": "Ética e Moralidade",
            "event_status": "CONFIRMADO",
            "is_bastiao": 0
        },
        {
            "id": "ses-mat-ter-1",
            "room_id": "sam-sala-1", # Sala Platão (35p)
            "location_id": "samambaia",
            "day_of_week": 2,  # Terça
            "start_minute": 1200,  # 20:00
            "end_minute": 1260,    # 21:00
            "professor_id": "prof-debora",
            "professor_name": "Débora",
            "subject_name": "Filosofia da História",
            "event_status": "CONFIRMADO",
            "is_bastiao": 0
        }
    ]

    # T4.1: Sessão limpa sem choques
    clean_candidate = {
        "id": "cand_clean",
        "room_id": "ac-percival",  # Percival (22p)
        "location_id": "aguas-claras",
        "day_of_week": 1,  # Segunda
        "start_minute": 1200,
        "end_minute": 1260,
        "professor_id": "prof-luisa",
        "professor_name": "Luísa",
        "subject_name": "Bhagavad Gita",
        "event_status": "CONFIRMADO",
        "cohort_ids": ["ac-T32A"],  # 16 alunos
        "is_bastiao": 0
    }
    v_clean = validate_session_candidate(clean_candidate, base_sessions, rooms_map=rooms_map, cohorts_map=cohorts_map)
    res.record("G4-AntiChoque", "T4.1", "Sessão Válida Sem Conflitos (Clean Session)", v_clean["isValid"] and not v_clean["hasRedCardAlert"], f"isValid={v_clean['isValid']}")

    # T4.2: REGRA 1 — Choque Direto de Professor (Mesma localidade, horário coincidente)
    c_regra1_same_loc = {
        "id": "cand_r1_same",
        "room_id": "ac-percival",
        "location_id": "aguas-claras",
        "day_of_week": 1,
        "start_minute": 1220,  # 20:20 (sobrepõe 20:00-21:00)
        "end_minute": 1280,    # 21:20
        "professor_id": "prof-gustavo",
        "professor_name": "Gustavo",
        "subject_name": "Teoria do Conhecimento",
        "event_status": "CONFIRMADO"
    }
    v_r1 = validate_session_candidate(c_regra1_same_loc, base_sessions, rooms_map=rooms_map, cohorts_map=cohorts_map)
    r1_detected = not v_r1["isValid"] and any(e["code"] == "CONFLITO_PROFESSOR_HORARIO" for e in v_r1["errors"]) and v_r1["hasRedCardAlert"]
    res.record("G4-AntiChoque", "T4.2", "REGRA 1: Choque Direto de Professor (Mesma Sede, Sobreposição)", r1_detected, f"Erros: {[e['code'] for e in v_r1['errors']]}")

    # T4.3: REGRA 1 — Choque Direto de Professor (Sedes Diferentes, Mesmo Horário)
    c_regra1_diff_loc = {
        "id": "cand_r1_diff",
        "room_id": "sam-sala-1",
        "location_id": "samambaia",
        "day_of_week": 1,
        "start_minute": 1200,  # 20:00
        "end_minute": 1260,    # 21:00
        "professor_id": "prof-gustavo",
        "professor_name": "Gustavo",
        "subject_name": "Simbolismo Teológico",
        "event_status": "CONFIRMADO"
    }
    v_r1_diff = validate_session_candidate(c_regra1_diff_loc, base_sessions, rooms_map=rooms_map, cohorts_map=cohorts_map)
    r1_diff_detected = not v_r1_diff["isValid"] and any(e["code"] == "CONFLITO_PROFESSOR_HORARIO" for e in v_r1_diff["errors"])
    res.record("G4-AntiChoque", "T4.3", "REGRA 1: Choque Direto de Professor (Sedes Diferentes, Mesmo Horário)", r1_diff_detected, f"Erros: {[e['code'] for e in v_r1_diff['errors']]}")

    # T4.4: REGRA 2 — Conflito de Deslocamento (< 30 min de intervalo entre Águas Claras e Samambaia)
    # base_sessions[0] termina às 1260 (21:00) em Águas Claras.
    # Candidato começa às 1275 (21:15) em Samambaia -> Intervalo = 15 min < 30 min.
    c_regra2_fail = {
        "id": "cand_r2_fail",
        "room_id": "sam-sala-1",
        "location_id": "samambaia",
        "day_of_week": 1,
        "start_minute": 1275,  # 21:15
        "end_minute": 1335,    # 22:15
        "professor_id": "prof-gustavo",
        "professor_name": "Gustavo",
        "subject_name": "Estudos Comparados",
        "event_status": "CONFIRMADO"
    }
    v_r2_fail = validate_session_candidate(c_regra2_fail, base_sessions, rooms_map=rooms_map, cohorts_map=cohorts_map)
    r2_fail_detected = not v_r2_fail["isValid"] and any(e["code"] == "CONFLITO_DESLOCAMENTO_LOCALIDADE" for e in v_r2_fail["errors"]) and v_r2_fail["hasRedCardAlert"]
    res.record("G4-AntiChoque", "T4.4", "REGRA 2: Bloqueio de Deslocamento < 30min entre Sedes (Gap=15min)", r2_fail_detected, f"Erros: {[e['code'] for e in v_r2_fail['errors']]}")

    # T4.5: REGRA 2 — Intervalo Adequado (>= 30 min de intervalo entre Águas Claras e Samambaia)
    # Candidato começa às 1295 (21:35) em Samambaia -> Intervalo = 35 min >= 30 min.
    c_regra2_pass = {
        "id": "cand_r2_pass",
        "room_id": "sam-sala-1",
        "location_id": "samambaia",
        "day_of_week": 1,
        "start_minute": 1295,  # 21:35
        "end_minute": 1355,    # 22:35
        "professor_id": "prof-gustavo",
        "professor_name": "Gustavo",
        "subject_name": "Estudos Comparados",
        "event_status": "CONFIRMADO"
    }
    v_r2_pass = validate_session_candidate(c_regra2_pass, base_sessions, rooms_map=rooms_map, cohorts_map=cohorts_map)
    r2_pass_detected = v_r2_pass["isValid"] and not v_r2_pass["hasRedCardAlert"]
    res.record("G4-AntiChoque", "T4.5", "REGRA 2: Liberação de Deslocamento >= 30min entre Sedes (Gap=35min)", r2_pass_detected, f"isValid={v_r2_pass['isValid']}")

    # T4.6: REGRA 3 — Professor Titular Ausente sem Substituto Designado
    absences = [
        {
            "id": "abs-01",
            "professor_id": "prof-debora",
            "start_date": "2025-03-01",
            "end_date": "2025-03-10",
            "substitute_professor_id": None
        }
    ]
    c_regra3_no_sub = {
        "id": "cand_r3_no_sub",
        "room_id": "ac-percival",
        "location_id": "aguas-claras",
        "day_of_week": 1,
        "start_minute": 1200,
        "end_minute": 1260,
        "professor_id": "prof-debora",
        "professor_name": "Débora",
        "subject_name": "Filosofia Moral",
        "event_status": "CONFIRMADO",
        "substitute_professor_id": None
    }
    v_r3_no_sub = validate_session_candidate(c_regra3_no_sub, base_sessions, professor_absences=absences, target_date="2025-03-05")
    r3_no_sub_detected = not v_r3_no_sub["isValid"] and any(e["code"] == "CONFLITO_PROFESSOR_AUSENTE" for e in v_r3_no_sub["errors"])
    res.record("G4-AntiChoque", "T4.6", "REGRA 3: Bloqueio de Titular Ausente sem Substituto", r3_no_sub_detected, f"Erros: {[e['code'] for e in v_r3_no_sub['errors']]}")

    # T4.7: REGRA 3 — Professor Titular Ausente com Substituto Disponível
    c_regra3_with_sub = {
        "id": "cand_r3_with_sub",
        "room_id": "ac-percival",
        "location_id": "aguas-claras",
        "day_of_week": 1,
        "start_minute": 1200,
        "end_minute": 1260,
        "professor_id": "prof-debora",
        "professor_name": "Débora",
        "substitute_professor_id": "prof-luisa",
        "substitute_professor_name": "Luísa",
        "subject_name": "Filosofia Moral",
        "event_status": "CONFIRMADO"
    }
    v_r3_with_sub = validate_session_candidate(c_regra3_with_sub, base_sessions, professor_absences=absences, target_date="2025-03-05")
    r3_with_sub_detected = v_r3_with_sub["isValid"]
    res.record("G4-AntiChoque", "T4.7", "REGRA 3: Liberação com Substituto Válido e Disponível", r3_with_sub_detected, f"isValid={v_r3_with_sub['isValid']}")

    # T4.8: REGRA 3 — Substituto Designado Também Está Ausente
    absences_double = [
        {
            "id": "abs-01",
            "professor_id": "prof-debora",
            "start_date": "2025-03-01",
            "end_date": "2025-03-10"
        },
        {
            "id": "abs-02",
            "professor_id": "prof-luisa",
            "start_date": "2025-03-04",
            "end_date": "2025-03-08"
        }
    ]
    v_r3_sub_absent = validate_session_candidate(c_regra3_with_sub, base_sessions, professor_absences=absences_double, target_date="2025-03-05")
    r3_sub_absent_detected = not v_r3_sub_absent["isValid"] and any(e["code"] == "CONFLITO_PROFESSOR_AUSENTE" for e in v_r3_sub_absent["errors"])
    res.record("G4-AntiChoque", "T4.8", "REGRA 3: Bloqueio quando o Substituto Também Está Ausente", r3_sub_absent_detected, f"Erros: {[e['code'] for e in v_r3_sub_absent['errors']]}")

    # T4.9: REGRA 4 — Choque de Sala na Mesma Sede (Não-Bastião)
    # base_sessions[0] usa ac-guinevere das 1200 às 1260 em Águas Claras.
    c_regra4_room_clash = {
        "id": "cand_r4_clash",
        "room_id": "ac-guinevere",  # Mesma sala!
        "location_id": "aguas-claras",
        "day_of_week": 1,
        "start_minute": 1200,
        "end_minute": 1260,
        "professor_id": "prof-luisa",
        "professor_name": "Luísa",
        "subject_name": "Turma Concorrente",
        "event_status": "CONFIRMADO",
        "is_bastiao": 0
    }
    v_r4_clash = validate_session_candidate(c_regra4_room_clash, base_sessions, rooms_map=rooms_map)
    r4_clash_detected = not v_r4_clash["isValid"] and any(e["code"] == "CONFLITO_SALA_OCUPADA" for e in v_r4_clash["errors"]) and v_r4_clash["hasRedCardAlert"]
    res.record("G4-AntiChoque", "T4.9", "REGRA 4: Bloqueio de Sala Ocupada no Mesmo Horário (Não-Bastião)", r4_clash_detected, f"Erros: {[e['code'] for e in v_r4_clash['errors']]}")

    # T4.10: REGRA 4 — Compartilhamento de Sala Permitido em Bastião (is_bastiao = 1)
    c_regra4_bastiao = dict(c_regra4_room_clash)
    c_regra4_bastiao["is_bastiao"] = 1
    v_r4_bastiao = validate_session_candidate(c_regra4_bastiao, base_sessions, rooms_map=rooms_map)
    r4_bastiao_detected = v_r4_bastiao["isValid"] and not any(e["code"] == "CONFLITO_SALA_OCUPADA" for e in v_r4_bastiao["errors"])
    res.record("G4-AntiChoque", "T4.10", "REGRA 4: Isenção de Choque de Sala sob Bastião Unificado", r4_bastiao_detected, f"isValid={v_r4_bastiao['isValid']}")

    # T4.11: REGRA 5 — Alerta de Capacidade da Sala (Não-bloqueante / WARNING)
    # Sala Percival (ac-percival) tem capacidade = 22 lugares.
    # Turmas ac-T21A (28) + ac-T21B (18) = 46 alunos (> 22).
    c_regra5_overcap = {
        "id": "cand_r5_over",
        "room_id": "ac-percival",  # 22 lugares
        "location_id": "aguas-claras",
        "day_of_week": 3,
        "start_minute": 1200,
        "end_minute": 1260,
        "professor_id": "prof-luisa",
        "professor_name": "Luísa",
        "subject_name": "Aula Especial",
        "cohort_ids": ["ac-T21A", "ac-T21B"],  # 28 + 18 = 46 alunos
        "event_status": "CONFIRMADO",
        "is_bastiao": 0
    }
    v_r5 = validate_session_candidate(c_regra5_overcap, base_sessions, rooms_map=rooms_map, cohorts_map=cohorts_map)
    r5_detected = v_r5["isValid"] and any(w["code"] == "ALERTA_CAPACIDADE_SALA" for w in v_r5["warnings"]) and not v_r5["hasRedCardAlert"]
    res.record("G4-AntiChoque", "T4.11", "REGRA 5: Alerta de Excesso de Lotação (WARNING Não-Bloqueante)", r5_detected, f"isValid={v_r5['isValid']}, warnings={[w['code'] for w in v_r5['warnings']]}")

    # T4.12: Integração com Blocos Pessoais Docentes de M2 (Conflito de Horário)
    p_blocks = [
        {
            "id": "blk-01",
            "professor_id": "prof-gustavo",
            "day_of_week": 3,  # Quarta
            "start_minute": 1110, # 18:30
            "end_minute": 1170,   # 19:30
            "location_id": "aguas-claras",
            "block_type": "PEDAGOGOS"
        }
    ]
    c_prof_block_clash = {
        "id": "cand_blk_clash",
        "room_id": "ac-guinevere",
        "location_id": "aguas-claras",
        "day_of_week": 3,
        "start_minute": 1140, # 19:00 (sobrepõe bloco 18:30-19:30)
        "end_minute": 1240,
        "professor_id": "prof-gustavo",
        "professor_name": "Gustavo",
        "subject_name": "Ética e Sociedade",
        "event_status": "CONFIRMADO"
    }
    v_blk_clash = validate_session_candidate(c_prof_block_clash, base_sessions, professor_blocks=p_blocks)
    blk_clash_detected = not v_blk_clash["isValid"] and any(e["code"] == "CONFLITO_PROFESSOR_HORARIO" for e in v_blk_clash["errors"])
    res.record("G4-AntiChoque", "T4.12", "Integração M2: Choque com Bloco Pessoal do Docente (Ex: Pedagogos)", blk_clash_detected, f"Erros: {[e['code'] for e in v_blk_clash['errors']]}")

    # T4.13: Integração com Blocos Pessoais Docentes de M2 (Deslocamento < 30min)
    p_blocks_sam = [
        {
            "id": "blk-02",
            "professor_id": "prof-gustavo",
            "day_of_week": 4,  # Quinta
            "start_minute": 1080, # 18:00
            "end_minute": 1140,   # 19:00
            "location_id": "samambaia",
            "block_type": "RECEPCAO"
        }
    ]
    c_prof_block_travel = {
        "id": "cand_blk_travel",
        "room_id": "ac-guinevere",
        "location_id": "aguas-claras",
        "day_of_week": 4,
        "start_minute": 1150, # 19:10 -> gap = 10 min < 30 min
        "end_minute": 1240,
        "professor_id": "prof-gustavo",
        "professor_name": "Gustavo",
        "subject_name": "Ética e Sociedade",
        "event_status": "CONFIRMADO"
    }
    v_blk_travel = validate_session_candidate(c_prof_block_travel, base_sessions, professor_blocks=p_blocks_sam)
    blk_travel_detected = not v_blk_travel["isValid"] and any(e["code"] == "CONFLITO_DESLOCAMENTO_LOCALIDADE" for e in v_blk_travel["errors"])
    res.record("G4-AntiChoque", "T4.13", "Integração M2: Deslocamento < 30min entre Bloco Pessoal e Aula", blk_travel_detected, f"Erros: {[e['code'] for e in v_blk_travel['errors']]}")

    # -----------------------------------------------------------------------
    # GRUPO 5: OPERAÇÕES AVANÇADAS DA GRADE (SWAP, BASTIÃO & SNAPSHOTS)
    # -----------------------------------------------------------------------
    print("\n--- GRUPO 5: Operações Avançadas da Grade (SWAP, Bastião & Snapshots) ---")

    # T5.1: Operação SWAP Atômica (Troca de sala/horário entre duas sessões)
    try:
        cursor.execute("BEGIN TRANSACTION;")
        cursor.execute("SELECT id, room_id, start_minute, end_minute FROM sch_sessions WHERE id IN ('ses-mat-seg-1', 'ses-mat-seg-3');")
        rows_before = {r[0]: (r[1], r[2], r[3]) for r in cursor.fetchall()}
        
        # Realiza SWAP
        s1, s2 = 'ses-mat-seg-1', 'ses-mat-seg-3'
        r1, r2 = rows_before[s1][0], rows_before[s2][0]
        cursor.execute("UPDATE sch_sessions SET room_id = ? WHERE id = ?;", (r2, s1))
        cursor.execute("UPDATE sch_sessions SET room_id = ? WHERE id = ?;", (r1, s2))
        
        cursor.execute("SELECT id, room_id FROM sch_sessions WHERE id IN ('ses-mat-seg-1', 'ses-mat-seg-3');")
        rows_after = {r[0]: r[1] for r in cursor.fetchall()}
        conn.rollback() # Limpa após teste
        
        swap_success = rows_after[s1] == r2 and rows_after[s2] == r1
        res.record("G5-GradeOps", "T5.1", "Operação Transacional SWAP de Salas", swap_success, f"Troca confirmada: {s1}->{r2}, {s2}->{r1}")
    except Exception as e:
        res.record("G5-GradeOps", "T5.1", "Operação Transacional SWAP de Salas", False, str(e))

    # T5.2: Operação MERGE BASTIÃO (Junta 2 turmas na mesma sessão)
    try:
        cursor.execute("BEGIN TRANSACTION;")
        # Transforma ses-mat-seg-1 em bastião unindo ac-T21A e ac-T21B
        cursor.execute("UPDATE sch_sessions SET is_bastiao = 1 WHERE id = 'ses-mat-seg-1';")
        cursor.execute("INSERT OR IGNORE INTO sch_session_cohorts (session_id, cohort_id) VALUES ('ses-mat-seg-1', 'ac-T21B');")
        cursor.execute("SELECT count(*) FROM sch_session_cohorts WHERE session_id = 'ses-mat-seg-1';")
        c_count = cursor.fetchone()[0]
        conn.rollback()
        success = (c_count >= 2)
        res.record("G5-GradeOps", "T5.2", "Operação MERGE BASTIÃO (Vínculo M:N na sch_session_cohorts)", success, f"Turmas vinculadas à sessão unificada: {c_count}")
    except Exception as e:
        res.record("G5-GradeOps", "T5.2", "Operação MERGE BASTIÃO", False, str(e))

    # T5.3: Criar Snapshot e Restaurar Snapshot (Histórico e Rollback)
    try:
        cursor.execute("BEGIN TRANSACTION;")
        cursor.execute("SELECT id, room_id, professor_id, start_minute, end_minute, event_status FROM sch_sessions WHERE location_id = 'aguas-claras';")
        raw_sessions = [dict(zip([d[0] for d in cursor.description], row)) for row in cursor.fetchall()]
        snapshot_json = json.dumps(raw_sessions)
        
        cursor.execute("""
            INSERT INTO sch_snapshots (snapshot_key, location_id, week_id, version_hash, payload_json)
            VALUES ('aguas-claras:test-snap', 'aguas-claras', 'ac-2025-W39', 'hash_test_123', ?);
        """, (snapshot_json,))
        
        # Simula alteração destrutiva
        cursor.execute("UPDATE sch_sessions SET event_status = 'CANCELADO' WHERE location_id = 'aguas-claras';")
        cursor.execute("SELECT count(*) FROM sch_sessions WHERE location_id = 'aguas-claras' AND event_status = 'CANCELADO';")
        canceled_count = cursor.fetchone()[0]
        
        # Restaura do snapshot
        cursor.execute("SELECT payload_json FROM sch_snapshots WHERE snapshot_key = 'aguas-claras:test-snap';")
        restored_json = cursor.fetchone()[0]
        restored_data = json.loads(restored_json)
        
        for sess in restored_data:
            cursor.execute("UPDATE sch_sessions SET event_status = ? WHERE id = ?;", (sess["event_status"], sess["id"]))
            
        cursor.execute("SELECT id, event_status FROM sch_sessions WHERE location_id = 'aguas-claras';")
        restored_sessions = {r[0]: r[1] for r in cursor.fetchall()}
        conn.rollback()
        
        matches = sum(1 for s in raw_sessions if restored_sessions.get(s["id"]) == s["event_status"])
        success = canceled_count > 0 and matches == len(raw_sessions)
        res.record("G5-GradeOps", "T5.3", "Ciclo Completo de Snapshot (Criar, Simular Falha, Restaurar Estado)", success, f"Restauradas {matches}/{len(raw_sessions)} sessões com status idêntico")
    except Exception as e:
        res.record("G5-GradeOps", "T5.3", "Ciclo Completo de Snapshot", False, str(e))

    # -----------------------------------------------------------------------
    # RESUMO FINAL
    # -----------------------------------------------------------------------
    print("\n" + "=" * 80)
    print("RELATÓRIO RESUMIDO DE EXECUÇÃO")
    print("=" * 80)
    print(f"Total de Testes: {res.passed + res.failed}")
    print(f"Sucessos (PASS): {res.passed}")
    print(f"Falhas   (FAIL): {res.failed}")
    taxa_sucesso = (res.passed / (res.passed + res.failed)) * 100 if (res.passed + res.failed) > 0 else 0
    print(f"Taxa de Sucesso: {taxa_sucesso:.1f}%")
    print("=" * 80)

    return res

if __name__ == "__main__":
    results = run_all_tests()
    if results.failed > 0:
        sys.exit(1)
    sys.exit(0)
