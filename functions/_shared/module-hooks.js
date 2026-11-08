// functions/_shared/module-hooks.js
// Adaptadores tolerantes a falhas entre módulos (Zero acoplamento relacional rígido)

/**
 * Consulta blocos e ausências de professores em M2 de forma segura (para M3)
 */
export async function getProfessorConstraintsSafe(db, professorIds = []) {
  if (!db || !professorIds || professorIds.length === 0) {
    return { blocks: [], absences: [] };
  }
  try {
    const placeholders = professorIds.map(() => '?').join(',');
    const blocksQuery = `SELECT * FROM prof_personal_blocks WHERE professor_id IN (${placeholders})`;
    const absencesQuery = `SELECT * FROM prof_absences WHERE professor_id IN (${placeholders})`;

    const [blocksRes, absencesRes] = await Promise.all([
      db.prepare(blocksQuery).bind(...professorIds).all(),
      db.prepare(absencesQuery).bind(...professorIds).all()
    ]);

    return {
      blocks: blocksRes.results || [],
      absences: absencesRes.results || []
    };
  } catch (err) {
    // Se o Módulo 2 ainda não estiver instalado ou tabela não existir, retorna vazio graciosamente
    return { blocks: [], absences: [] };
  }
}

/**
 * Sincroniza nome desnormalizado e invalida snapshots em M3 quando M2 altera professor
 */
export async function syncProfessorChangesSafe(db, professorId, updatedName) {
  if (!db || !professorId) return;
  try {
    await db.batch([
      db.prepare(`UPDATE sch_sessions SET professor_name = ? WHERE professor_id = ?`).bind(updatedName, professorId),
      db.prepare(`UPDATE sch_cohorts SET principal_professor_name = ? WHERE principal_professor_id = ?`).bind(updatedName, professorId),
      db.prepare(`DELETE FROM sch_snapshots`).run()
    ]);
  } catch (err) {
    // Ignora se M3 não estiver instalado
  }
}

/**
 * Atualiza contagem de alunos de uma turma em M3 quando M4 altera alunos
 */
export async function syncCohortHeadcountSafe(db, locationId, cohortCode) {
  if (!db || !locationId || !cohortCode) return;
  try {
    const countRes = await db.prepare(
      `SELECT COUNT(*) as total FROM stu_students WHERE location_id = ? AND cohort_code = ? AND is_active = 1`
    ).bind(locationId, cohortCode).first();

    const count = countRes ? countRes.total : 0;
    await db.prepare(
      `UPDATE sch_cohorts SET cached_headcount = ? WHERE location_id = ? AND code = ?`
    ).bind(count, locationId, cohortCode).run();
  } catch (err) {
    // Ignora se M3 não estiver instalado
  }
}

/**
 * Notifica canais de turma em M5 sobre alteração de sala ou horário
 */
export async function notifySessionChangedSafe(db, changePayload) {
  if (!db || !changePayload) return;
  try {
    const { cohortCode, locationId, message } = changePayload;
    // Localiza canal da turma em M5 se existir
    const conv = await db.prepare(
      `SELECT id FROM msg_conversations WHERE cohort_code = ? AND location_id = ? LIMIT 1`
    ).bind(cohortCode, locationId).first();

    if (conv) {
      await db.prepare(
        `INSERT INTO msg_messages (conversation_id, sender_name, sender_role, body, is_system_alert)
         VALUES (?, 'Sistema Grade', 'SISTEMA', ?, 1)`
      ).bind(conv.id, message).run();
    }
  } catch (err) {
    // Ignora se M5 não estiver instalado
  }
}

