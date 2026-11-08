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

