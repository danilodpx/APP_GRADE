// functions/api/schedule/snapshot.js
// Endpoint de alta performance para consulta pública e mobile da grade (Edge Cache + ETag + 1 linha D1)

import { ensureModuleSchema } from '../../_shared/db.js';
import { jsonResponse, generateETag, checkETag } from '../../_shared/cache.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  try {
    const db = env.DB;
    if (db) await ensureModuleSchema(db, 'M3');

    const url = new URL(request.url);
    const locationId = url.searchParams.get('location_id') || 'aguas-claras';
    const weekId = url.searchParams.get('week_id') || null;
    const snapshotKey = `${locationId}:${weekId || 'matrix'}`;

    if (!db) {
      // Mock local fallback
      const mockPayload = {
        version_hash: 'mock-matrix-v1',
        generated_at: new Date().toISOString(),
        location: { id: locationId, name: locationId === 'aguas-claras' ? 'Águas Claras' : 'Samambaia' },
        week: weekId ? { id: weekId, label: 'Semana Atual' } : null,
        rooms: [
          { id: 'ac-guinevere', name: 'Guinevere', capacity: 44, floor_label: '1º Andar' },
          { id: 'ac-percival', name: 'Percival', capacity: 22, floor_label: '1º Andar' },
          { id: 'ac-gawain', name: 'Gawain', capacity: 22, floor_label: '1º Andar' },
          { id: 'ac-galahad', name: 'Galahad', capacity: 19, floor_label: '2º Andar' },
          { id: 'ac-merlin', name: 'Merlin', capacity: 14, floor_label: '2º Andar' },
          { id: 'ac-lancelot', name: 'Lancelot', capacity: 13, floor_label: '2º Andar' },
          { id: 'ac-salao-camelot', name: 'Salão Camelot', capacity: 80, floor_label: 'Térreo' },
          { id: 'ac-biblioteca', name: 'Biblioteca', capacity: 15, floor_label: 'Térreo' }
        ],
        cohorts: [
          { id: 'ac-T21A', code: 'T21A', symbolic_name: 'Sabedoria', cached_headcount: 28 },
          { id: 'ac-T21B', code: 'T21B', symbolic_name: 'Harmonia', cached_headcount: 18 },
          { id: 'ac-T32A', code: 'T32A', symbolic_name: 'Justiça', cached_headcount: 16 }
        ],
        sessions: [
          { id: 'ses-mat-seg-1', day_of_week: 1, slot_label: '1º Horário', start_minute: 1200, end_minute: 1260, room_id: 'ac-guinevere', subject_name: 'Ética e Moralidade', professor_name: 'Gustavo', cohort_codes: ['T21A'] },
          { id: 'ses-mat-seg-2', day_of_week: 1, slot_label: '2º Horário', start_minute: 1270, end_minute: 1330, room_id: 'ac-guinevere', subject_name: 'Bhagavad Gita', professor_name: 'Gustavo', cohort_codes: ['T21A'] },
          { id: 'ses-mat-seg-3', day_of_week: 1, slot_label: '1º Horário', start_minute: 1200, end_minute: 1260, room_id: 'ac-percival', subject_name: 'Simbologia do Antigo Egito', professor_name: 'Débora', cohort_codes: ['T21B'] }
        ],
        cohort_notices: []
      };
      return jsonResponse(mockPayload, 200, {
        'Cache-Control': 'public, max-age=30, stale-while-revalidate=60',
        'ETag': '"mock-matrix-v1"'
      });
    }

    // 1. Tenta ler o snapshot pré-computado
    const cachedRow = await db.prepare(
      `SELECT version_hash, payload_json FROM sch_snapshots WHERE snapshot_key = ?`
    ).bind(snapshotKey).first();

    if (cachedRow) {
      const etag = `"${cachedRow.version_hash}"`;
      const notModified = checkETag(request, etag);
      if (notModified) return notModified;

      const payload = JSON.parse(cachedRow.payload_json);
      return jsonResponse(payload, 200, {
        'Cache-Control': 'public, max-age=30, stale-while-revalidate=60',
        'ETag': etag
      });
    }

    // 2. Se não existir, gera dinamicamente e armazena na tabela de snapshots
    const [roomsRes, cohortsRes, weeksRes, sessionsRes, noticesRes] = await Promise.all([
      db.prepare(`SELECT * FROM sch_rooms WHERE location_id = ? AND is_active = 1 ORDER BY display_order ASC`).bind(locationId).all(),
      db.prepare(`SELECT * FROM sch_cohorts WHERE location_id = ? AND is_active = 1 ORDER BY code ASC`).bind(locationId).all(),
      db.prepare(`SELECT * FROM sch_weeks WHERE location_id = ? ORDER BY week_start_date DESC`).bind(locationId).all(),
      db.prepare(`
        SELECT s.*, GROUP_CONCAT(sc.cohort_id) as cohort_ids, GROUP_CONCAT(c.code) as cohort_codes
        FROM sch_sessions s
        LEFT JOIN sch_session_cohorts sc ON sc.session_id = s.id
        LEFT JOIN sch_cohorts c ON c.id = sc.cohort_id
        WHERE s.location_id = ? AND s.week_id IS ? AND s.event_status != 'CANCELADO'
        GROUP BY s.id
        ORDER BY s.day_of_week, s.start_minute ASC
      `).bind(locationId, weekId).all(),
      // Últimos avisos se M5 existir
      db.prepare(`
        SELECT m.body, m.created_at, c.cohort_code
        FROM msg_messages m
        JOIN msg_conversations c ON c.id = m.conversation_id
        WHERE c.location_id = ? AND c.conversation_type = 'COHORT_CHANNEL'
        ORDER BY m.id DESC LIMIT 10
      `).bind(locationId).all().catch(() => ({ results: [] }))
    ]);

    const activeWeek = weeksRes.results ? weeksRes.results.find(w => w.id === weekId) : null;
    const versionHash = `snap-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 4)}`;

    const payload = {
      version_hash: versionHash,
      generated_at: new Date().toISOString(),
      location: { id: locationId, name: locationId === 'aguas-claras' ? 'Águas Claras' : 'Samambaia' },
      week: activeWeek || null,
      weeks: weeksRes.results || [],
      rooms: roomsRes.results || [],
      cohorts: cohortsRes.results || [],
      sessions: (sessionsRes.results || []).map(s => ({
        ...s,
        cohort_ids: s.cohort_ids ? s.cohort_ids.split(',') : [],
        cohort_codes: s.cohort_codes ? s.cohort_codes.split(',') : []
      })),
      cohort_notices: noticesRes.results || []
    };

    const payloadJson = JSON.stringify(payload);
    await db.prepare(`
      INSERT OR REPLACE INTO sch_snapshots (snapshot_key, location_id, week_id, version_hash, payload_json, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).bind(snapshotKey, locationId, weekId, versionHash, payloadJson).run();

    const etag = `"${versionHash}"`;
    return jsonResponse(payload, 200, {
      'Cache-Control': 'public, max-age=30, stale-while-revalidate=60',
      'ETag': etag
    });
  } catch (err) {
    console.error('[GET /api/schedule/snapshot] Erro:', err);
    return jsonResponse({ error: 'Erro ao gerar snapshot: ' + err.message }, 500);
  }
}

