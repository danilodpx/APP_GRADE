// assets/js/modules/mod-professors/index.js
// Gestão do Corpo Docente, Agenda Multi-Localidade, Ausências e CRUD Total (Módulo 2)

(function(window) {
  let allProfessors = [];
  let allBlocks = [];
  let allAbsences = [];
  let activeFilter = 'all'; // 'all', 'active', 'inactive'

  const ModProfessors = {
    async init() {
      AuthGuard.hydrateSidebar();
      const user = AuthGuard.getCurrentUser();

      // Configura campo de busca
      const searchInput = document.querySelector('input[type="text"][placeholder*="Buscar"]');
      if (searchInput) {
        searchInput.id = 'prof-search-input';
        searchInput.addEventListener('input', (e) => {
          this.renderTable(e.target.value.toLowerCase().trim());
        });
      }

      // Configura botão de filtro
      const filterBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Filtrar'));
      if (filterBtn) {
        filterBtn.addEventListener('click', () => this.openFilterModal());
      }

      // Configura botão "+ Novo Professor"
      const newProfBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Novo Professor'));
      if (newProfBtn) {
        if (!user || (user.role !== 'ADMIN' && user.role !== 'SECRETARIA')) {
          newProfBtn.title = 'Apenas Administração e Secretaria podem cadastrar professores';
        }
        newProfBtn.addEventListener('click', () => {
          if (!user || (user.role !== 'ADMIN' && user.role !== 'SECRETARIA')) {
            UIToast.warning('Apenas Administração e Secretaria possuem permissão para cadastrar professores.');
            return;
          }
          this.openNewProfessorModal();
        });
      }

      await this.loadData();
    },

    async loadData() {
      try {
        const data = await ApiClient.get('/api/professors?all=true');
        allProfessors = data.professors || [];
        allBlocks = data.blocks || [];
        allAbsences = data.absences || [];
        this.renderTable();
      } catch (err) {
        UIToast.error('Erro ao carregar professores: ' + err.message);
      }
    },

    renderTable(searchTerm = '') {
      const tbody = document.querySelector('table tbody');
      if (!tbody) return;

      const user = AuthGuard.getCurrentUser();
      const isStaff = user && (user.role === 'ADMIN' || user.role === 'SECRETARIA');

      let filtered = allProfessors.filter(p => {
        const matchSearch = p.name.toLowerCase().includes(searchTerm) ||
                            (p.specialty && p.specialty.toLowerCase().includes(searchTerm)) ||
                            (p.email && p.email.toLowerCase().includes(searchTerm));
        if (activeFilter === 'active') return matchSearch && p.is_active === 1;
        if (activeFilter === 'inactive') return matchSearch && p.is_active === 0;
        return matchSearch;
      });

      // Atualiza contador no rodapé
      const countEl = document.getElementById('prof-table-count') || document.querySelector('main .text-slate-500.text-xs');
      if (countEl) {
        countEl.innerHTML = `Mostrando <span class="font-medium text-slate-900 dark:text-white">${filtered.length}</span> de <span class="font-medium text-slate-900 dark:text-white">${allProfessors.length}</span> professores cadastrados`;
      }

      if (filtered.length === 0) {
        tbody.innerHTML = `
          <tr>
            <td colspan="6" class="px-6 py-12 text-center text-slate-400">
              <span class="material-symbols-outlined text-4xl block mb-2 text-slate-300">school</span>
              Nenhum professor encontrado para o critério selecionado.
            </td>
          </tr>
        `;
        return;
      }

      tbody.innerHTML = filtered.map(p => {
        const isSelf = user && user.role === 'PROFESSOR' && user.linked_entity_id === p.id;
        const profBlocks = allBlocks.filter(b => b.professor_id === p.id);
        const profAbs = allAbsences.filter(a => a.professor_id === p.id);

        return `
          <tr class="group hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors ${isSelf ? 'bg-primary/5 dark:bg-primary/10' : ''}">
            <td class="px-6 py-3">
              <div class="size-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center font-bold text-primary text-sm shadow-sm">
                ${p.name.charAt(0)}
              </div>
            </td>
            <td class="px-6 py-3">
              <div class="flex flex-col">
                <span class="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                  ${p.name}
                  ${isSelf ? '<span class="text-[10px] bg-primary text-white px-1.5 py-0.2 rounded font-bold">Você</span>' : ''}
                </span>
                <span class="text-xs text-slate-500 dark:text-slate-400">${p.email || 'Sem email cadastrado'}</span>
              </div>
            </td>
            <td class="px-6 py-3">
              <span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 text-xs font-semibold border border-emerald-200 dark:border-emerald-800">
                ${p.specialty || 'Filosofia'}
              </span>
            </td>
            <td class="px-6 py-3">
              <span class="text-sm text-slate-700 dark:text-slate-300 font-medium">
                ${p.weekly_hours_target || 0}h / semana
              </span>
              <span class="text-[10px] text-slate-400 block">${profBlocks.length} bloco(s) pessoal</span>
            </td>
            <td class="px-6 py-3 text-center">
              <span class="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                p.is_active ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
              }">
                ${p.is_active ? 'Ativo' : 'Inativo'}
              </span>
              ${profAbs.length > 0 ? '<span class="block text-[10px] text-amber-600 font-bold mt-0.5">Ausência agendada</span>' : ''}
            </td>
            <td class="px-6 py-3 text-right">
              <div class="flex items-center justify-end gap-1">
                <button data-action="agenda" data-id="${p.id}" title="Ver Agenda Semanal & Blocos" class="p-1.5 text-slate-500 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors">
                  <span class="material-symbols-outlined text-[18px]">calendar_month</span>
                </button>
                <button data-action="absences" data-id="${p.id}" title="Gerenciar Ausências" class="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors">
                  <span class="material-symbols-outlined text-[18px]">event_busy</span>
                </button>
                ${isStaff ? `
                  <button data-action="edit" data-id="${p.id}" title="Editar Professor" class="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                    <span class="material-symbols-outlined text-[18px]">edit</span>
                  </button>
                  <button data-action="delete" data-id="${p.id}" title="Excluir ou Inativar" class="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                    <span class="material-symbols-outlined text-[18px]">delete</span>
                  </button>
                ` : ''}
              </div>
            </td>
          </tr>
        `;
      }).join('');

      this.bindRowActions();
    },

    bindRowActions() {
      const tbody = document.querySelector('table tbody');
      if (!tbody) return;

      tbody.querySelectorAll('[data-action]').forEach(btn => {
        btn.onclick = () => {
          const action = btn.getAttribute('data-action');
          const id = btn.getAttribute('data-id');
          const prof = allProfessors.find(p => p.id === id);

          if (action === 'agenda') this.openAgendaModal(prof);
          if (action === 'absences') this.openAbsencesModal(prof);
          if (action === 'edit') this.openEditProfessorModal(prof);
          if (action === 'delete') this.confirmDeleteProfessor(prof);
        };
      });
    },

    /**
     * Modal de Agenda Semanal e Blocos Pessoais Multi-Localidade
     */
    openAgendaModal(prof) {
      const user = AuthGuard.getCurrentUser();
      const canEdit = (user && (user.role === 'ADMIN' || user.role === 'SECRETARIA')) ||
                      (user && user.role === 'PROFESSOR' && user.linked_entity_id === prof.id);

      const profBlocks = allBlocks.filter(b => b.professor_id === prof.id);
      const days = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

      const overlay = document.createElement('div');
      overlay.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4';
      overlay.innerHTML = `
        <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-2xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
          <div class="flex items-center justify-between border-b pb-3 dark:border-slate-800">
            <div>
              <h3 class="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span class="material-symbols-outlined text-primary">calendar_month</span>
                Agenda Semanal: ${prof.name}
              </h3>
              <p class="text-xs text-slate-500">Blocos de atividades e ocupação docente em todas as localidades.</p>
            </div>
            <button id="close-modal" class="text-slate-400 hover:text-slate-600 dark:hover:text-white">&times;</button>
          </div>

          <!-- Grade Semanal de Blocos -->
          <div class="space-y-3">
            ${[1, 2, 3, 4, 5, 6, 7].map(dayNum => {
              const dayBlocks = profBlocks.filter(b => b.day_of_week === dayNum);
              return `
                <div class="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200/80 dark:border-slate-700">
                  <div class="flex items-center justify-between mb-2">
                    <span class="font-bold text-xs uppercase tracking-wider text-slate-700 dark:text-slate-300">${days[dayNum - 1]}</span>
                    ${canEdit ? `
                      <button data-add-block="${dayNum}" class="text-[11px] font-semibold text-primary hover:underline flex items-center gap-1">
                        <span class="material-symbols-outlined text-[14px]">add</span> Bloco
                      </button>
                    ` : ''}
                  </div>
                  ${dayBlocks.length === 0 ? `
                    <p class="text-xs text-slate-400 italic">Nenhum bloco cadastrado</p>
                  ` : `
                    <div class="space-y-1.5">
                      ${dayBlocks.map(b => {
                        const startH = String(Math.floor(b.start_minute / 60)).padStart(2, '0') + ':' + String(b.start_minute % 60).padStart(2, '0');
                        const endH = String(Math.floor(b.end_minute / 60)).padStart(2, '0') + ':' + String(b.end_minute % 60).padStart(2, '0');
                        return `
                          <div class="flex items-center justify-between bg-white dark:bg-slate-800 p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs">
                            <div class="flex items-center gap-2">
                              <span class="font-bold text-primary font-mono">${startH} - ${endH}</span>
                              <span class="px-2 py-0.5 rounded font-bold uppercase text-[10px] bg-primary/10 text-primary">${b.block_type}</span>
                              <span class="text-slate-500">Sede: <strong>${b.location_id}</strong></span>
                              ${b.notes ? `<span class="text-slate-400 italic">(${b.notes})</span>` : ''}
                            </div>
                            ${canEdit ? `
                              <button data-del-block="${b.id}" class="text-red-500 hover:text-red-700 p-1">
                                <span class="material-symbols-outlined text-[16px]">close</span>
                              </button>
                            ` : ''}
                          </div>
                        `;
                      }).join('')}
                    </div>
                  `}
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      overlay.querySelector('#close-modal').onclick = () => overlay.remove();

      // Deletar bloco
      overlay.querySelectorAll('[data-del-block]').forEach(btn => {
        btn.onclick = async () => {
          const blockId = btn.getAttribute('data-del-block');
          try {
            await ApiClient.delete(`/api/professors?id=${blockId}&entity=block`);
            UIToast.success('Bloco pessoal removido!');
            overlay.remove();
            await this.loadData();
            this.openAgendaModal(prof);
          } catch (err) {
            UIToast.error(err.message);
          }
        };
      });

      // Adicionar novo bloco
      overlay.querySelectorAll('[data-add-block]').forEach(btn => {
        btn.onclick = () => {
          const dayNum = parseInt(btn.getAttribute('data-add-block'), 10);
          this.openNewBlockModal(prof, dayNum, () => {
            overlay.remove();
            this.openAgendaModal(prof);
          });
        };
      });
    },

    openNewBlockModal(prof, dayNum, onDone) {
      const days = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
      const overlay = document.createElement('div');
      overlay.className = 'fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4';
      overlay.innerHTML = `
        <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-6 space-y-4">
          <h3 class="text-base font-bold text-slate-900 dark:text-white">Novo Bloco: ${prof.name} (${days[dayNum - 1]})</h3>
          <form id="form-block" class="space-y-3">
            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-1">Tipo de Atividade</label>
              <select id="blk-type" class="w-full text-xs px-3 py-2 border rounded-lg">
                <option value="AULA">AULA (Docência)</option>
                <option value="RECEPCAO">RECEPÇÃO (Acolhimento de Alunos)</option>
                <option value="CAFE">CAFÉ (Intervalo Filosófico)</option>
                <option value="ESTUDOS_SERIADOS">ESTUDOS SERIADOS</option>
                <option value="PEDAGOGOS">PEDAGOGOS (Reunião Pedagógica)</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-1">Localidade (Sede)</label>
              <select id="blk-location" class="w-full text-xs px-3 py-2 border rounded-lg">
                <option value="aguas-claras">Águas Claras</option>
                <option value="samambaia">Samambaia</option>
              </select>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-semibold text-slate-600 mb-1">Início (HH:MM)</label>
                <input id="blk-start" type="time" value="18:30" required class="w-full text-xs px-3 py-2 border rounded-lg">
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-600 mb-1">Fim (HH:MM)</label>
                <input id="blk-end" type="time" value="19:30" required class="w-full text-xs px-3 py-2 border rounded-lg">
              </div>
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-1">Observações (opcional)</label>
              <input id="blk-notes" type="text" placeholder="Ex: Recepção novos membros" class="w-full text-xs px-3 py-2 border rounded-lg">
            </div>
            <div class="flex justify-end gap-2 pt-2">
              <button type="button" id="cancel-blk" class="px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
              <button type="submit" class="px-4 py-2 text-xs font-bold text-white bg-primary hover:bg-primary-hover rounded-lg shadow-sm">Adicionar Bloco</button>
            </div>
          </form>
        </div>
      `;
      document.body.appendChild(overlay);

      overlay.querySelector('#cancel-blk').onclick = () => overlay.remove();

      overlay.querySelector('#form-block').onsubmit = async (e) => {
        e.preventDefault();
        const startVal = overlay.querySelector('#blk-start').value.split(':');
        const endVal = overlay.querySelector('#blk-end').value.split(':');
        const startMinute = parseInt(startVal[0], 10) * 60 + parseInt(startVal[1], 10);
        const endMinute = parseInt(endVal[0], 10) * 60 + parseInt(endVal[1], 10);

        if (endMinute <= startMinute) {
          UIToast.error('O horário de término deve ser posterior ao início');
          return;
        }

        const payload = {
          entity: 'block',
          professor_id: prof.id,
          location_id: overlay.querySelector('#blk-location').value,
          day_of_week: dayNum,
          start_minute: startMinute,
          end_minute: endMinute,
          block_type: overlay.querySelector('#blk-type').value,
          notes: overlay.querySelector('#blk-notes').value.trim()
        };

        try {
          await ApiClient.post('/api/professors', payload);
          UIToast.success('Bloco adicionado com sucesso!');
          overlay.remove();
          await this.loadData();
          if (onDone) onDone();
        } catch (err) {
          UIToast.error(err.message);
        }
      };
    },

    /**
     * Modal de Gestão de Ausências e Substitutos
     */
    async openAbsencesModal(prof) {
      try {
        const data = await ApiClient.get(`/api/professors/absences?professor_id=${prof.id}`);
        const absences = data.absences || [];
        const user = AuthGuard.getCurrentUser();
        const canEdit = (user && (user.role === 'ADMIN' || user.role === 'SECRETARIA')) ||
                        (user && user.role === 'PROFESSOR' && user.linked_entity_id === prof.id);

        const overlay = document.createElement('div');
        overlay.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4';
        overlay.innerHTML = `
          <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-xl w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div class="flex items-center justify-between border-b pb-3 dark:border-slate-800">
              <div>
                <h3 class="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span class="material-symbols-outlined text-amber-600">event_busy</span>
                  Ausências e Substituições: ${prof.name}
                </h3>
                <p class="text-xs text-slate-500">Períodos de ausência acionam o motor anti-choque e alertas no Kanban.</p>
              </div>
              <button id="close-abs-modal" class="text-slate-400 hover:text-slate-600 dark:hover:text-white">&times;</button>
            </div>

            ${canEdit ? `
              <!-- Form Nova Ausência -->
              <form id="form-new-abs" class="p-3 bg-amber-50/60 dark:bg-amber-950/20 rounded-xl border border-amber-200 dark:border-amber-800/40 space-y-3">
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Data Início</label>
                    <input id="abs-start" type="date" required class="w-full text-xs px-3 py-2 border rounded-lg">
                  </div>
                  <div>
                    <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Data Fim</label>
                    <input id="abs-end" type="date" required class="w-full text-xs px-3 py-2 border rounded-lg">
                  </div>
                </div>
                <div>
                  <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Professor Substituto Sugerido (opcional)</label>
                  <select id="abs-sub" class="w-full text-xs px-3 py-2 border rounded-lg">
                    <option value="">-- Sem substituto definido --</option>
                    ${allProfessors.filter(p => p.id !== prof.id && p.is_active === 1).map(s => `
                      <option value="${s.id}">${s.name} (${s.specialty})</option>
                    `).join('')}
                  </select>
                </div>
                <div>
                  <label class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Motivo / Observações</label>
                  <input id="abs-reason" type="text" placeholder="Ex: Viagem institucional / Congresso" class="w-full text-xs px-3 py-2 border rounded-lg">
                </div>
                <div class="flex justify-end">
                  <button type="submit" class="px-4 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg shadow-sm">
                    Registrar Ausência
                  </button>
                </div>
              </form>
            ` : ''}

            <!-- Histórico de Ausências -->
            <div class="space-y-2">
              <h4 class="text-xs font-bold text-slate-500 uppercase tracking-wider">Períodos Registrados</h4>
              ${absences.length === 0 ? `
                <p class="text-xs text-slate-400 italic">Nenhuma ausência registrada para este docente.</p>
              ` : `
                <div class="divide-y divide-slate-100 dark:divide-slate-800 border rounded-xl overflow-hidden">
                  ${absences.map(a => `
                    <div class="p-3 bg-white dark:bg-slate-900 flex items-center justify-between gap-4 text-xs">
                      <div>
                        <span class="font-bold text-slate-900 dark:text-white">${a.start_date} até ${a.end_date}</span>
                        ${a.substitute_name ? `<span class="ml-2 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-bold">Substituto: ${a.substitute_name}</span>` : '<span class="ml-2 text-red-600 bg-red-50 px-2 py-0.5 rounded font-bold">Sem substituto</span>'}
                        ${a.reason ? `<p class="text-slate-500 mt-1">${a.reason}</p>` : ''}
                      </div>
                      ${canEdit ? `
                        <button data-del-abs="${a.id}" class="text-red-500 hover:text-red-700 p-1">
                          <span class="material-symbols-outlined text-[18px]">delete</span>
                        </button>
                      ` : ''}
                    </div>
                  `).join('')}
                </div>
              `}
            </div>
          </div>
        `;
        document.body.appendChild(overlay);

        overlay.querySelector('#close-abs-modal').onclick = () => overlay.remove();

        const formNew = overlay.querySelector('#form-new-abs');
        if (formNew) {
          formNew.onsubmit = async (e) => {
            e.preventDefault();
            const startDate = overlay.querySelector('#abs-start').value;
            const endDate = overlay.querySelector('#abs-end').value || startDate;
            const substituteId = overlay.querySelector('#abs-sub').value || null;
            const reason = overlay.querySelector('#abs-reason').value.trim();

            try {
              await ApiClient.post('/api/professors/absences', {
                professor_id: prof.id,
                start_date: startDate,
                end_date: endDate,
                default_substitute_id: substituteId,
                reason
              });
              UIToast.success('Ausência registrada com sucesso!');
              overlay.remove();
              await this.loadData();
              this.openAbsencesModal(prof);
            } catch (err) {
              UIToast.error(err.message);
            }
          };
        }

        overlay.querySelectorAll('[data-del-abs]').forEach(btn => {
          btn.onclick = async () => {
            const absId = btn.getAttribute('data-del-abs');
            try {
              await ApiClient.delete(`/api/professors/absences?id=${absId}`);
              UIToast.success('Ausência removida!');
              overlay.remove();
              await this.loadData();
              this.openAbsencesModal(prof);
            } catch (err) {
              UIToast.error(err.message);
            }
          };
        });
      } catch (err) {
        UIToast.error('Erro ao carregar ausências: ' + err.message);
      }
    },

    /**
     * Modal para Cadastrar Novo Professor (CRUD Total ADMIN / SECRETARIA)
     */
    openNewProfessorModal() {
      const overlay = document.createElement('div');
      overlay.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4';
      overlay.innerHTML = `
        <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-6 space-y-4">
          <div class="flex items-center justify-between border-b pb-3 dark:border-slate-800">
            <h3 class="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span class="material-symbols-outlined text-primary">school</span>
              Novo Professor
            </h3>
            <button id="close-modal" class="text-slate-400 hover:text-slate-600 dark:hover:text-white">&times;</button>
          </div>
          <form id="form-new-prof" class="space-y-3">
            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-1">Nome Completo</label>
              <input id="prof-name" type="text" placeholder="Ex: Lucas Morais" required class="w-full text-xs px-3 py-2 border rounded-lg">
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-1">Email</label>
              <input id="prof-email" type="email" placeholder="lucas@acropole.org.br" class="w-full text-xs px-3 py-2 border rounded-lg">
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-1">Telefone / WhatsApp</label>
              <input id="prof-phone" type="text" placeholder="(61) 98888-7777" class="w-full text-xs px-3 py-2 border rounded-lg">
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-semibold text-slate-600 mb-1">Especialidade</label>
                <input id="prof-specialty" type="text" value="Filosofia" required class="w-full text-xs px-3 py-2 border rounded-lg">
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-600 mb-1">Carga Horária Alvo (h)</label>
                <input id="prof-hours" type="number" value="10" min="0" class="w-full text-xs px-3 py-2 border rounded-lg">
              </div>
            </div>
            <div class="flex justify-end gap-2 pt-2">
              <button type="button" id="cancel-prof" class="px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
              <button type="submit" class="px-4 py-2 text-xs font-bold text-white bg-primary hover:bg-primary-hover rounded-lg shadow-sm">Cadastrar Professor</button>
            </div>
          </form>
        </div>
      `;
      document.body.appendChild(overlay);

      overlay.querySelector('#close-modal').onclick = () => overlay.remove();
      overlay.querySelector('#cancel-prof').onclick = () => overlay.remove();

      overlay.querySelector('#form-new-prof').onsubmit = async (e) => {
        e.preventDefault();
        const payload = {
          entity: 'professor',
          name: overlay.querySelector('#prof-name').value.trim(),
          email: overlay.querySelector('#prof-email').value.trim(),
          phone: overlay.querySelector('#prof-phone').value.trim(),
          specialty: overlay.querySelector('#prof-specialty').value.trim(),
          weekly_hours_target: parseInt(overlay.querySelector('#prof-hours').value, 10) || 0
        };

        try {
          await ApiClient.post('/api/professors', payload);
          UIToast.success(`Professor(a) ${payload.name} cadastrado com sucesso!`);
          overlay.remove();
          await this.loadData();
        } catch (err) {
          UIToast.error(err.message);
        }
      };
    },

    /**
     * Modal para Editar Professor (CRUD Total ADMIN / SECRETARIA)
     */
    openEditProfessorModal(prof) {
      const overlay = document.createElement('div');
      overlay.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4';
      overlay.innerHTML = `
        <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-6 space-y-4">
          <div class="flex items-center justify-between border-b pb-3 dark:border-slate-800">
            <h3 class="text-base font-bold text-slate-900 dark:text-white">Editar Professor: ${prof.name}</h3>
            <button id="close-modal" class="text-slate-400 hover:text-slate-600 dark:hover:text-white">&times;</button>
          </div>
          <form id="form-edit-prof" class="space-y-3">
            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-1">Nome Completo</label>
              <input id="edit-name" type="text" value="${prof.name}" required class="w-full text-xs px-3 py-2 border rounded-lg">
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-1">Email</label>
              <input id="edit-email" type="email" value="${prof.email || ''}" class="w-full text-xs px-3 py-2 border rounded-lg">
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-1">Telefone</label>
              <input id="edit-phone" type="text" value="${prof.phone || ''}" class="w-full text-xs px-3 py-2 border rounded-lg">
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-semibold text-slate-600 mb-1">Especialidade</label>
                <input id="edit-specialty" type="text" value="${prof.specialty || 'Filosofia'}" required class="w-full text-xs px-3 py-2 border rounded-lg">
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-600 mb-1">Carga Horária Alvo (h)</label>
                <input id="edit-hours" type="number" value="${prof.weekly_hours_target || 0}" min="0" class="w-full text-xs px-3 py-2 border rounded-lg">
              </div>
            </div>
            <div class="flex items-center gap-2 pt-1">
              <input type="checkbox" id="edit-active" ${prof.is_active ? 'checked' : ''} class="rounded text-primary">
              <label for="edit-active" class="text-xs font-semibold text-slate-700">Professor ativo no corpo docente</label>
            </div>
            <div class="flex justify-end gap-2 pt-2">
              <button type="button" id="cancel-edit" class="px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
              <button type="submit" class="px-4 py-2 text-xs font-bold text-white bg-primary hover:bg-primary-hover rounded-lg shadow-sm">Salvar Alterações</button>
            </div>
          </form>
        </div>
      `;
      document.body.appendChild(overlay);

      overlay.querySelector('#close-modal').onclick = () => overlay.remove();
      overlay.querySelector('#cancel-edit').onclick = () => overlay.remove();

      overlay.querySelector('#form-edit-prof').onsubmit = async (e) => {
        e.preventDefault();
        const payload = {
          entity: 'professor',
          id: prof.id,
          name: overlay.querySelector('#edit-name').value.trim(),
          email: overlay.querySelector('#edit-email').value.trim(),
          phone: overlay.querySelector('#edit-phone').value.trim(),
          specialty: overlay.querySelector('#edit-specialty').value.trim(),
          weekly_hours_target: parseInt(overlay.querySelector('#edit-hours').value, 10) || 0,
          is_active: overlay.querySelector('#edit-active').checked
        };

        try {
          await ApiClient.put('/api/professors', payload);
          UIToast.success(`Professor(a) ${payload.name} atualizado com sucesso!`);
          overlay.remove();
          await this.loadData();
        } catch (err) {
          UIToast.error(err.message);
        }
      };
    },

    confirmDeleteProfessor(prof) {
      UIToast.confirm({
        title: 'Excluir Professor',
        message: `Deseja realmente excluir o(a) professor(a) "${prof.name}"? Se houver aulas ou blocos vinculados, o cadastro será inativado preservando o histórico.`,
        onConfirm: async () => {
          try {
            await ApiClient.delete(`/api/professors?id=${prof.id}&entity=professor&hard=true`);
            UIToast.success('Professor removido com sucesso!');
            await this.loadData();
          } catch (err) {
            UIToast.error(err.message);
          }
        }
      });
    },

    openFilterModal() {
      const overlay = document.createElement('div');
      overlay.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4';
      overlay.innerHTML = `
        <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-xs w-full p-6 space-y-4">
          <h3 class="text-sm font-bold text-slate-900 dark:text-white">Filtrar Professores</h3>
          <div class="space-y-2">
            <button data-filter="all" class="w-full text-left p-2.5 text-xs font-semibold rounded-lg border ${activeFilter === 'all' ? 'border-primary bg-primary/10 text-primary' : 'border-slate-200 text-slate-700'}">
              Todos os Professores
            </button>
            <button data-filter="active" class="w-full text-left p-2.5 text-xs font-semibold rounded-lg border ${activeFilter === 'active' ? 'border-primary bg-primary/10 text-primary' : 'border-slate-200 text-slate-700'}">
              Apenas Ativos
            </button>
            <button data-filter="inactive" class="w-full text-left p-2.5 text-xs font-semibold rounded-lg border ${activeFilter === 'inactive' ? 'border-primary bg-primary/10 text-primary' : 'border-slate-200 text-slate-700'}">
              Apenas Inativos
            </button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      overlay.querySelectorAll('[data-filter]').forEach(btn => {
        btn.onclick = () => {
          activeFilter = btn.getAttribute('data-filter');
          overlay.remove();
          this.renderTable();
        };
      });
    }
  };

  window.ModProfessors = ModProfessors;

  document.addEventListener('DOMContentLoaded', () => {
    ModProfessors.init();
  });
})(window);

