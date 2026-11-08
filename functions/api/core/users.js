// functions/api/core/users.js
// CRUD Total de Usuários e Contas de Acesso (ADMIN, SECRETARIA, PROFESSOR, ALUNO)

import { ensureModuleSchema } from '../../_shared/db.js';
import { requireAuth, hashPassword } from '../../_shared/auth.js';
import { jsonResponse } from '../../_shared/cache.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  const { user, errorResponse } = await requireAuth(request, env, ['ADMIN', 'SECRETARIA']);
  if (errorResponse) return errorResponse;

  try {
    const db = env.DB;
    if (db) await ensureModuleSchema(db, 'M1');

    if (!db) {
      return jsonResponse({
        users: [
          { id: 'usr-admin', name: 'Coordenação Geral', email: 'admin@acropole.org.br', role: 'ADMIN', default_location_id: 'aguas-claras', linked_entity_id: null, mfa_code: '000000', is_active: 1 },
          { id: 'usr-secretaria', name: 'Secretaria Nova Acrópole', email: 'secretaria@acropole.org.br', role: 'SECRETARIA', default_location_id: 'aguas-claras', linked_entity_id: null, mfa_code: '000000', is_active: 1 },
          { id: 'usr-gustavo', name: 'Prof. Gustavo', email: 'gustavo@acropole.org.br', role: 'PROFESSOR', default_location_id: 'aguas-claras', linked_entity_id: 'prof-gustavo', mfa_code: '000000', is_active: 1 },
          { id: 'usr-aluno-t21a', name: 'Aluno T21A', email: 'aluno.t21a@acropole.org.br', role: 'ALUNO', default_location_id: 'aguas-claras', linked_entity_id: 'stu-demo-t21a', mfa_code: '000000', is_active: 1 }
        ]
      });
    }

    const query = `
      SELECT id, name, email, role, default_location_id, linked_entity_id, mfa_code, avatar_url, is_active, created_at
      FROM core_users ORDER BY name ASC
    `;
    const res = await db.prepare(query).all();
    return jsonResponse({ users: res.results || [] });
  } catch (err) {
    console.error('[GET /api/core/users] Erro:', err);
    return jsonResponse({ error: 'Erro ao listar usuários' }, 500);
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const { user, errorResponse } = await requireAuth(request, env, ['ADMIN', 'SECRETARIA']);
  if (errorResponse) return errorResponse;

  try {
    const db = env.DB;
    if (db) await ensureModuleSchema(db, 'M1');

    const body = await request.json().catch(() => ({}));
    const name = (body.name || '').trim();
    const email = (body.email || '').trim().toLowerCase();
    const rawPassword = body.password || 'Acropole@2025';
    const role = body.role || 'ALUNO';
    const defaultLocationId = body.default_location_id || 'aguas-claras';
    const linkedEntityId = body.linked_entity_id || null;
    const mfaCode = (body.mfa_code || '000000').replace(/[\s-]/g, '');

    if (!name || !email) {
      return jsonResponse({ error: 'Nome e email são obrigatórios' }, 400);
    }

    const id = body.id || `usr-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 4)}`;
    const passwordHash = await hashPassword(rawPassword);

    if (!db) {
      return jsonResponse({
        success: true,
        user: { id, name, email, role, default_location_id: defaultLocationId, linked_entity_id: linkedEntityId, mfa_code: mfaCode, is_active: 1 }
      }, 201);
    }

    await db.prepare(`
      INSERT INTO core_users (id, name, email, password_hash, mfa_code, role, default_location_id, linked_entity_id, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).bind(id, name, email, passwordHash, mfaCode, role, defaultLocationId, linkedEntityId).run();

    return jsonResponse({
      success: true,
      user: { id, name, email, role, default_location_id: defaultLocationId, linked_entity_id: linkedEntityId, mfa_code: mfaCode, is_active: 1 }
    }, 201);
  } catch (err) {
    console.error('[POST /api/core/users] Erro:', err);
    return jsonResponse({ error: 'Erro ao criar usuário (possível email duplicado)' }, 400);
  }
}

export async function onRequestPut(context) {
  const { request, env } = context;
  const { user, errorResponse } = await requireAuth(request, env, ['ADMIN', 'SECRETARIA']);
  if (errorResponse) return errorResponse;

  try {
    const db = env.DB;
    if (db) await ensureModuleSchema(db, 'M1');

    const body = await request.json().catch(() => ({}));
    const id = (body.id || '').trim();
    const name = (body.name || '').trim();
    const email = (body.email || '').trim().toLowerCase();
    const role = body.role;
    const defaultLocationId = body.default_location_id;
    const linkedEntityId = body.linked_entity_id !== undefined ? body.linked_entity_id : null;
    const mfaCode = body.mfa_code ? body.mfa_code.replace(/[\s-]/g, '') : undefined;
    const isActive = body.is_active !== undefined ? (body.is_active ? 1 : 0) : 1;
    const newPassword = body.password;

    if (!id || !name || !email) {
      return jsonResponse({ error: 'ID, Nome e Email são obrigatórios' }, 400);
    }

    if (!db) {
      return jsonResponse({ success: true, updated_id: id });
    }

    if (newPassword) {
      const passwordHash = await hashPassword(newPassword);
      await db.prepare(`
        UPDATE core_users
        SET name = ?, email = ?, role = COALESCE(?, role), default_location_id = COALESCE(?, default_location_id),
            linked_entity_id = ?, mfa_code = COALESCE(?, mfa_code), password_hash = ?, is_active = ?
        WHERE id = ?
      `).bind(name, email, role, defaultLocationId, linkedEntityId, mfaCode, passwordHash, isActive, id).run();
    } else {
      await db.prepare(`
        UPDATE core_users
        SET name = ?, email = ?, role = COALESCE(?, role), default_location_id = COALESCE(?, default_location_id),
            linked_entity_id = ?, mfa_code = COALESCE(?, mfa_code), is_active = ?
        WHERE id = ?
      `).bind(name, email, role, defaultLocationId, linkedEntityId, mfaCode, isActive, id).run();
    }

    return jsonResponse({ success: true, updated_id: id });
  } catch (err) {
    console.error('[PUT /api/core/users] Erro:', err);
    return jsonResponse({ error: 'Erro ao atualizar usuário' }, 500);
  }
}

export async function onRequestDelete(context) {
  const { request, env } = context;
  const { user, errorResponse } = await requireAuth(request, env, ['ADMIN', 'SECRETARIA']);
  if (errorResponse) return errorResponse;

  try {
    const db = env.DB;
    if (db) await ensureModuleSchema(db, 'M1');

    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    const isHard = url.searchParams.get('hard') === 'true';

    if (!id) {
      return jsonResponse({ error: 'Parâmetro ?id= é obrigatório' }, 400);
    }

    // Impede excluir a si mesmo
    if (user.sub === id || user.id === id) {
      return jsonResponse({ error: 'Não é permitido excluir o usuário da própria sessão ativa' }, 400);
    }

    if (!db) {
      return jsonResponse({ success: true, deleted_id: id });
    }

    if (isHard) {
      await db.prepare(`DELETE FROM core_users WHERE id = ?`).bind(id).run();
    } else {
      await db.prepare(`UPDATE core_users SET is_active = 0 WHERE id = ?`).bind(id).run();
    }

    return jsonResponse({ success: true, deleted_id: id, hard: isHard });
  } catch (err) {
    console.error('[DELETE /api/core/users] Erro:', err);
    return jsonResponse({ error: 'Erro ao excluir usuário' }, 500);
  }
}

