// functions/api/schedule/sessions.js
// CRUD Total de Sessões / Aulas no Kanban e Grade Cronológica (UPSERT, SWAP, BASTIÃO, SPLIT)

import { ensureModuleSchema } from '../../_shared/db.js';
import { requireAuth } from '../../_shared/auth.js';
import { jsonResponse } from '../../_shared/cache.js';
import { getProfessorConstraintsSafe, notifySessionChangedSafe } from '../../_shared/module-hooks.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  try {
    const db = env.DB;
    if (db) await ensureModuleSchema(db, 'M3');

    const url = new URL(request.url);
    const locationId = url.searchParams.get('location_id') || 'aguas-claras';
    const weekId = url.searchParams.get('week_id') || null;

    if (!db) {
      return jsonResponse({
        sessions: [],
        otherLocationsSessions: [],
        professorBlocks: [],
        professorAbsences: []
      });
    }

    // 1. Sessões da localidade ativa
    const activeRes = await db.prepare(`
      SELECT s.*, GROUP_CONCAT(sc.cohort_id) as cohort_ids, GROUP_CONCAT(c.code) as cohort_codes
      FROM sch_sessions s
      LEFT JOIN sch_session_cohorts sc ON sc.session_id = s.id
      LEFT JOIN sch_cohorts c ON c.id = sc.cohort_id
      WHERE s.location_id = ? AND s.week_id IS ?
      GROUP BY s.id
      ORDER BY s.day_of_week, s.start_minute ASC
    `).bind(locationId, weekId).all();

    // 2. Sessões das demais localidades (para motor anti-choque com fallback para Matriz)
    const otherRes = await db.prepare(`
      SELECT s.id, s.location_id, s.day_of_week, s.start_minute, s.end_minute, s.room_id,
             s.subject_name, s.professor_id, s.professor_name, s.substitute_professor_id,
             s.substitute_professor_name, s.is_bastiao, s.event_status
      FROM sch_sessions s
      WHERE s.location_id != ? AND (s.week_id IS ? OR (s.week_id IS NULL AND NOT EXISTS (
        SELECT 1 FROM sch_sessions s2 WHERE s2.location_id = s.location_id AND s2.week_id IS ?
      )))
      AND s.event_status != 'CANCELADO' AND s.room_id IS NOT NULL
    `).bind(locationId, weekId, weekId).all();

    // 3. Coleta IDs de todos os professores para obter blocos e ausências de M2
    const profIds = new Set();
    (activeRes.results || []).forEach(s => {
      if (s.professor_id) profIds.add(s.professor_id);
      if (s.substitute_professor_id) profIds.add(s.substitute_professor_id);
    });
    (otherRes.results || []).forEach(s => {
      if (s.professor_id) profIds.add(s.professor_id);
      if (s.substitute_professor_id) profIds.add(s.substitute_professor_id);
    });

    const constraints = await getProfessorConstraintsSafe(db, Array.from(profIds));

    const formattedSessions = (activeRes.results || []).map(s => ({
      ...s,
      cohort_ids: s.cohort_ids ? s.cohort_ids.split(',') : [],
      cohort_codes: s.cohort_codes ? s.cohort_codes.split(',') : []
    }));

    return jsonResponse({
      sessions: formattedSessions,
      otherLocationsSessions: otherRes.results || [],
      professorBlocks: constraints.blocks || [],
      professorAbsences: constraints.absences || []
    });
  } catch (err) {
    console.error('[GET /api/schedule/sessions] Erro:', err);
    return jsonResponse({ error: 'Erro ao carregar sessões: ' + err.message }, 500);
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const { user, errorResponse } = await requireAuth(request, env, ['ADMIN', 'SECRETARIA']);
  if (errorResponse) return errorResponse;

  try {
    const db = env.DB;
    if (db) await ensureModuleSchema(db, 'M3');

    const body = await request.json().catch(() => ({}));
    const action = body.action || 'UPSERT';

    if (action === 'SWAP') {
      // Troca atômica de salas e horários entre duas sessões
      const { source_session_id, target_session_id } = body;
      if (!source_session_id || !target_session_id) {
        return jsonResponse({ error: 'IDs de origem e destino são obrigatórios para Swap' }, 400);
      }

      if (db) {
        const s1 = await db.prepare(`SELECT * FROM sch_sessions WHERE id = ?`).bind(source_session_id).first();
        const s2 = await db.prepare(`SELECT * FROM sch_sessions WHERE id = ?`).bind(target_session_id).first();
        if (!s1 || !s2) return jsonResponse({ error: 'Uma das sessões não foi encontrada' }, 404);

        await db.batch([
          db.prepare(`
            UPDATE sch_sessions
            SET room_id = ?, day_of_week = ?, start_minute = ?, end_minute = ?, slot_label = ?, updated_at = datetime('now')
            WHERE id = ?
          `).bind(s2.room_id, s2.day_of_week, s2.start_minute, s2.end_minute, s2.slot_label, s1.id),
          db.prepare(`
            UPDATE sch_sessions
            SET room_id = ?, day_of_week = ?, start_minute = ?, end_minute = ?, slot_label = ?, updated_at = datetime('now')
            WHERE id = ?
          `).bind(s1.room_id, s1.day_of_week, s1.start_minute, s1.end_minute, s1.slot_label, s2.id),
          db.prepare(`DELETE FROM sch_snapshots WHERE location_id = ?`).bind(s1.location_id)
        ]);
      }
      return jsonResponse({ success: true, action: 'SWAP' });
    }

    if (action === 'MERGE_BASTIAO') {
      // Unir duas turmas sob uma mesma sessão / sala
      const { source_session_id, target_session_id } = body;
      if (!source_session_id || !target_session_id) {
        return jsonResponse({ error: 'IDs de origem e destino obrigatórios para Bastião' }, 400);
      }

      if (db) {
        // Copia vínculos de turmas da origem para o destino
        const sourceCohorts = await db.prepare(`SELECT cohort_id FROM sch_session_cohorts WHERE session_id = ?`).bind(source_session_id).all();
        const targetSession = await db.prepare(`SELECT * FROM sch_sessions WHERE id = ?`).bind(target_session_id).first();

        const insertCohortStatements = (sourceCohorts.results || []).map(c =>
          db.prepare(`INSERT OR IGNORE INTO sch_session_cohorts (session_id, cohort_id) VALUES (?, ?)`).bind(target_session_id, c.cohort_id)
        );

        await db.batch([
          db.prepare(`UPDATE sch_sessions SET is_bastiao = 1, updated_at = datetime('now') WHERE id = ?`).bind(target_session_id),
          ...insertCohortStatements,
          db.prepare(`DELETE FROM sch_sessions WHERE id = ?`).bind(source_session_id),
          db.prepare(`DELETE FROM sch_snapshots WHERE location_id = ?`).bind(targetSession.location_id)
        ]);
      }
      return jsonResponse({ success: true, action: 'MERGE_BASTIAO' });
    }

    if (action === 'SPLIT_BASTIAO') {
      // Desfazer Bastião: mantém a 1ª turma e desmembra as demais para a gaveta lateral
      const { session_id } = body;
      if (!session_id) return jsonResponse({ error: 'ID da sessão obrigatório' }, 400);

      if (db) {
        const session = await db.prepare(`SELECT * FROM sch_sessions WHERE id = ?`).bind(session_id).first();
        const cohortsRes = await db.prepare(`SELECT cohort_id FROM sch_session_cohorts WHERE session_id = ?`).bind(session_id).all();
        const cohorts = cohortsRes.results || [];

        if (cohorts.length > 1) {
          const mainCohortId = cohorts[0].cohort_id;
          const otherCohorts = cohorts.slice(1);

          const splitStatements = [];
          for (const c of otherCohorts) {
            const newSessionId = `ses-split-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 4)}`;
            splitStatements.push(
              db.prepare(`
                INSERT INTO sch_sessions (id, location_id, week_id, day_of_week, slot_label, start_minute, end_minute, room_id, subject_name, category, professor_id, professor_name, is_bastiao, event_status)
                VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, 0, 'NAO_ALOCADO')
              `).bind(newSessionId, session.location_id, session.week_id, session.day_of_week, session.slot_label, session.start_minute, session.end_minute, session.subject_name, session.category, session.professor_id, session.professor_name),
              db.prepare(`INSERT INTO sch_session_cohorts (session_id, cohort_id) VALUES (?, ?)`).bind(newSessionId, c.cohort_id),
              db.prepare(`DELETE FROM sch_session_cohorts WHERE session_id = ? AND cohort_id = ?`).bind(session_id, c.cohort_id)
            );
          }

          await db.batch([
            db.prepare(`UPDATE sch_sessions SET is_bastiao = 0, updated_at = datetime('now') WHERE id = ?`).bind(session_id),
            ...splitStatements,
            db.prepare(`DELETE FROM sch_snapshots WHERE location_id = ?`).bind(session.location_id)
          ]);
        }
      }
      return jsonResponse({ success: true, action: 'SPLIT_BASTIAO' });
    }

    // Ação Padrão: UPSERT (Criar ou Atualizar Sessão)
    const id = body.id || `ses-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 4)}`;
    const locationId = body.location_id || 'aguas-claras';
    const weekId = body.week_id || null;
    const dayOfWeek = parseInt(body.day_of_week, 10) || 1;
    const slotLabel = body.slot_label || '1º Horário';
    const startMinute = parseInt(body.start_minute, 10);
    const endMinute = parseInt(body.end_minute, 10);
    const roomId = body.room_id || null;
    const subjectName = (body.subject_name || '').trim();
    const category = body.category || 'Filosofia';
    const professorId = body.professor_id || null;
    const professorName = (body.professor_name || 'A Definir').trim();
    const subProfId = body.substitute_professor_id || null;
    const subProfName = body.substitute_professor_name || null;
    const isBastiao = body.is_bastiao ? 1 : 0;
    const eventStatus = roomId ? (body.event_status || 'CONFIRMADO') : 'NAO_ALOCADO';
    const notes = body.notes || '';
    const cohortIds = body.cohort_ids || [];

    if (!subjectName || isNaN(startMinute) || isNaN(endMinute)) {
      return jsonResponse({ error: 'Disciplina, horário de início e fim são obrigatórios' }, 400);
    }

    if (db) {
      const existing = await db.prepare(`SELECT id FROM sch_sessions WHERE id = ?`).bind(id).first();

      if (existing) {
        await db.prepare(`
          UPDATE sch_sessions
          SET location_id = ?, week_id = ?, day_of_week = ?, slot_label = ?, start_minute = ?, end_minute = ?,
              room_id = ?, subject_name = ?, category = ?, professor_id = ?, professor_name = ?,
              substitute_professor_id = ?, substitute_professor_name = ?, is_bastiao = ?, event_status = ?, notes = ?, updated_at = datetime('now')
          WHERE id = ?
        `).bind(locationId, weekId, dayOfWeek, slotLabel, startMinute, endMinute, roomId, subjectName, category, professorId, professorName, subProfId, subProfName, isBastiao, eventStatus, notes, id).run();
      } else {
        await db.prepare(`
          INSERT INTO sch_sessions (id, location_id, week_id, day_of_week, slot_label, start_minute, end_minute, room_id, subject_name, category, professor_id, professor_name, substitute_professor_id, substitute_professor_name, is_bastiao, event_status, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(id, locationId, weekId, dayOfWeek, slotLabel, startMinute, endMinute, roomId, subjectName, category, professorId, professorName, subProfId, subProfName, isBastiao, eventStatus, notes).run();
      }

      // Sincroniza vínculos com turmas
      await db.prepare(`DELETE FROM sch_session_cohorts WHERE session_id = ?`).bind(id).run();
      for (const cId of cohortIds) {
        await db.prepare(`INSERT OR IGNORE INTO sch_session_cohorts (session_id, cohort_id) VALUES (?, ?)`).bind(id, cId).run();
      }

      // Invalida snapshot
      await db.prepare(`DELETE FROM sch_snapshots WHERE location_id = ?`).bind(locationId).run();

      // Dispara notificação assíncrona para M5 se aplicável
      if (cohortIds.length > 0) {
        context.waitUntil(
          notifySessionChangedSafe(db, {
            cohortCode: body.cohort_codes ? body.cohort_codes[0] : null,
            locationId,
            message: `Aviso de Grade: Alteração na aula "${subjectName}" (${slotLabel}) para a sala ${roomId || 'Gaveta Lateral'}.`
          })
        );
      }
    }

    return jsonResponse({ success: true, session_id: id });
  } catch (err) {
    console.error('[POST /api/schedule/sessions] Erro:', err);
    return jsonResponse({ error: 'Erro ao persistir sessão: ' + err.message }, 500);
  }
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  const { user, errorResponse } = await requireAuth(request, env, ['ADMIN', 'SECRETARIA']);
  if (errorResponse) return errorResponse;

  try {
    const db = env.DB;
    if (db) await ensureModuleSchema(db, 'M3');

    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) return jsonResponse({ error: 'ID é obrigatório' }, 400);

    if (db) {
      const sess = await db.prepare(`SELECT location_id FROM sch_sessions WHERE id = ?`).bind(id).first();
      await db.prepare(`DELETE FROM sch_sessions WHERE id = ?`).bind(id).run();
      if (sess) {
        await db.prepare(`DELETE FROM sch_snapshots WHERE location_id = ?`).bind(sess.location_id).run();
      }
    }

    return jsonResponse({ success: true, deleted_id: id });
  } catch (err) {
    console.error('[DELETE /api/schedule/sessions] Erro:', err);
    return jsonResponse({ error: 'Erro ao excluir sessão: ' + err.message }, 500);
  }
}

