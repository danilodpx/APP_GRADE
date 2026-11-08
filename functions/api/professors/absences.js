// functions/api/professors/absences.js
// CRUD de Ausências Planejadas e Substituições de Professores (Módulo 2)

import { ensureModuleSchema } from '../../_shared/db.js';
import { requireAuth } from '../../_shared/auth.js';
import { jsonResponse } from '../../_shared/cache.js';
import { syncProfessorChangesSafe } from '../../_shared/module-hooks.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  try {
    const db = env.DB;
    if (db) await ensureModuleSchema(db, 'M2');

    const url = new URL(request.url);
    const professorId = url.searchParams.get('professor_id');

    if (!db) {
      return jsonResponse({ absences: [] });
    }

    const query = professorId
      ? `SELECT a.*, p.name as professor_name, s.name as substitute_name
         FROM prof_absences a
         LEFT JOIN prof_professors p ON p.id = a.professor_id
         LEFT JOIN prof_professors s ON s.id = a.default_substitute_id
         WHERE a.professor_id = ?
         ORDER BY a.start_date DESC`
      : `SELECT a.*, p.name as professor_name, s.name as substitute_name
         FROM prof_absences a
         LEFT JOIN prof_professors p ON p.id = a.professor_id
         LEFT JOIN prof_professors s ON s.id = a.default_substitute_id
         ORDER BY a.start_date DESC`;

    const res = professorId
      ? await db.prepare(query).bind(professorId).all()
      : await db.prepare(query).all();

    return jsonResponse({ absences: res.results || [] });
  } catch (err) {
    console.error('[GET /api/professors/absences] Erro:', err);
    return jsonResponse({ error: 'Erro ao listar ausências' }, 500);
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const { user, errorResponse } = await requireAuth(request, env);
  if (errorResponse) return errorResponse;

  try {
    const db = env.DB;
    if (db) await ensureModuleSchema(db, 'M2');

    const body = await request.json().catch(() => ({}));
    const professorId = body.professor_id;
    const startDate = (body.start_date || '').trim();
    const endDate = (body.end_date || startDate).trim();
    const reason = (body.reason || '').trim();
    const substituteId = body.default_substitute_id || null;

    if (!professorId || !startDate) {
      return jsonResponse({ error: 'Professor e data de início são obrigatórios' }, 400);
    }

    // Se perfil for PROFESSOR, só pode registrar ausência para si
    if (user.role === 'PROFESSOR' && user.linked_entity_id !== professorId) {
      return jsonResponse({ error: 'Permissão negada' }, 403);
    }

    const id = body.id || `abs-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 4)}`;

    if (db) {
      await db.prepare(`
        INSERT INTO prof_absences (id, professor_id, start_date, end_date, reason, default_substitute_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `).bind(id, professorId, startDate, endDate, reason, substituteId).run();

      await syncProfessorChangesSafe(db, professorId, null);
    }

    return jsonResponse({
      success: true,
      absence: { id, professor_id: professorId, start_date: startDate, end_date: endDate, reason, default_substitute_id: substituteId }
    }, 201);
  } catch (err) {
    console.error('[POST /api/professors/absences] Erro:', err);
    return jsonResponse({ error: 'Erro ao registrar ausência' }, 500);
  }
}

export async function onRequestPut(context) {
  const { request, env } = context;
  const { user, errorResponse } = await requireAuth(request, env);
  if (errorResponse) return errorResponse;

  try {
    const db = env.DB;
    if (db) await ensureModuleSchema(db, 'M2');

    const body = await request.json().catch(() => ({}));
    const id = (body.id || '').trim();
    const professorId = body.professor_id;
    const startDate = (body.start_date || '').trim();
    const endDate = (body.end_date || startDate).trim();
    const reason = (body.reason || '').trim();
    const substituteId = body.default_substitute_id || null;

    if (!id || !professorId || !startDate) {
      return jsonResponse({ error: 'ID, Professor e data inicial são obrigatórios' }, 400);
    }

    if (user.role === 'PROFESSOR' && user.linked_entity_id !== professorId) {
      return jsonResponse({ error: 'Permissão negada' }, 403);
    }

    if (db) {
      await db.prepare(`
        UPDATE prof_absences
        SET start_date = ?, end_date = ?, reason = ?, default_substitute_id = ?
        WHERE id = ?
      `).bind(startDate, endDate, reason, substituteId, id).run();

      await syncProfessorChangesSafe(db, professorId, null);
    }

    return jsonResponse({ success: true, updated_id: id });
  } catch (err) {
    console.error('[PUT /api/professors/absences] Erro:', err);
    return jsonResponse({ error: 'Erro ao atualizar ausência' }, 500);
  }
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  const { user, errorResponse } = await requireAuth(request, env);
  if (errorResponse) return errorResponse;

  try {
    const db = env.DB;
    if (db) await ensureModuleSchema(db, 'M2');

    const url = new URL(request.url);
    const id = url.searchParams.get('id');

    if (!id) {
      return jsonResponse({ error: 'Parâmetro ?id= é obrigatório' }, 400);
    }

    if (db) {
      const existing = await db.prepare(`SELECT professor_id FROM prof_absences WHERE id = ?`).bind(id).first();
      if (existing && user.role === 'PROFESSOR' && user.linked_entity_id !== existing.professor_id) {
        return jsonResponse({ error: 'Permissão negada' }, 403);
      }

      await db.prepare(`DELETE FROM prof_absences WHERE id = ?`).bind(id).run();
      if (existing) {
        await syncProfessorChangesSafe(db, existing.professor_id, null);
      }
    }

    return jsonResponse({ success: true, deleted_id: id });
  } catch (err) {
    console.error('[DELETE /api/professors/absences] Erro:', err);
    return jsonResponse({ error: 'Erro ao excluir ausência' }, 500);
  }
}

