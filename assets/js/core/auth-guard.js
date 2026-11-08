// assets/js/core/auth-guard.js
// Gerenciador de sessão nativa, controle RBAC e hidratação da barra lateral

(function(window) {
  const SESSION_KEY = 'na_auth_session';
  const LOCATION_KEY = 'na_active_location';

  const AuthGuard = {
    getSession() {
      try {
        const raw = localStorage.getItem(SESSION_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        return null;
      }
    },

    getCurrentUser() {
      const session = this.getSession();
      return session ? session.user : null;
    },

    getToken() {
      const session = this.getSession();
      return session ? session.token : null;
    },

    setSession(token, user) {
      localStorage.setItem(SESSION_KEY, JSON.stringify({ token, user, saved_at: Date.now() }));
      if (user && user.default_location_id && !localStorage.getItem(LOCATION_KEY)) {
        this.setActiveLocation(user.default_location_id);
      }
    },

    clearSession() {
      localStorage.removeItem(SESSION_KEY);
    },

    logout(redirectUrl = '../secure_multi-factor_login/index.html') {
      this.clearSession();
      window.location.href = redirectUrl;
    },

    hasRole(roles = []) {
      const user = this.getCurrentUser();
      if (!user) return false;
      if (roles.length === 0) return true;
      return roles.includes(user.role);
    },

    getActiveLocation() {
      return localStorage.getItem(LOCATION_KEY) || 'aguas-claras';
    },

    setActiveLocation(locationId) {
      localStorage.setItem(LOCATION_KEY, locationId);
      window.dispatchEvent(new CustomEvent('na:location-changed', { detail: { locationId } }));
    },

    requireRole(allowedRoles = [], redirectUrl = '../secure_multi-factor_login/index.html') {
      const user = this.getCurrentUser();
      if (!user || (allowedRoles.length > 0 && !allowedRoles.includes(user.role))) {
        window.location.href = redirectUrl;
        return false;
      }
      return true;
    },

    /**
     * Hidrata o rodapé da sidebar e o seletor de perfil/localidade
     */
    hydrateSidebar() {
      const user = this.getCurrentUser();
      const userNameEl = document.querySelector('[data-auth-name]');
      const userRoleEl = document.querySelector('[data-auth-role]');
      const logoutBtn = document.querySelector('[data-auth-logout]');

      if (userNameEl && user) {
        userNameEl.textContent = user.name;
      }
      if (userRoleEl && user) {
        const roleLabels = {
          'ADMIN': 'Administração',
          'SECRETARIA': 'Secretaria',
          'PROFESSOR': 'Professor(a)',
          'ALUNO': 'Aluno(a)'
        };
        userRoleEl.textContent = roleLabels[user.role] || user.role;
      }

      if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
          e.preventDefault();
          this.logout();
        });
      }
    }
  };

  window.AuthGuard = AuthGuard;

  // Auto-hidrata caso DOM já esteja pronto
  document.addEventListener('DOMContentLoaded', () => {
    AuthGuard.hydrateSidebar();
  });
})(window);

