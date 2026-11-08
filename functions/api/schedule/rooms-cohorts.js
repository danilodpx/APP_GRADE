// functions/api/schedule/rooms-cohorts.js
// Gestão de Salas, Turmas e Semanas Específicas (Módulo 3)

import { ensureModuleSchema } from '../../_shared/db.js';
import { requireAuth } from '../../_shared/auth.js';
import { jsonResponse } from '../../_shared/cache.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  try {
    const db = env.DB;
    if (db) await ensureModuleSchema(db, 'M3');

    const url = new URL(request.url);
    const locationId = url.searchParams.get('location_id') || 'aguas-claras';

    if (!db) {
      return jsonResponse({
        rooms: [
          { id: 'ac-guinevere', name: 'Guinevere', capacity: 44, floor_label: '1º Andar', display_order: 1, is_active: 1 },
          { id: 'ac-percival', name: 'Percival', capacity: 22, floor_label: '1º Andar', display_order: 2, is_active: 1 },
          { id: 'ac-gawain', name: 'Gawain', capacity: 22, floor_label: '1º Andar', display_order: 3, is_active: 1 },
          { id: 'ac-galahad', name: 'Galahad', capacity: 19, floor_label: '2º Andar', display_order: 4, is_active: 1 },
          { id: 'ac-merlin', name: 'Merlin', capacity: 14, floor_label: '2º Andar', display_order: 5, is_active: 1 },
          { id: 'ac-lancelot', name: 'Lancelot', capacity: 13, floor_label: '2º Andar', display_order: 6, is_active: 1 },
          { id: 'ac-salao-camelot', name: 'Salão Camelot', capacity: 80, floor_label: 'Térreo', display_order: 7, is_active: 1 },
          { id: 'ac-biblioteca', name: 'Biblioteca', capacity: 15, floor_label: 'Térreo', display_order: 8, is_active: 1 }
        ],
        cohorts: [
          { id: 'ac-T21A', code: 'T21A', symbolic_name: 'Sabedoria', level_number: 1, principal_professor_name: 'Gustavo', cached_headcount: 28, is_active: 1 },
          { id: 'ac-T21B', code: 'T21B', symbolic_name: 'Harmonia', level_number: 1, principal_professor_name: 'Débora', cached_headcount: 18, is_active: 1 },
          { id: 'ac-T32A', code: 'T32A', symbolic_name: 'Justiça', level_number: 2, principal_professor_name: 'Luísa', cached_headcount: 16, is_active: 1 },
          { id: 'ac-T41A', code: 'T41A', symbolic_name: 'Coragem', level_number: 3, principal_professor_name: 'Daysy', cached_headcount: 14, is_active: 1 },
          { id: 'ac-T52B', code: 'T52B', symbolic_name: 'Verdade', level_number: 4, principal_professor_name: 'Maria Clara', cached_headcount: 12, is_active: 1 }
        ],
        weeks: [
          { id: 'ac-2025-W39', week_start_date: '2025-09-22', week_end_date: '2025-09-27', label: '22/09 a 27/09/2025', status: 'PUBLISHED' }
        ]
      });
    }

    const [roomsRes, cohortsRes, weeksRes] = await Promise.all([
      db.prepare(`SELECT * FROM sch_rooms WHERE location_id = ? ORDER BY display_order ASC`).bind(locationId).all(),
      db.prepare(`SELECT * FROM sch_cohorts WHERE location_id = ? ORDER BY code ASC`).bind(locationId).all(),
      db.prepare(`SELECT * FROM sch_weeks WHERE location_id = ? ORDER BY week_start_date DESC`).bind(locationId).all()
    ]);

    return jsonResponse({
      rooms: roomsRes.results || [],
      cohorts: cohortsRes.results || [],
      weeks: weeksRes.results || []
    });
  } catch (err) {
    console.error('[GET /api/schedule/rooms-cohorts] Erro:', err);
    return jsonResponse({ error: 'Erro ao listar salas e turmas: ' + err.message }, 500);
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
    const entity = body.entity || 'room';
    const locationId = body.location_id || 'aguas-claras';

    if (entity === 'room') {
      const name = (body.name || '').trim();
      const capacity = parseInt(body.capacity, 10) || 20;
      const floor = body.floor_label || 'Térreo';
      const order = parseInt(body.display_order, 10) || 1;
      const id = body.id || `room-${locationId}-${name.toLowerCase().replace(/\s+/g, '-')}`;

      if (db) {
        await db.prepare(`
          INSERT INTO sch_rooms (id, location_id, name, capacity, floor_label, display_order, is_active)
          VALUES (?, ?, ?, ?, ?, ?, 1)
        `).bind(id, locationId, name, capacity, floor, order).run();
        await db.prepare(`DELETE FROM sch_snapshots WHERE location_id = ?`).bind(locationId).run();
      }
      return jsonResponse({ success: true, room: { id, name, capacity, floor_label: floor } }, 201);
    }

    if (entity === 'cohort') {
      const code = (body.code || '').trim().toUpperCase();
      const symbolicName = (body.symbolic_name || '').trim();
      const level = parseInt(body.level_number, 10) || 1;
      const profId = body.principal_professor_id || null;
      const profName = body.principal_professor_name || '';
      const headcount = parseInt(body.cached_headcount, 10) || 0;
      const id = body.id || `cohort-${locationId}-${code}`;

      if (db) {
        await db.prepare(`
          INSERT INTO sch_cohorts (id, location_id, code, symbolic_name, level_number, principal_professor_id, principal_professor_name, cached_headcount, is_active)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
        `).bind(id, locationId, code, symbolicName, level, profId, profName, headcount).run();
        await db.prepare(`DELETE FROM sch_snapshots WHERE location_id = ?`).bind(locationId).run();
      }
      return jsonResponse({ success: true, cohort: { id, code, symbolic_name: symbolicName } }, 201);
    }

    if (entity === 'week') {
      const startDate = (body.week_start_date || '').trim();
      const endDate = (body.week_end_date || '').trim();
      const label = (body.label || `${startDate} a ${endDate}`).trim();
      const id = body.id || `week-${locationId}-${startDate.replace(/-/g, '')}`;

      if (db) {
        await db.prepare(`
          INSERT INTO sch_weeks (id, location_id, week_start_date, week_end_date, label, status)
          VALUES (?, ?, ?, ?, ?, 'PUBLISHED')
        `).bind(id, locationId, startDate, endDate, label).run();

        // Clona sessões da Grade Matriz (week_id IS NULL) para a nova semana
        const matrixSessions = await db.prepare(`
          SELECT * FROM sch_sessions WHERE location_id = ? AND week_id IS NULL
        `).bind(locationId).all();

        for (const s of (matrixSessions.results || [])) {
          const newSessionId = `ses-${id}-${s.id}`;
          await db.prepare(`
            INSERT INTO sch_sessions (id, location_id, week_id, base_session_id, is_overridden, day_of_week, slot_label, start_minute, end_minute, room_id, subject_name, category, professor_id, professor_name, is_bastiao, event_status, notes)
            VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(newSessionId, locationId, id, s.id, s.day_of_week, s.slot_label, s.start_minute, s.end_minute, s.room_id, s.subject_name, s.category, s.professor_id, s.professor_name, s.is_bastiao, s.event_status, s.notes).run();

          // Clona turmas vinculadas
          const cohorts = await db.prepare(`SELECT cohort_id FROM sch_session_cohorts WHERE session_id = ?`).bind(s.id).all();
          for (const c of (cohorts.results || [])) {
            await db.prepare(`INSERT OR IGNORE INTO sch_session_cohorts (session_id, cohort_id) VALUES (?, ?)`).bind(newSessionId, c.cohort_id).run();
          }
        }

        await db.prepare(`DELETE FROM sch_snapshots WHERE location_id = ?`).bind(locationId).run();
      }
      return jsonResponse({ success: true, week: { id, label, week_start_date: startDate, week_end_date: endDate } }, 201);
    }

    return jsonResponse({ error: 'Entidade inválida' }, 400);
  } catch (err) {
    console.error('[POST /api/schedule/rooms-cohorts] Erro:', err);
    return jsonResponse({ error: 'Erro ao criar: ' + err.message }, 500);
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
    const entity = url.searchParams.get('entity') || 'room';

    if (!id) return jsonResponse({ error: 'ID é obrigatório' }, 400);

    if (db) {
      if (entity === 'room') {
        await db.prepare(`DELETE FROM sch_rooms WHERE id = ?`).bind(id).run();
      } else if (entity === 'cohort') {
        await db.prepare(`DELETE FROM sch_cohorts WHERE id = ?`).bind(id).run();
      } else if (entity === 'week') {
        await db.prepare(`DELETE FROM sch_weeks WHERE id = ?`).bind(id).run();
      }
    }

    return jsonResponse({ success: true, deleted_id: id });
  } catch (err) {
    console.error('[DELETE /api/schedule/rooms-cohorts] Erro:', err);
    return jsonResponse({ error: 'Erro ao excluir: ' + err.message }, 500);
  }
}
