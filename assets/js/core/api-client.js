// assets/js/core/api-client.js
// Cliente HTTP com suporte a Bearer token, cache ETag e fallback local

(function(window) {
  const STORAGE_KEY = 'na_auth_session';

  function getStoredToken() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        return parsed.token || null;
      }
    } catch (e) {}
    return null;
  }

  // Fallback em memória para teste estático sem servidor Pages Functions ativo
  const mockDb = {
    locations: [
      { id: 'aguas-claras', name: 'Águas Claras', slug: 'aguas-claras', is_active: 1 },
      { id: 'samambaia', name: 'Samambaia', slug: 'samambaia', is_active: 1 }
    ],
    users: [
      { id: 'usr-admin', name: 'Coordenação Geral', email: 'admin@acropole.org.br', role: 'ADMIN', default_location_id: 'aguas-claras', linked_entity_id: null, mfa_code: '000000', is_active: 1 },
      { id: 'usr-secretaria', name: 'Secretaria Nova Acrópole', email: 'secretaria@acropole.org.br', role: 'SECRETARIA', default_location_id: 'aguas-claras', linked_entity_id: null, mfa_code: '000000', is_active: 1 },
      { id: 'usr-gustavo', name: 'Prof. Gustavo', email: 'gustavo@acropole.org.br', role: 'PROFESSOR', default_location_id: 'aguas-claras', linked_entity_id: 'prof-gustavo', mfa_code: '000000', is_active: 1 },
      { id: 'usr-aluno-t21a', name: 'Aluno T21A', email: 'aluno.t21a@acropole.org.br', role: 'ALUNO', default_location_id: 'aguas-claras', linked_entity_id: 'stu-demo-t21a', mfa_code: '000000', is_active: 1 }
    ],
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
      { id: 'blk-gustavo-pedag-qua', professor_id: 'prof-gustavo', location_id: 'aguas-claras', day_of_week: 3, start_minute: 1110, end_minute: 1170, block_type: 'PEDAGOGOS', notes: 'Alinhamento pedagógico' },
      { id: 'blk-debora-cafe-ter', professor_id: 'prof-debora', location_id: 'aguas-claras', day_of_week: 2, start_minute: 1170, end_minute: 1200, block_type: 'CAFE', notes: 'Intervalo filosófico' },
      { id: 'blk-luisa-estudos-qui', professor_id: 'prof-luisa', location_id: 'aguas-claras', day_of_week: 4, start_minute: 1110, end_minute: 1170, block_type: 'ESTUDOS_SERIADOS', notes: 'Estudos seriados' },
      { id: 'blk-daysy-recep-sab', professor_id: 'prof-daysy', location_id: 'samambaia', day_of_week: 6, start_minute: 540, end_minute: 600, block_type: 'RECEPCAO', notes: 'Acolhimento matinal' }
    ],
    absences: [
      { id: 'abs-demo-1', professor_id: 'prof-eduardo', start_date: '2025-09-22', end_date: '2025-09-24', reason: 'Congresso de Filosofia', default_substitute_id: 'prof-gustavo', professor_name: 'Eduardo', substitute_name: 'Gustavo' }
    ],
    rooms: [
      { id: 'ac-guinevere', location_id: 'aguas-claras', name: 'Guinevere', capacity: 44, floor_label: '1º Andar', display_order: 1, is_active: 1 },
      { id: 'ac-percival', location_id: 'aguas-claras', name: 'Percival', capacity: 22, floor_label: '1º Andar', display_order: 2, is_active: 1 },
      { id: 'ac-gawain', location_id: 'aguas-claras', name: 'Gawain', capacity: 22, floor_label: '1º Andar', display_order: 3, is_active: 1 },
      { id: 'ac-galahad', location_id: 'aguas-claras', name: 'Galahad', capacity: 19, floor_label: '2º Andar', display_order: 4, is_active: 1 },
      { id: 'ac-merlin', location_id: 'aguas-claras', name: 'Merlin', capacity: 14, floor_label: '2º Andar', display_order: 5, is_active: 1 },
      { id: 'ac-lancelot', location_id: 'aguas-claras', name: 'Lancelot', capacity: 13, floor_label: '2º Andar', display_order: 6, is_active: 1 },
      { id: 'ac-salao-camelot', location_id: 'aguas-claras', name: 'Salão Camelot', capacity: 80, floor_label: 'Térreo', display_order: 7, is_active: 1 },
      { id: 'ac-biblioteca', location_id: 'aguas-claras', name: 'Biblioteca', capacity: 15, floor_label: 'Térreo', display_order: 8, is_active: 1 },
      { id: 'sam-sala-1', location_id: 'samambaia', name: 'Sala Platão', capacity: 35, floor_label: 'Térreo', display_order: 1, is_active: 1 },
      { id: 'sam-sala-2', location_id: 'samambaia', name: 'Sala Sócrates', capacity: 25, floor_label: 'Térreo', display_order: 2, is_active: 1 }
    ],
    cohorts: [
      { id: 'ac-T21A', location_id: 'aguas-claras', code: 'T21A', symbolic_name: 'Sabedoria', level_number: 1, principal_professor_id: 'prof-gustavo', principal_professor_name: 'Gustavo', cached_headcount: 28, is_active: 1 },
      { id: 'ac-T21B', location_id: 'aguas-claras', code: 'T21B', symbolic_name: 'Harmonia', level_number: 1, principal_professor_id: 'prof-debora', principal_professor_name: 'Débora', cached_headcount: 18, is_active: 1 },
      { id: 'ac-T32A', location_id: 'aguas-claras', code: 'T32A', symbolic_name: 'Justiça', level_number: 2, principal_professor_id: 'prof-luisa', principal_professor_name: 'Luísa', cached_headcount: 16, is_active: 1 },
      { id: 'ac-T41A', location_id: 'aguas-claras', code: 'T41A', symbolic_name: 'Coragem', level_number: 3, principal_professor_id: 'prof-daysy', principal_professor_name: 'Daysy', cached_headcount: 14, is_active: 1 },
      { id: 'ac-T52B', location_id: 'aguas-claras', code: 'T52B', symbolic_name: 'Verdade', level_number: 4, principal_professor_id: 'prof-maria-clara', principal_professor_name: 'Maria Clara', cached_headcount: 12, is_active: 1 }
    ],
    weeks: [
      { id: 'ac-2025-W39', location_id: 'aguas-claras', week_start_date: '2025-09-22', week_end_date: '2025-09-27', label: '22/09 a 27/09/2025', status: 'PUBLISHED' }
    ],
    sessions: [
      { id: 'ses-mat-seg-1', location_id: 'aguas-claras', week_id: null, day_of_week: 1, slot_label: '1º Horário', start_minute: 1200, end_minute: 1260, room_id: 'ac-guinevere', subject_name: 'Ética e Moralidade', professor_id: 'prof-gustavo', professor_name: 'Gustavo', cohort_ids: ['ac-T21A'], cohort_codes: ['T21A'], is_bastiao: 0, event_status: 'CONFIRMADO' },
      { id: 'ses-mat-seg-2', location_id: 'aguas-claras', week_id: null, day_of_week: 1, slot_label: '2º Horário', start_minute: 1270, end_minute: 1330, room_id: 'ac-guinevere', subject_name: 'Bhagavad Gita', professor_id: 'prof-gustavo', professor_name: 'Gustavo', cohort_ids: ['ac-T21A'], cohort_codes: ['T21A'], is_bastiao: 0, event_status: 'CONFIRMADO' },
      { id: 'ses-mat-seg-3', location_id: 'aguas-claras', week_id: null, day_of_week: 1, slot_label: '1º Horário', start_minute: 1200, end_minute: 1260, room_id: 'ac-percival', subject_name: 'Simbologia do Antigo Egito', professor_id: 'prof-debora', professor_name: 'Débora', cohort_ids: ['ac-T21B'], cohort_codes: ['T21B'], is_bastiao: 0, event_status: 'CONFIRMADO' },
      { id: 'ses-mat-ter-1', location_id: 'aguas-claras', week_id: null, day_of_week: 2, slot_label: '1º Horário', start_minute: 1200, end_minute: 1260, room_id: 'ac-gawain', subject_name: 'A Voz do Silêncio', professor_id: 'prof-luisa', professor_name: 'Luísa', cohort_ids: ['ac-T32A'], cohort_codes: ['T32A'], is_bastiao: 0, event_status: 'CONFIRMADO' },
      { id: 'ses-mat-qua-1', location_id: 'aguas-claras', week_id: null, day_of_week: 3, slot_label: '1º Horário', start_minute: 1200, end_minute: 1260, room_id: 'ac-galahad', subject_name: 'Mito da Caverna de Platão', professor_id: 'prof-daysy', professor_name: 'Daysy', cohort_ids: ['ac-T41A'], cohort_codes: ['T41A'], is_bastiao: 0, event_status: 'CONFIRMADO' },
      { id: 'ses-mat-unsched-1', location_id: 'aguas-claras', week_id: null, day_of_week: 2, slot_label: '2º Horário', start_minute: 1270, end_minute: 1330, room_id: null, subject_name: 'Estudo de Textos Clássicos', professor_id: 'prof-eduardo', professor_name: 'Eduardo', cohort_ids: ['ac-T21B'], cohort_codes: ['T21B'], is_bastiao: 0, event_status: 'NAO_ALOCADO' }
    ]
  };

  async function mockFallback(method, urlStr, body) {
    const url = new URL(urlStr, window.location.href);
    const pathname = url.pathname;

    if (pathname.includes('/api/core/login') && method === 'POST') {
      const email = (body.email || '').toLowerCase().trim();
      const user = mockDb.users.find(u => u.email.toLowerCase() === email && u.is_active === 1);
      if (user && body.password === 'Acropole@2025') {
        const rawOtp = (body.otp || body.mfa_code || '000000').toString().replace(/[\s-]/g, '');
        if (rawOtp === user.mfa_code) {
          const fakeToken = `mock-token-${user.id}-${Date.now()}`;
          return { success: true, token: fakeToken, user };
        }
      }
      throw new Error('Credenciais ou código MFA inválidos (padrão: Acropole@2025 / 000000)');
    }

    if (pathname.includes('/api/core/locations')) {
      if (method === 'GET') {
        return { locations: [...mockDb.locations] };
      }
      if (method === 'POST') {
        const newLoc = { id: body.id || body.slug, name: body.name, slug: body.slug || body.id, is_active: 1 };
        mockDb.locations.push(newLoc);
        return { success: true, location: newLoc };
      }
      if (method === 'PUT') {
        const idx = mockDb.locations.findIndex(l => l.id === body.id);
        if (idx !== -1) {
          mockDb.locations[idx] = { ...mockDb.locations[idx], ...body };
          return { success: true, location: mockDb.locations[idx] };
        }
        throw new Error('Localidade não encontrada');
      }
      if (method === 'DELETE') {
        const id = url.searchParams.get('id');
        const idx = mockDb.locations.findIndex(l => l.id === id);
        if (idx !== -1) {
          mockDb.locations.splice(idx, 1);
          return { success: true, deleted_id: id };
        }
        throw new Error('Localidade não encontrada');
      }
    }

    if (pathname.includes('/api/core/users')) {
      if (method === 'GET') {
        return { users: [...mockDb.users] };
      }
      if (method === 'POST') {
        const newUser = { id: `usr-${Date.now()}`, ...body, is_active: 1 };
        mockDb.users.push(newUser);
        return { success: true, user: newUser };
      }
      if (method === 'PUT') {
        const idx = mockDb.users.findIndex(u => u.id === body.id);
        if (idx !== -1) {
          mockDb.users[idx] = { ...mockDb.users[idx], ...body };
          return { success: true, updated_id: body.id };
        }
        throw new Error('Usuário não encontrado');
      }
      if (method === 'DELETE') {
        const id = url.searchParams.get('id');
        const idx = mockDb.users.findIndex(u => u.id === id);
        if (idx !== -1) {
          mockDb.users.splice(idx, 1);
          return { success: true, deleted_id: id };
        }
        throw new Error('Usuário não encontrado');
      }
    }

    if (pathname.includes('/api/professors/absences')) {
      if (method === 'GET') {
        const profId = url.searchParams.get('professor_id');
        const list = profId ? mockDb.absences.filter(a => a.professor_id === profId) : mockDb.absences;
        return { absences: [...list] };
      }
      if (method === 'POST') {
        const subProf = mockDb.professors.find(p => p.id === body.default_substitute_id);
        const newAbs = {
          id: `abs-${Date.now()}`,
          ...body,
          substitute_name: subProf ? subProf.name : null
        };
        mockDb.absences.unshift(newAbs);
        return { success: true, absence: newAbs };
      }
      if (method === 'DELETE') {
        const id = url.searchParams.get('id');
        const idx = mockDb.absences.findIndex(a => a.id === id);
        if (idx !== -1) mockDb.absences.splice(idx, 1);
        return { success: true, deleted_id: id };
      }
    }

    if (pathname.includes('/api/professors')) {
      if (method === 'GET') {
        return {
          professors: [...mockDb.professors],
          blocks: [...mockDb.blocks],
          absences: [...mockDb.absences]
        };
      }
      if (method === 'POST') {
        const entity = body.entity || 'professor';
        if (entity === 'professor') {
          const newProf = {
            id: body.id || `prof-${body.name.toLowerCase().replace(/\s+/g, '-')}`,
            name: body.name,
            email: body.email,
            phone: body.phone,
            specialty: body.specialty || 'Filosofia',
            weekly_hours_target: body.weekly_hours_target || 0,
            is_active: 1
          };
          mockDb.professors.push(newProf);
          return { success: true, professor: newProf };
        }
        if (entity === 'block') {
          const newBlk = { id: `blk-${Date.now()}`, ...body };
          mockDb.blocks.push(newBlk);
          return { success: true, block: newBlk };
        }
      }
      if (method === 'PUT') {
        const entity = body.entity || 'professor';
        if (entity === 'professor') {
          const idx = mockDb.professors.findIndex(p => p.id === body.id);
          if (idx !== -1) {
            mockDb.professors[idx] = { ...mockDb.professors[idx], ...body };
            return { success: true, updated_id: body.id };
          }
        }
        if (entity === 'block') {
          const idx = mockDb.blocks.findIndex(b => b.id === body.id);
          if (idx !== -1) {
            mockDb.blocks[idx] = { ...mockDb.blocks[idx], ...body };
            return { success: true, updated_id: body.id };
          }
        }
      }
      if (method === 'DELETE') {
        const id = url.searchParams.get('id');
        const entity = url.searchParams.get('entity') || 'professor';
        if (entity === 'professor') {
          const idx = mockDb.professors.findIndex(p => p.id === id);
          if (idx !== -1) mockDb.professors.splice(idx, 1);
          return { success: true, deleted_id: id };
        }
        if (entity === 'block') {
          const idx = mockDb.blocks.findIndex(b => b.id === id);
          if (idx !== -1) mockDb.blocks.splice(idx, 1);
          return { success: true, deleted_id: id };
        }
      }
    }

    if (pathname.includes('/api/schedule/snapshot')) {
      const locId = url.searchParams.get('location_id') || 'aguas-claras';
      const wkId = url.searchParams.get('week_id') || null;
      const rooms = mockDb.rooms.filter(r => r.location_id === locId);
      const cohorts = mockDb.cohorts.filter(c => c.location_id === locId);
      const weeks = mockDb.weeks.filter(w => w.location_id === locId);
      const sessions = mockDb.sessions.filter(s => s.location_id === locId && s.week_id === wkId);

      return {
        version_hash: 'mock-snap-' + Date.now(),
        generated_at: new Date().toISOString(),
        location: { id: locId, name: locId === 'aguas-claras' ? 'Águas Claras' : 'Samambaia' },
        week: weeks.find(w => w.id === wkId) || null,
        weeks,
        rooms,
        cohorts,
        sessions,
        cohort_notices: []
      };
    }

    if (pathname.includes('/api/schedule/sessions')) {
      const locId = url.searchParams.get('location_id') || 'aguas-claras';
      const wkId = url.searchParams.get('week_id') || null;

      if (method === 'GET') {
        const activeSessions = mockDb.sessions.filter(s => s.location_id === locId && s.week_id === wkId);
        const otherSessions = mockDb.sessions.filter(s => s.location_id !== locId && s.room_id != null);
        return {
          sessions: activeSessions,
          otherLocationsSessions: otherSessions,
          professorBlocks: mockDb.blocks,
          professorAbsences: mockDb.absences
        };
      }
      if (method === 'POST') {
        const action = body.action || 'UPSERT';
        if (action === 'SWAP') {
          const s1 = mockDb.sessions.find(s => s.id === body.source_session_id);
          const s2 = mockDb.sessions.find(s => s.id === body.target_session_id);
          if (s1 && s2) {
            const tempRoom = s1.room_id;
            const tempStart = s1.start_minute;
            const tempEnd = s1.end_minute;
            const tempDay = s1.day_of_week;
            const tempSlot = s1.slot_label;

            s1.room_id = s2.room_id;
            s1.start_minute = s2.start_minute;
            s1.end_minute = s2.end_minute;
            s1.day_of_week = s2.day_of_week;
            s1.slot_label = s2.slot_label;

            s2.room_id = tempRoom;
            s2.start_minute = tempStart;
            s2.end_minute = tempEnd;
            s2.day_of_week = tempDay;
            s2.slot_label = tempSlot;

            return { success: true, action: 'SWAP' };
          }
        }
        if (action === 'MERGE_BASTIAO') {
          const s1 = mockDb.sessions.find(s => s.id === body.source_session_id);
          const s2 = mockDb.sessions.find(s => s.id === body.target_session_id);
          if (s1 && s2) {
            s2.is_bastiao = 1;
            s2.cohort_ids = Array.from(new Set([...(s2.cohort_ids || []), ...(s1.cohort_ids || [])]));
            s2.cohort_codes = Array.from(new Set([...(s2.cohort_codes || []), ...(s1.cohort_codes || [])]));
            const idx = mockDb.sessions.findIndex(s => s.id === body.source_session_id);
            if (idx !== -1) mockDb.sessions.splice(idx, 1);
            return { success: true, action: 'MERGE_BASTIAO' };
          }
        }
        if (action === 'SPLIT_BASTIAO') {
          const s = mockDb.sessions.find(x => x.id === body.session_id);
          if (s && (s.cohort_ids || []).length > 1) {
            s.is_bastiao = 0;
            const extraCohorts = s.cohort_ids.slice(1);
            s.cohort_ids = [s.cohort_ids[0]];
            s.cohort_codes = [s.cohort_codes[0]];

            extraCohorts.forEach(cId => {
              const cohortObj = mockDb.cohorts.find(c => c.id === cId);
              mockDb.sessions.push({
                ...s,
                id: `ses-split-${Date.now()}-${Math.random().toString(36).substr(2, 3)}`,
                room_id: null,
                event_status: 'NAO_ALOCADO',
                cohort_ids: [cId],
                cohort_codes: [cohortObj ? cohortObj.code : cId],
                is_bastiao: 0
              });
            });
            return { success: true, action: 'SPLIT_BASTIAO' };
          }
        }

        // UPSERT
        const idx = mockDb.sessions.findIndex(s => s.id === body.id);
        if (idx !== -1) {
          mockDb.sessions[idx] = { ...mockDb.sessions[idx], ...body };
          return { success: true, session_id: body.id };
        } else {
          const newId = body.id || `ses-${Date.now()}`;
          const newSession = { ...body, id: newId };
          mockDb.sessions.push(newSession);
          return { success: true, session_id: newId };
        }
      }
      if (method === 'DELETE') {
        const id = url.searchParams.get('id');
        const idx = mockDb.sessions.findIndex(s => s.id === id);
        if (idx !== -1) mockDb.sessions.splice(idx, 1);
        return { success: true, deleted_id: id };
      }
    }

    if (pathname.includes('/api/schedule/rooms-cohorts')) {
      const locId = url.searchParams.get('location_id') || 'aguas-claras';
      if (method === 'GET') {
        return {
          rooms: mockDb.rooms.filter(r => r.location_id === locId),
          cohorts: mockDb.cohorts.filter(c => c.location_id === locId),
          weeks: mockDb.weeks.filter(w => w.location_id === locId)
        };
      }
    }

    throw new Error(`Rota mock não implementada: ${pathname}`);
  }

  const ApiClient = {
    async request(endpoint, options = {}) {
      const method = (options.method || 'GET').toUpperCase();
      const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      };

      const token = getStoredToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const isStaticOrFile = window.location.protocol === 'file:' || !window.location.host;

      try {
        if (!isStaticOrFile) {
          const res = await fetch(endpoint, {
            method,
            headers,
            body: options.body ? JSON.stringify(options.body) : undefined
          });

          if (res.status === 304) {
            return null; // Not modified
          }

          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error(data.error || `Erro HTTP ${res.status}`);
          }
          return data;
        } else {
          return await mockFallback(method, endpoint, options.body);
        }
      } catch (err) {
        // Se a requisição real falhar por falta de worker, tenta mockFallback
        if (!isStaticOrFile && (err.message.includes('Failed to fetch') || err.message.includes('404'))) {
          console.warn('[ApiClient] Endpoint real indisponível, utilizando fallback em memória:', endpoint);
          return await mockFallback(method, endpoint, options.body);
        }
        throw err;
      }
    },

    get(endpoint, options = {}) {
      return this.request(endpoint, { ...options, method: 'GET' });
    },

    post(endpoint, body, options = {}) {
      return this.request(endpoint, { ...options, method: 'POST', body });
    },

    put(endpoint, body, options = {}) {
      return this.request(endpoint, { ...options, method: 'PUT', body });
    },

    delete(endpoint, options = {}) {
      return this.request(endpoint, { ...options, method: 'DELETE' });
    }
  };

  window.ApiClient = ApiClient;
})(window);

