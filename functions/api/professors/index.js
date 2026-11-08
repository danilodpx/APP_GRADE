// functions/api/professors/index.js
// CRUD Total de Professores e Blocos Pessoais Multi-Localidade (Módulo 2)

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
    const locationId = url.searchParams.get('location_id');
    const includeInactive = url.searchParams.get('all') === 'true';

    if (!db) {
      // Mock local fallback
      return jsonResponse({
        professors: [
          { id: 'prof-gustavo', name: 'Gustavo', email: 'gustavo@acropole.org.br', phone: '(61) 98111-0001', specialty: 'Filosofia / Ética', weekly_hours_target: 12, is_active: 1 },
          { id: 'prof-debora', name: 'Débora', email: 'debora@acropole.org.br', phone: '(61) 98111-0002', specialty: 'Filosofia / Simbologia', weekly_hours_target: 10, is_active: 1 },
          { id: 'prof-luisa', name: 'Luísa', email: 'luisa@acropole.org.br', phone: '(61) 98111-0003', specialty: 'Filosofia / Mitologia', weekly_hours_target: 8, is_active: 1 },
          { id: 'prof-daysy', name: 'Daysy', email: 'daysy@acropole.org.br', phone: '(61) 98111-0004', specialty: 'Filosofia / Psicologia', weekly_hours_target: 10, is_active: 1 },
          { id: 'prof-maria-clara', name: 'Maria Clara', email: 'maria.clara@acropole.org.br', phone: '(61) 98111-0005', specialty: 'Filosofia Aplicada', weekly_hours_target: 8, is_active: 1 },
          { id: 'prof-gama', name: 'Gama', email: 'gama@acropole.org.br', phone: '(61) 98111-0006', specialty: 'História da Filosofia', weekly_hours_target: 10, is_active: 1 },
          { id: 'prof-eduardo', name: 'Eduardo', email: 'eduardo@acropole.org.br', phone: '(61) 98111-0007', specialty: 'Pedagogia / Teoria do Conhecimento', weekly_hours_target: 6, is_active: 1 },
          { id: 'prof-cintia', name: 'Cíntia', email: 'cintia@acropole.org.br', phone: '(61) 98111-0008', specialty: 'Filosofia & Arte', weekly_hours_target: 8, is_active: 1 },
          { id: 'prof-malu', name: 'Malu', email: 'malu@acropole.org.br', phone: '(61) 98111-0009', specialty: 'Introdução à Filosofia', weekly_hours_target: 8, is_active: 1 }
        ],
        blocks: [
          { id: 'blk-gustavo-recep-seg', professor_id: 'prof-gustavo', location_id: 'aguas-claras', day_of_week: 1, start_minute: 1140, end_minute: 1200, block_type: 'RECEPCAO', notes: 'Recepção e acolhimento' },
          { id: 'blk-gustavo-pedag-qua', professor_id: 'prof-gustavo', location_id: 'aguas-claras', day_of_week: 3, start_minute: 1110, end_minute: 1170, block_type: 'PEDAGOGOS', notes: 'Alinhamento pedagógico' }
        ],
        absences: []
      });
    }

    const profQuery = includeInactive
      ? `SELECT * FROM prof_professors ORDER BY name ASC`
      : `SELECT * FROM prof_professors WHERE is_active = 1 ORDER BY name ASC`;

    const blocksQuery = locationId
      ? `SELECT * FROM prof_personal_blocks WHERE location_id = ? ORDER BY day_of_week, start_minute ASC`
      : `SELECT * FROM prof_personal_blocks ORDER BY day_of_week, start_minute ASC`;

    const [profRes, blocksRes, absRes] = await Promise.all([
      db.prepare(profQuery).all(),
      locationId ? db.prepare(blocksQuery).bind(locationId).all() : db.prepare(blocksQuery).all(),
      db.prepare(`SELECT * FROM prof_absences ORDER BY start_date DESC`).all()
    ]);

    return jsonResponse({
      professors: profRes.results || [],
      blocks: blocksRes.results || [],
      absences: absRes.results || []
    });
  } catch (err) {
    console.error('[GET /api/professors] Erro:', err);
    return jsonResponse({ error: 'Erro ao carregar corpo docente' }, 500);
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
    const entity = body.entity || 'professor';

    if (entity === 'professor') {
      // Apenas ADMIN e SECRETARIA podem criar professores
      if (user.role !== 'ADMIN' && user.role !== 'SECRETARIA') {
        return jsonResponse({ error: 'Permissão negada para cadastrar professores' }, 403);
      }

      const name = (body.name || '').trim();
      const email = (body.email || '').trim().toLowerCase();
      const phone = (body.phone || '').trim();
      const specialty = (body.specialty || 'Filosofia').trim();
      const hours = parseInt(body.weekly_hours_target, 10) || 0;
      const id = body.id || `prof-${name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}`;

      if (!name) {
        return jsonResponse({ error: 'Nome do professor é obrigatório' }, 400);
      }

      if (db) {
        await db.prepare(`
          INSERT INTO prof_professors (id, name, email, phone, specialty, weekly_hours_target, is_active)
          VALUES (?, ?, ?, ?, ?, ?, 1)
        `).bind(id, name, email, phone, specialty, hours).run();
      }

      return jsonResponse({
        success: true,
        professor: { id, name, email, phone, specialty, weekly_hours_target: hours, is_active: 1 }
      }, 201);
    }

    if (entity === 'block') {
      const professorId = body.professor_id;
      // Professor só pode criar bloco para si mesmo
      if (user.role === 'PROFESSOR' && user.linked_entity_id !== professorId) {
        return jsonResponse({ error: 'Permissão negada para gerenciar blocos de outro docente' }, 403);
      }

      const locationId = body.location_id || 'aguas-claras';
      const dayOfWeek = parseInt(body.day_of_week, 10) || 1;
      const startMinute = parseInt(body.start_minute, 10);
      const endMinute = parseInt(body.end_minute, 10);
      const blockType = body.block_type || 'AULA';
      const notes = (body.notes || '').trim();
      const id = body.id || `blk-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 4)}`;

      if (!professorId || isNaN(startMinute) || isNaN(endMinute)) {
        return jsonResponse({ error: 'Dados incompletos para criação de bloco' }, 400);
      }

      if (db) {
        await db.prepare(`
          INSERT INTO prof_personal_blocks (id, professor_id, location_id, day_of_week, start_minute, end_minute, block_type, notes)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(id, professorId, locationId, dayOfWeek, startMinute, endMinute, blockType, notes).run();

        // Invalida snapshots em M3
        await syncProfessorChangesSafe(db, professorId, null);
      }

      return jsonResponse({
        success: true,
        block: { id, professor_id: professorId, location_id: locationId, day_of_week: dayOfWeek, start_minute: startMinute, end_minute: endMinute, block_type: blockType, notes }
      }, 201);
    }

    return jsonResponse({ error: 'Entidade inválida (use "professor" ou "block")' }, 400);
  } catch (err) {
    console.error('[POST /api/professors] Erro:', err);
    return jsonResponse({ error: 'Erro ao criar registro: ' + err.message }, 500);
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
    const entity = body.entity || 'professor';

    if (entity === 'professor') {
      if (user.role !== 'ADMIN' && user.role !== 'SECRETARIA') {
        return jsonResponse({ error: 'Permissão negada para editar professores' }, 403);
      }

      const id = (body.id || '').trim();
      const name = (body.name || '').trim();
      const email = (body.email || '').trim().toLowerCase();
      const phone = (body.phone || '').trim();
      const specialty = (body.specialty || 'Filosofia').trim();
      const hours = parseInt(body.weekly_hours_target, 10) || 0;
      const isActive = body.is_active !== undefined ? (body.is_active ? 1 : 0) : 1;

      if (!id || !name) {
        return jsonResponse({ error: 'ID e Nome são obrigatórios' }, 400);
      }

      if (db) {
        await db.prepare(`
          UPDATE prof_professors
          SET name = ?, email = ?, phone = ?, specialty = ?, weekly_hours_target = ?, is_active = ?
          WHERE id = ?
        `).bind(name, email, phone, specialty, hours, isActive, id).run();

        // Sincroniza nome nas turmas/sessões de M3
        await syncProfessorChangesSafe(db, id, name);
      }

      return jsonResponse({ success: true, updated_id: id });
    }

    if (entity === 'block') {
      const id = (body.id || '').trim();
      const professorId = body.professor_id;
      if (user.role === 'PROFESSOR' && user.linked_entity_id !== professorId) {
        return jsonResponse({ error: 'Permissão negada' }, 403);
      }

      const locationId = body.location_id || 'aguas-claras';
      const dayOfWeek = parseInt(body.day_of_week, 10) || 1;
      const startMinute = parseInt(body.start_minute, 10);
      const endMinute = parseInt(body.end_minute, 10);
      const blockType = body.block_type || 'AULA';
      const notes = (body.notes || '').trim();

      if (db) {
        await db.prepare(`
          UPDATE prof_personal_blocks
          SET location_id = ?, day_of_week = ?, start_minute = ?, end_minute = ?, block_type = ?, notes = ?
          WHERE id = ?
        `).bind(locationId, dayOfWeek, startMinute, endMinute, blockType, notes, id).run();

        await syncProfessorChangesSafe(db, professorId, null);
      }

      return jsonResponse({ success: true, updated_id: id });
    }

    return jsonResponse({ error: 'Entidade inválida' }, 400);
  } catch (err) {
    console.error('[PUT /api/professors] Erro:', err);
    return jsonResponse({ error: 'Erro ao atualizar registro' }, 500);
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
    const entity = url.searchParams.get('entity') || 'professor';
    const isHard = url.searchParams.get('hard') === 'true';

    if (!id) {
      return jsonResponse({ error: 'Parâmetro ?id= é obrigatório' }, 400);
    }

    if (entity === 'professor') {
      if (user.role !== 'ADMIN' && user.role !== 'SECRETARIA') {
        return jsonResponse({ error: 'Permissão negada' }, 403);
      }

      if (db) {
        if (isHard) {
          await db.prepare(`DELETE FROM prof_professors WHERE id = ?`).bind(id).run();
        } else {
          await db.prepare(`UPDATE prof_professors SET is_active = 0 WHERE id = ?`).bind(id).run();
        }
        await syncProfessorChangesSafe(db, id, null);
      }

      return jsonResponse({ success: true, deleted_id: id, entity, hard: isHard });
    }

    if (entity === 'block') {
      if (db) {
        await db.prepare(`DELETE FROM prof_personal_blocks WHERE id = ?`).bind(id).run();
      }
      return jsonResponse({ success: true, deleted_id: id, entity, hard: true });
    }

    return jsonResponse({ error: 'Entidade inválida' }, 400);
  } catch (err) {
    console.error('[DELETE /api/professors] Erro:', err);
    return jsonResponse({ error: 'Erro ao excluir' }, 500);
  }
}
