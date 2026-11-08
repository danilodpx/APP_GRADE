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

