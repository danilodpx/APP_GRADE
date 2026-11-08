// functions/api/core/locations.js
// CRUD Total de Localidades (Águas Claras, Samambaia, expansões) para Secretaria e Administração

import { ensureModuleSchema } from '../../_shared/db.js';
import { requireAuth } from '../../_shared/auth.js';
import { jsonResponse } from '../../_shared/cache.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  try {
    const db = env.DB;
    if (db) await ensureModuleSchema(db, 'M1');

    const url = new URL(request.url);
    const includeInactive = url.searchParams.get('all') === 'true';

    if (!db) {
      // Mock local fallback
      return jsonResponse({
        locations: [
          { id: 'aguas-claras', name: 'Águas Claras', slug: 'aguas-claras', is_active: 1 },
          { id: 'samambaia', name: 'Samambaia', slug: 'samambaia', is_active: 1 }
        ]
      });
    }

    const query = includeInactive
      ? `SELECT id, name, slug, is_active FROM core_locations ORDER BY name ASC`
      : `SELECT id, name, slug, is_active FROM core_locations WHERE is_active = 1 ORDER BY name ASC`;

    const res = await db.prepare(query).all();
    return jsonResponse({ locations: res.results || [] });
  } catch (err) {
    console.error('[GET /api/core/locations] Erro:', err);
    return jsonResponse({ error: 'Erro ao buscar localidades' }, 500);
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
    const id = (body.id || body.slug || name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')).trim();
    const slug = (body.slug || id).trim();

    if (!name || !id) {
      return jsonResponse({ error: 'Nome e identificador da localidade são obrigatórios' }, 400);
    }

    if (!db) {
      return jsonResponse({ success: true, location: { id, name, slug, is_active: 1 } }, 201);
    }

    await db.prepare(
      `INSERT INTO core_locations (id, name, slug, is_active) VALUES (?, ?, ?, 1)`
    ).bind(id, name, slug).run();

    return jsonResponse({ success: true, location: { id, name, slug, is_active: 1 } }, 201);
  } catch (err) {
    console.error('[POST /api/core/locations] Erro:', err);
    return jsonResponse({ error: 'Erro ao criar localidade (possível duplicidade)' }, 400);
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
    const slug = (body.slug || id).trim();
    const isActive = body.is_active !== undefined ? (body.is_active ? 1 : 0) : 1;

    if (!id || !name) {
      return jsonResponse({ error: 'ID e Nome são obrigatórios para atualização' }, 400);
    }

    if (!db) {
      return jsonResponse({ success: true, location: { id, name, slug, is_active: isActive } });
    }

    await db.prepare(
      `UPDATE core_locations SET name = ?, slug = ?, is_active = ? WHERE id = ?`
    ).bind(name, slug, isActive, id).run();

    return jsonResponse({ success: true, location: { id, name, slug, is_active: isActive } });
  } catch (err) {
    console.error('[PUT /api/core/locations] Erro:', err);
    return jsonResponse({ error: 'Erro ao atualizar localidade' }, 500);
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

    if (!db) {
      return jsonResponse({ success: true, deleted_id: id });
    }

    if (isHard) {
      await db.prepare(`DELETE FROM core_locations WHERE id = ?`).bind(id).run();
    } else {
      await db.prepare(`UPDATE core_locations SET is_active = 0 WHERE id = ?`).bind(id).run();
    }

    return jsonResponse({ success: true, deleted_id: id, hard: isHard });
  } catch (err) {
    console.error('[DELETE /api/core/locations] Erro:', err);
    return jsonResponse({ error: 'Erro ao excluir localidade' }, 500);
  }
}

