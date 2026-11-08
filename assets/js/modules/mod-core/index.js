// assets/js/modules/mod-core/index.js
// Lógica de Autenticação, Login Minerva e CRUD Total de Localidades/Usuários (M1)

(function(window) {
  const ModCore = {
    /**
     * Inicializa a tela de login (secure_multi-factor_login/index.html)
     */
    initLogin() {
      const form = document.querySelector('form');
      const emailInput = document.getElementById('email');
      const passwordInput = document.getElementById('password');
      const otpInput = document.getElementById('otp');
      const togglePasswordBtn = document.querySelector('form span.material-symbols-outlined:last-of-type') || document.querySelector('.cursor-pointer');
      const googleBtn = document.querySelector('button[type="button"]');
      const resendBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Reenviar'));
      const forgotLink = Array.from(document.querySelectorAll('a')).find(a => a.textContent.includes('Esqueceu'));

      // Remove onsubmit inline se houver
      if (form) {
        form.removeAttribute('onsubmit');
      }

      // Máscara e sanitização do OTP (000 000)
      if (otpInput) {
        otpInput.setAttribute('pattern', '[0-9 ]*');
        otpInput.addEventListener('input', (e) => {
          let val = e.target.value.replace(/\D/g, '').substr(0, 6);
          if (val.length > 3) {
            val = val.substr(0, 3) + ' ' + val.substr(3);
          }
          e.target.value = val;
        });
      }

      // Alternar visualização da senha
      if (togglePasswordBtn && passwordInput) {
        togglePasswordBtn.addEventListener('click', () => {
          const isPass = passwordInput.getAttribute('type') === 'password';
          passwordInput.setAttribute('type', isPass ? 'text' : 'password');
          togglePasswordBtn.textContent = isPass ? 'visibility' : 'visibility_off';
        });
      }

      // Botão "Entrar com Google" -> Seletor Rápido de Contas de Demonstração
      if (googleBtn) {
        googleBtn.addEventListener('click', () => {
          this.showDemoAccountsModal((account) => {
            if (emailInput) emailInput.value = account.email;
            if (passwordInput) passwordInput.value = 'Acropole@2025';
            if (otpInput) otpInput.value = '000 000';
            UIToast.info(`Credenciais de demonstração preenchidas: ${account.name}`);
          });
        });
      }

      // Reenviar código
      if (resendBtn) {
        resendBtn.addEventListener('click', () => {
          UIToast.info('Novo código de verificação enviado: use 000 000 para acesso de demonstração.');
        });
      }

      // Esqueceu a senha
      if (forgotLink) {
        forgotLink.addEventListener('click', (e) => {
          e.preventDefault();
          UIToast.info('Para redefinir sua senha, solicite um link de restauração junto à Secretaria da unidade.');
        });
      }

      // Submissão do formulário de login
      if (form) {
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const email = emailInput ? emailInput.value.trim() : '';
          const password = passwordInput ? passwordInput.value : '';
          const otp = otpInput ? otpInput.value.replace(/[\s-]/g, '') : '000000';

          if (!email || !password) {
            UIToast.error('Preencha seu email e senha');
            return;
          }

          const submitBtn = form.querySelector('button[type="submit"]');
          const originalText = submitBtn ? submitBtn.textContent : 'Entrar';
          if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Autenticando...';
          }

          try {
            const data = await ApiClient.post('/api/core/login', { email, password, otp });
            if (data.success && data.token) {
              AuthGuard.setSession(data.token, data.user);
              UIToast.success(`Bem-vindo(a), ${data.user.name}!`);

              // Redirecionamento por perfil
              setTimeout(() => {
                if (data.user.role === 'ADMIN' || data.user.role === 'SECRETARIA') {
                  window.location.href = '../admin_intelligent_schedule_dashboard/index.html';
                } else if (data.user.role === 'PROFESSOR') {
                  window.location.href = '../professores_directory/index.html';
                } else if (data.user.role === 'ALUNO') {
                  window.location.href = '../mobile_student_agenda_view/index.html';
                } else {
                  window.location.href = '../../index.html';
                }
              }, 600);
            } else {
              throw new Error(data.error || 'Credenciais inválidas');
            }
          } catch (err) {
            UIToast.error(err.message || 'Erro ao realizar login');
          } finally {
            if (submitBtn) {
              submitBtn.disabled = false;
              submitBtn.textContent = originalText;
            }
          }
        });
      }
    },

    /**
     * Modal com contas de demonstração (seed) para login em 1 clique
     */
    showDemoAccountsModal(onSelect) {
      const overlay = document.createElement('div');
      overlay.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4';
      overlay.innerHTML = `
        <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-6 space-y-4">
          <div class="flex items-center justify-between border-b pb-3 dark:border-slate-800">
            <h3 class="text-lg font-bold text-slate-900 dark:text-white">Selecione uma Conta de Demonstração</h3>
            <button id="close-demo" class="text-slate-400 hover:text-slate-600 dark:hover:text-white">&times;</button>
          </div>
          <div class="space-y-2">
            <button data-demo="admin" class="w-full text-left p-3 rounded-xl border border-slate-200 hover:border-primary hover:bg-primary/5 transition-all flex items-center gap-3">
              <span class="material-symbols-outlined text-primary text-[28px]">shield_person</span>
              <div>
                <p class="font-bold text-sm text-slate-900 dark:text-white">Coordenação Geral (ADMIN)</p>
                <p class="text-xs text-slate-500">admin@acropole.org.br &bull; CRUD Total</p>
              </div>
            </button>
            <button data-demo="secretaria" class="w-full text-left p-3 rounded-xl border border-slate-200 hover:border-primary hover:bg-primary/5 transition-all flex items-center gap-3">
              <span class="material-symbols-outlined text-primary text-[28px]">support_agent</span>
              <div>
                <p class="font-bold text-sm text-slate-900 dark:text-white">Secretaria Unidades (SECRETARIA)</p>
                <p class="text-xs text-slate-500">secretaria@acropole.org.br &bull; CRUD Operacional</p>
              </div>
            </button>
            <button data-demo="prof" class="w-full text-left p-3 rounded-xl border border-slate-200 hover:border-primary hover:bg-primary/5 transition-all flex items-center gap-3">
              <span class="material-symbols-outlined text-primary text-[28px]">school</span>
              <div>
                <p class="font-bold text-sm text-slate-900 dark:text-white">Prof. Gustavo (PROFESSOR)</p>
                <p class="text-xs text-slate-500">gustavo@acropole.org.br &bull; Painel Docente</p>
              </div>
            </button>
            <button data-demo="aluno" class="w-full text-left p-3 rounded-xl border border-slate-200 hover:border-primary hover:bg-primary/5 transition-all flex items-center gap-3">
              <span class="material-symbols-outlined text-primary text-[28px]">person</span>
              <div>
                <p class="font-bold text-sm text-slate-900 dark:text-white">Aluno T21A (ALUNO)</p>
                <p class="text-xs text-slate-500">aluno.t21a@acropole.org.br &bull; Agenda & Financeiro</p>
              </div>
            </button>
          </div>
          <p class="text-[11px] text-slate-400 text-center">Senha padrão: <code class="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded font-mono">Acropole@2025</code> | MFA: <code class="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded font-mono">000 000</code></p>
        </div>
      `;
      document.body.appendChild(overlay);

      overlay.querySelector('#close-demo').onclick = () => overlay.remove();

      const demos = {
        admin: { name: 'Coordenação Geral', email: 'admin@acropole.org.br' },
        secretaria: { name: 'Secretaria Nova Acrópole', email: 'secretaria@acropole.org.br' },
        prof: { name: 'Prof. Gustavo', email: 'gustavo@acropole.org.br' },
        aluno: { name: 'Aluno T21A', email: 'aluno.t21a@acropole.org.br' }
      };

      overlay.querySelectorAll('[data-demo]').forEach(btn => {
        btn.onclick = () => {
          const key = btn.getAttribute('data-demo');
          const account = demos[key];
          overlay.remove();
          if (onSelect) onSelect(account);
        };
      });
    },

    /**
     * Inicializa a tela Hub (index.html) com painel administrativo e CRUD de Localidades e Usuários
     */
    initHub() {
      const user = AuthGuard.getCurrentUser();
      const headerRight = document.querySelector('header .max-w-5xl');

      // Adiciona área de usuário no cabeçalho do Hub
      if (headerRight) {
        let userBadge = document.getElementById('hub-user-badge');
        if (!userBadge) {
          userBadge = document.createElement('div');
          userBadge.id = 'hub-user-badge';
          userBadge.className = 'flex items-center gap-3';
          headerRight.appendChild(userBadge);
        }

        if (user) {
          userBadge.innerHTML = `
            <div class="flex items-center gap-2 bg-primary/10 border border-primary/20 px-3 py-1.5 rounded-lg text-xs font-medium text-primary">
              <span class="material-symbols-outlined text-[16px]">account_circle</span>
              <span><strong>${user.name}</strong> (${user.role})</span>
            </div>
            <button id="hub-logout-btn" class="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-red-600 border border-slate-200 rounded-lg hover:border-red-200 transition-colors">
              Sair
            </button>
          `;
          document.getElementById('hub-logout-btn').onclick = () => {
            AuthGuard.clearSession();
            UIToast.info('Sessão encerrada com sucesso');
            setTimeout(() => window.location.reload(), 400);
          };
        } else {
          userBadge.innerHTML = `
            <a href="stitch_mobile_student_agenda_view/secure_multi-factor_login/index.html" class="flex items-center gap-1.5 bg-primary hover:bg-primary-hover text-white px-4 py-2 rounded-lg text-xs font-bold shadow-sm transition-colors">
              <span class="material-symbols-outlined text-[16px]">login</span>
              Fazer Login
            </a>
          `;
        }
      }

      // Se for ADMIN ou SECRETARIA, renderiza a seção de Gestão de Localidades e Usuários (CRUD Total)
      if (user && (user.role === 'ADMIN' || user.role === 'SECRETARIA')) {
        let adminSection = document.getElementById('hub-admin-crud-section');
        if (!adminSection) {
          adminSection = document.createElement('div');
          adminSection.id = 'hub-admin-crud-section';
          adminSection.className = 'mb-8 p-6 bg-white border border-primary/20 rounded-2xl shadow-sm';
          adminSection.innerHTML = `
            <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4 pb-4 border-b border-slate-100">
              <div>
                <span class="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded">
                  <span class="material-symbols-outlined text-[14px]">admin_panel_settings</span>
                  Controle Secretaria & Administração (Módulo 1)
                </span>
                <h3 class="text-xl font-bold text-slate-900 mt-1">Gestão de Localidades e Usuários</h3>
                <p class="text-xs text-slate-500">Criação, edição e exclusão (CRUD Total) de sedes e contas de acesso no banco Cloudflare D1.</p>
              </div>
              <div class="flex items-center gap-2">
                <button id="btn-manage-locations" class="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white text-xs font-bold rounded-lg hover:bg-primary-hover shadow-sm transition-colors">
                  <span class="material-symbols-outlined text-[16px]">location_on</span>
                  Gerenciar Localidades
                </button>
                <button id="btn-manage-users" class="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 text-white text-xs font-bold rounded-lg hover:bg-slate-700 shadow-sm transition-colors">
                  <span class="material-symbols-outlined text-[16px]">manage_accounts</span>
                  Gerenciar Usuários
                </button>
              </div>
            </div>
            <div id="crud-results-container" class="hidden pt-2"></div>
          `;

          const main = document.querySelector('main');
          if (main) {
            main.insertBefore(adminSection, main.children[1] || main.firstChild);
          }

          document.getElementById('btn-manage-locations').onclick = () => this.openLocationsModal();
          document.getElementById('btn-manage-users').onclick = () => this.openUsersModal();
        }
      }
    },

    /**
     * Modal de CRUD Total de Localidades
     */
    async openLocationsModal() {
      try {
        const data = await ApiClient.get('/api/core/locations?all=true');
        const locations = data.locations || [];

        const overlay = document.createElement('div');
        overlay.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4';
        overlay.innerHTML = `
          <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div class="flex items-center justify-between border-b pb-3 dark:border-slate-800">
              <h3 class="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span class="material-symbols-outlined text-primary">location_on</span>
                Gestão de Localidades (CRUD Total)
              </h3>
              <button id="close-loc-modal" class="text-slate-400 hover:text-slate-600 dark:hover:text-white">&times;</button>
            </div>

            <!-- Form Nova Localidade -->
            <form id="form-new-loc" class="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row gap-3 items-end">
              <div class="flex-1 w-full">
                <label class="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Nome da Nova Sede / Localidade</label>
                <input id="new-loc-name" type="text" placeholder="Ex: Asa Sul, Taguatinga..." required class="w-full text-xs px-3 py-2 border rounded-lg dark:bg-slate-800 dark:text-white border-slate-300 dark:border-slate-600">
              </div>
              <div class="w-full sm:w-40">
                <label class="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Identificador (Slug)</label>
                <input id="new-loc-slug" type="text" placeholder="Ex: asa-sul" class="w-full text-xs px-3 py-2 border rounded-lg dark:bg-slate-800 dark:text-white border-slate-300 dark:border-slate-600">
              </div>
              <button type="submit" class="w-full sm:w-auto px-4 py-2 bg-primary text-white text-xs font-bold rounded-lg hover:bg-primary-hover shadow-sm transition-colors flex items-center justify-center gap-1">
                <span class="material-symbols-outlined text-[16px]">add</span> Adicionar
              </button>
            </form>

            <!-- Lista de Localidades -->
            <div class="space-y-2">
              <h4 class="text-xs font-bold text-slate-500 uppercase tracking-wider">Localidades Cadastradas</h4>
              <div class="divide-y divide-slate-100 dark:divide-slate-800 border rounded-xl overflow-hidden">
                ${locations.map(loc => `
                  <div class="p-3 bg-white dark:bg-slate-900 flex items-center justify-between gap-4">
                    <div>
                      <span class="font-bold text-sm text-slate-900 dark:text-white">${loc.name}</span>
                      <span class="text-xs text-slate-400 font-mono ml-2">(${loc.id})</span>
                      <span class="text-[10px] ml-2 px-2 py-0.5 rounded-full font-bold ${loc.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}">
                        ${loc.is_active ? 'Ativa' : 'Inativa'}
                      </span>
                    </div>
                    <div class="flex items-center gap-2">
                      <button data-loc-toggle="${loc.id}" data-active="${loc.is_active}" class="px-2 py-1 text-xs border rounded hover:bg-slate-50 text-slate-600">
                        ${loc.is_active ? 'Desativar' : 'Ativar'}
                      </button>
                      <button data-loc-delete="${loc.id}" class="p-1 text-red-600 hover:bg-red-50 rounded">
                        <span class="material-symbols-outlined text-[18px]">delete</span>
                      </button>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
        `;
        document.body.appendChild(overlay);

        overlay.querySelector('#close-loc-modal').onclick = () => overlay.remove();

        // Criar Localidade
        overlay.querySelector('#form-new-loc').onsubmit = async (e) => {
          e.preventDefault();
          const name = overlay.querySelector('#new-loc-name').value.trim();
          const slug = overlay.querySelector('#new-loc-slug').value.trim() || name.toLowerCase().replace(/\s+/g, '-');
          try {
            await ApiClient.post('/api/core/locations', { name, slug });
            UIToast.success(`Localidade "${name}" cadastrada com sucesso!`);
            overlay.remove();
            this.openLocationsModal();
          } catch (err) {
            UIToast.error(err.message);
          }
        };

        // Alternar status
        overlay.querySelectorAll('[data-loc-toggle]').forEach(btn => {
          btn.onclick = async () => {
            const id = btn.getAttribute('data-loc-toggle');
            const currentActive = btn.getAttribute('data-active') === '1';
            const loc = locations.find(l => l.id === id);
            try {
              await ApiClient.put('/api/core/locations', { id, name: loc.name, is_active: !currentActive });
              UIToast.success(`Localidade ${!currentActive ? 'ativada' : 'desativada'} com sucesso!`);
              overlay.remove();
              this.openLocationsModal();
            } catch (err) {
              UIToast.error(err.message);
            }
          };
        });

        // Excluir
        overlay.querySelectorAll('[data-loc-delete]').forEach(btn => {
          btn.onclick = () => {
            const id = btn.getAttribute('data-loc-delete');
            UIToast.confirm({
              title: 'Excluir Localidade',
              message: `Deseja realmente excluir a localidade ${id}?`,
              onConfirm: async () => {
                try {
                  await ApiClient.delete(`/api/core/locations?id=${id}&hard=true`);
                  UIToast.success('Localidade removida com sucesso!');
                  overlay.remove();
                  this.openLocationsModal();
                } catch (err) {
                  UIToast.error(err.message);
                }
              }
            });
          };
        });

      } catch (err) {
        UIToast.error('Erro ao carregar localidades: ' + err.message);
      }
    },

    /**
     * Modal de CRUD Total de Usuários
     */
    async openUsersModal() {
      try {
        const data = await ApiClient.get('/api/core/users');
        const users = data.users || [];

        const overlay = document.createElement('div');
        overlay.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4';
        overlay.innerHTML = `
          <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-3xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div class="flex items-center justify-between border-b pb-3 dark:border-slate-800">
              <h3 class="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span class="material-symbols-outlined text-primary">manage_accounts</span>
                Gestão de Usuários e Perfis (CRUD Total)
              </h3>
              <button id="close-user-modal" class="text-slate-400 hover:text-slate-600 dark:hover:text-white">&times;</button>
            </div>

            <!-- Form Novo Usuário -->
            <form id="form-new-user" class="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div>
                <label class="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Nome Completo</label>
                <input id="new-user-name" type="text" placeholder="Ex: Maria Clara" required class="w-full text-xs px-3 py-2 border rounded-lg dark:bg-slate-800 dark:text-white border-slate-300 dark:border-slate-600">
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Email</label>
                <input id="new-user-email" type="email" placeholder="maria@acropole.org.br" required class="w-full text-xs px-3 py-2 border rounded-lg dark:bg-slate-800 dark:text-white border-slate-300 dark:border-slate-600">
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Perfil (Role)</label>
                <select id="new-user-role" class="w-full text-xs px-3 py-2 border rounded-lg dark:bg-slate-800 dark:text-white border-slate-300 dark:border-slate-600">
                  <option value="ADMIN">ADMIN (Coordenação)</option>
                  <option value="SECRETARIA">SECRETARIA</option>
                  <option value="PROFESSOR">PROFESSOR</option>
                  <option value="ALUNO" selected>ALUNO</option>
                </select>
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Senha Inicial</label>
                <input id="new-user-password" type="text" value="Acropole@2025" required class="w-full text-xs px-3 py-2 border rounded-lg dark:bg-slate-800 dark:text-white border-slate-300 dark:border-slate-600 font-mono">
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Código MFA</label>
                <input id="new-user-mfa" type="text" value="000000" class="w-full text-xs px-3 py-2 border rounded-lg dark:bg-slate-800 dark:text-white border-slate-300 dark:border-slate-600 font-mono">
              </div>
              <div class="flex items-end">
                <button type="submit" class="w-full px-4 py-2 bg-primary text-white text-xs font-bold rounded-lg hover:bg-primary-hover shadow-sm transition-colors flex items-center justify-center gap-1">
                  <span class="material-symbols-outlined text-[16px]">person_add</span> Cadastrar Usuário
                </button>
              </div>
            </form>

            <!-- Lista de Usuários -->
            <div class="space-y-2">
              <h4 class="text-xs font-bold text-slate-500 uppercase tracking-wider">Usuários Cadastrados (${users.length})</h4>
              <div class="divide-y divide-slate-100 dark:divide-slate-800 border rounded-xl overflow-hidden">
                ${users.map(u => `
                  <div class="p-3 bg-white dark:bg-slate-900 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div class="flex items-center gap-2">
                        <span class="font-bold text-sm text-slate-900 dark:text-white">${u.name}</span>
                        <span class="text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                          u.role === 'ADMIN' ? 'bg-purple-100 text-purple-800' :
                          u.role === 'SECRETARIA' ? 'bg-blue-100 text-blue-800' :
                          u.role === 'PROFESSOR' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
                        }">${u.role}</span>
                        <span class="text-[10px] px-2 py-0.5 rounded-full ${u.is_active ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}">
                          ${u.is_active ? 'Ativo' : 'Inativo'}
                        </span>
                      </div>
                      <p class="text-xs text-slate-500 mt-0.5">${u.email} &bull; Sede: ${u.default_location_id} &bull; MFA: <span class="font-mono">${u.mfa_code || '000000'}</span></p>
                    </div>
                    <div class="flex items-center gap-2 self-end sm:self-auto">
                      <button data-user-edit="${u.id}" class="px-2.5 py-1 text-xs border rounded hover:bg-slate-50 text-slate-700 flex items-center gap-1">
                        <span class="material-symbols-outlined text-[14px]">edit</span> Editar
                      </button>
                      <button data-user-delete="${u.id}" class="p-1 text-red-600 hover:bg-red-50 rounded">
                        <span class="material-symbols-outlined text-[18px]">delete</span>
                      </button>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
        `;
        document.body.appendChild(overlay);

        overlay.querySelector('#close-user-modal').onclick = () => overlay.remove();

        // Cadastrar Usuário
        overlay.querySelector('#form-new-user').onsubmit = async (e) => {
          e.preventDefault();
          const name = overlay.querySelector('#new-user-name').value.trim();
          const email = overlay.querySelector('#new-user-email').value.trim();
          const role = overlay.querySelector('#new-user-role').value;
          const password = overlay.querySelector('#new-user-password').value;
          const mfa_code = overlay.querySelector('#new-user-mfa').value;

          try {
            await ApiClient.post('/api/core/users', { name, email, role, password, mfa_code });
            UIToast.success(`Usuário ${name} cadastrado com sucesso!`);
            overlay.remove();
            this.openUsersModal();
          } catch (err) {
            UIToast.error(err.message);
          }
        };

        // Editar Usuário
        overlay.querySelectorAll('[data-user-edit]').forEach(btn => {
          btn.onclick = () => {
            const id = btn.getAttribute('data-user-edit');
            const targetUser = users.find(u => u.id === id);
            this.openEditUserModal(targetUser, () => {
              overlay.remove();
              this.openUsersModal();
            });
          };
        });

        // Excluir Usuário
        overlay.querySelectorAll('[data-user-delete]').forEach(btn => {
          btn.onclick = () => {
            const id = btn.getAttribute('data-user-delete');
            UIToast.confirm({
              title: 'Excluir Usuário',
              message: `Deseja realmente excluir a conta do usuário ${id}?`,
              onConfirm: async () => {
                try {
                  await ApiClient.delete(`/api/core/users?id=${id}&hard=true`);
                  UIToast.success('Usuário excluído com sucesso!');
                  overlay.remove();
                  this.openUsersModal();
                } catch (err) {
                  UIToast.error(err.message);
                }
              }
            });
          };
        });

      } catch (err) {
        UIToast.error('Erro ao listar usuários: ' + err.message);
      }
    },

    /**
     * Modal para editar usuário existente
     */
    openEditUserModal(user, onUpdated) {
      const editOverlay = document.createElement('div');
      editOverlay.className = 'fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4';
      editOverlay.innerHTML = `
        <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-6 space-y-4">
          <div class="flex items-center justify-between border-b pb-3 dark:border-slate-800">
            <h3 class="text-base font-bold text-slate-900 dark:text-white">Editar Usuário</h3>
            <button id="close-edit-user" class="text-slate-400 hover:text-slate-600 dark:hover:text-white">&times;</button>
          </div>
          <form id="form-edit-user" class="space-y-3">
            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-1">Nome</label>
              <input id="edit-name" type="text" value="${user.name}" required class="w-full text-xs px-3 py-2 border rounded-lg">
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-1">Email</label>
              <input id="edit-email" type="email" value="${user.email}" required class="w-full text-xs px-3 py-2 border rounded-lg">
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-1">Perfil (Role)</label>
              <select id="edit-role" class="w-full text-xs px-3 py-2 border rounded-lg">
                <option value="ADMIN" ${user.role === 'ADMIN' ? 'selected' : ''}>ADMIN</option>
                <option value="SECRETARIA" ${user.role === 'SECRETARIA' ? 'selected' : ''}>SECRETARIA</option>
                <option value="PROFESSOR" ${user.role === 'PROFESSOR' ? 'selected' : ''}>PROFESSOR</option>
                <option value="ALUNO" ${user.role === 'ALUNO' ? 'selected' : ''}>ALUNO</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-1">Redefinir Senha (opcional)</label>
              <input id="edit-password" type="text" placeholder="Deixe em branco para manter a atual" class="w-full text-xs px-3 py-2 border rounded-lg font-mono">
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-1">Código MFA</label>
              <input id="edit-mfa" type="text" value="${user.mfa_code || '000000'}" class="w-full text-xs px-3 py-2 border rounded-lg font-mono">
            </div>
            <div class="flex items-center gap-2 pt-1">
              <input type="checkbox" id="edit-active" ${user.is_active ? 'checked' : ''} class="rounded text-primary">
              <label for="edit-active" class="text-xs font-semibold text-slate-700">Conta ativa</label>
            </div>
            <div class="flex justify-end gap-2 pt-2">
              <button type="button" id="cancel-edit-user" class="px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
              <button type="submit" class="px-4 py-2 text-xs font-bold text-white bg-primary hover:bg-primary-hover rounded-lg shadow-sm">Salvar Alterações</button>
            </div>
          </form>
        </div>
      `;
      document.body.appendChild(editOverlay);

      editOverlay.querySelector('#close-edit-user').onclick = () => editOverlay.remove();
      editOverlay.querySelector('#cancel-edit-user').onclick = () => editOverlay.remove();

      editOverlay.querySelector('#form-edit-user').onsubmit = async (e) => {
        e.preventDefault();
        const payload = {
          id: user.id,
          name: editOverlay.querySelector('#edit-name').value.trim(),
          email: editOverlay.querySelector('#edit-email').value.trim(),
          role: editOverlay.querySelector('#edit-role').value,
          mfa_code: editOverlay.querySelector('#edit-mfa').value.trim(),
          is_active: editOverlay.querySelector('#edit-active').checked
        };
        const pass = editOverlay.querySelector('#edit-password').value.trim();
        if (pass) {
          payload.password = pass;
        }

        try {
          await ApiClient.put('/api/core/users', payload);
          UIToast.success('Usuário atualizado com sucesso!');
          editOverlay.remove();
          if (onUpdated) onUpdated();
        } catch (err) {
          UIToast.error(err.message);
        }
      };
    }
  };

  window.ModCore = ModCore;

  // Auto-inicialização com base na página atual
  document.addEventListener('DOMContentLoaded', () => {
    if (window.location.pathname.includes('secure_multi-factor_login')) {
      ModCore.initLogin();
    } else {
      ModCore.initHub();
    }
  });
})(window);

