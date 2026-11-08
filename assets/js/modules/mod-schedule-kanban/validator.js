// assets/js/modules/mod-schedule-kanban/validator.js
// Motor Anti-Choque Determinístico de Horários e Alertas de Card Vermelho (Módulo 3)

(function(exports) {
  /**
   * Converte minutos desde 00:00 para string HH:MM
   */
  function minuteToTime(min) {
    if (min === null || min === undefined) return '--:--';
    const h = String(Math.floor(min / 60)).padStart(2, '0');
    const m = String(min % 60).padStart(2, '0');
    return `${h}:${m}`;
  }

  /**
   * Valida deterministicamente uma sessão candidata contra as demais sessões e restrições docentes.
   *
   * @param {Object} candidate - Sessão sendo movida ou editada
   * @param {Array} allSessionsAcrossLocations - Sessões de todas as sedes (com fallback para matriz)
   * @param {Array} professorBlocks - Blocos pessoais de M2 (AULA, CAFE, RECEPCAO, PEDAGOGOS)
   * @param {Array} professorAbsences - Ausências ativas de M2
   * @param {Object} roomsMap - Mapa de salas por ID (id -> room)
   * @param {Object} cohortsMap - Mapa de turmas por ID (id -> cohort)
   * @param {String} targetDate - Data YYYY-MM-DD da sessão (para verificar ausências)
   * @returns {Object} { isValid, errors, warnings, conflictingSessionIds }
   */
  function validateSessionCandidate(
    candidate,
    allSessionsAcrossLocations = [],
    professorBlocks = [],
    professorAbsences = [],
    roomsMap = {},
    cohortsMap = {},
    targetDate = null
  ) {
    const errors = [];
    const warnings = [];
    const conflictingSessionIds = [];

    // Sessões não alocadas ou canceladas não geram choque
    if (candidate.event_status === 'CANCELADO' || candidate.event_status === 'NAO_ALOCADO' || !candidate.room_id) {
      return { isValid: true, errors: [], warnings: [], conflictingSessionIds: [] };
    }

    const startMin = parseInt(candidate.start_minute, 10);
    const endMin = parseInt(candidate.end_minute, 10);
    const dayOfWeek = parseInt(candidate.day_of_week, 10);
    const locationId = candidate.location_id;
    const effectiveProfId = candidate.substitute_professor_id || candidate.professor_id;
    const profName = candidate.substitute_professor_name || candidate.professor_name || 'Professor';

    // 1. REGRA 3 — Professor Titular Ausente sem Substituto ou Substituto Ausente
    if (targetDate && candidate.professor_id) {
      const titularAbsence = professorAbsences.find(a =>
        a.professor_id === candidate.professor_id &&
        targetDate >= a.start_date && targetDate <= a.end_date
      );

      if (titularAbsence && !candidate.substitute_professor_id) {
        errors.push({
          code: 'CONFLITO_PROFESSOR_AUSENTE',
          message: `Ausência registrada: Prof(a). ${candidate.professor_name || 'Titular'} está ausente de ${titularAbsence.start_date} a ${titularAbsence.end_date}. Selecione um professor substituto.`,
          severity: 'BLOCKING'
        });
      }

      if (candidate.substitute_professor_id) {
        const subAbsence = professorAbsences.find(a =>
          a.professor_id === candidate.substitute_professor_id &&
          targetDate >= a.start_date && targetDate <= a.end_date
        );
        if (subAbsence) {
          errors.push({
            code: 'CONFLITO_PROFESSOR_AUSENTE',
            message: `Substituto indisponível: Prof(a). ${candidate.substitute_professor_name || 'Substituto'} também possui ausência registrada de ${subAbsence.start_date} a ${subAbsence.end_date}.`,
            severity: 'BLOCKING'
          });
        }
      }
    }

    // 2. Comparações contra outras sessões alocadas
    for (const other of allSessionsAcrossLocations) {
      if (other.id === candidate.id) continue;
      if (other.event_status === 'CANCELADO' || other.event_status === 'NAO_ALOCADO' || !other.room_id) continue;
      if (parseInt(other.day_of_week, 10) !== dayOfWeek) continue;

      const otherStart = parseInt(other.start_minute, 10);
      const otherEnd = parseInt(other.end_minute, 10);
      const otherEffectiveProfId = other.substitute_professor_id || other.professor_id;
      const isTimeOverlap = Math.max(startMin, otherStart) < Math.min(endMin, otherEnd);

      // REGRA 1 — Choque Direto de Professor (Mesma localidade ou sedes distintas)
      if (effectiveProfId && otherEffectiveProfId && effectiveProfId === otherEffectiveProfId) {
        if (isTimeOverlap) {
          conflictingSessionIds.push(other.id);
          const otherLocName = other.location_id === 'aguas-claras' ? 'Águas Claras' : 'Samambaia';
          errors.push({
            code: 'CONFLITO_PROFESSOR_HORARIO',
            conflictingSessionId: other.id,
            message: `Conflito de horário docente: Prof(a). ${profName} já está alocado(a) em ${otherLocName} (${other.subject_name}) das ${minuteToTime(otherStart)} às ${minuteToTime(otherEnd)}.`,
            severity: 'BLOCKING'
          });
        } else if (other.location_id !== locationId) {
          // REGRA 2 — Intervalo Mínimo de 30 minutos entre sedes diferentes no mesmo dia
          const gapMinutes = startMin >= otherEnd ? (startMin - otherEnd) : (otherStart - endMin);
          if (gapMinutes >= 0 && gapMinutes < 30) {
            conflictingSessionIds.push(other.id);
            const otherLocName = other.location_id === 'aguas-claras' ? 'Águas Claras' : 'Samambaia';
            errors.push({
              code: 'CONFLITO_DESLOCAMENTO_LOCALIDADE',
              conflictingSessionId: other.id,
              message: `Conflito de deslocamento: Prof(a). ${profName} possui atividade em ${otherLocName} com intervalo de apenas ${gapMinutes} min (mínimo obrigatório: 30 min).`,
              severity: 'BLOCKING'
            });
          }
        }
      }

      // REGRA 4 — Choque de Sala na Mesma Localidade (Quando não for Bastião)
      if (other.location_id === locationId && other.room_id === candidate.room_id) {
        if (isTimeOverlap && !candidate.is_bastiao) {
          conflictingSessionIds.push(other.id);
          const roomObj = roomsMap[candidate.room_id] || { name: 'Sala' };
          errors.push({
            code: 'CONFLITO_SALA_OCUPADA',
            conflictingSessionId: other.id,
            message: `Conflito de sala: A sala "${roomObj.name}" já está ocupada por "${other.subject_name}" das ${minuteToTime(otherStart)} às ${minuteToTime(otherEnd)}. Troque de sala (Swap) ou una as turmas em Bastião.`,
            severity: 'BLOCKING'
          });
        }
      }
    }

    // 3. REGRA 1 & 2 com Blocos Pessoais Docentes (M2: Café, Recepção, Pedagogos)
    if (effectiveProfId && professorBlocks.length > 0) {
      for (const blk of professorBlocks) {
        if (blk.professor_id !== effectiveProfId) continue;
        if (parseInt(blk.day_of_week, 10) !== dayOfWeek) continue;

        const blkStart = parseInt(blk.start_minute, 10);
        const blkEnd = parseInt(blk.end_minute, 10);
        const isTimeOverlap = Math.max(startMin, blkStart) < Math.min(endMin, blkEnd);

        if (isTimeOverlap) {
          errors.push({
            code: 'CONFLITO_PROFESSOR_HORARIO',
            message: `Bloqueio pessoal docente: Prof(a). ${profName} possui o compromisso "${blk.block_type}" (${blk.notes || 'Pessoal'}) das ${minuteToTime(blkStart)} às ${minuteToTime(blkEnd)}.`,
            severity: 'BLOCKING'
          });
        } else if (blk.location_id !== locationId) {
          const gapMinutes = startMin >= blkEnd ? (startMin - blkEnd) : (blkStart - endMin);
          if (gapMinutes >= 0 && gapMinutes < 30) {
            errors.push({
              code: 'CONFLITO_DESLOCAMENTO_LOCALIDADE',
              message: `Deslocamento docente: Prof(a). ${profName} tem compromisso "${blk.block_type}" em outra sede com intervalo de apenas ${gapMinutes} min.`,
              severity: 'BLOCKING'
            });
          }
        }
      }
    }

    // 4. REGRA 5 — Alerta de Capacidade da Sala (Não-bloqueante / Selo Âmbar)
    if (candidate.room_id && roomsMap[candidate.room_id]) {
      const room = roomsMap[candidate.room_id];
      let totalStudents = 0;
      const cohortIds = candidate.cohort_ids || [];

      cohortIds.forEach(cId => {
        const cohort = cohortsMap[cId];
        if (cohort) {
          totalStudents += (cohort.cached_headcount || 0);
        }
      });

      if (totalStudents > room.capacity) {
        warnings.push({
          code: 'ALERTA_CAPACIDADE_SALA',
          message: `Alerta de capacidade: A turma/Bastião possui ${totalStudents} alunos para a sala "${room.name}" (capacidade: ${room.capacity} lugares).`,
          severity: 'WARNING'
        });
      }
    }

    const isValid = errors.length === 0;
    return {
      isValid,
      errors,
      warnings,
      conflictingSessionIds: Array.from(new Set(conflictingSessionIds)),
      hasRedCardAlert: !isValid
    };
  }

  exports.validateSessionCandidate = validateSessionCandidate;
  exports.minuteToTime = minuteToTime;
})(typeof module !== 'undefined' && module.exports ? module.exports : (window.ScheduleValidator = {}));

