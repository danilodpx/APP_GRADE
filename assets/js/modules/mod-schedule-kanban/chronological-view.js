// assets/js/modules/mod-schedule-kanban/chronological-view.js
// Visualização Cronológica Linear da Grade (08:00 às 22:30) com Sub-Faixas por Sala e CRUD Total (Módulo 3)

(function(window) {
  let activeLocationId = 'aguas-claras';
  let activeWeekId = null;
  let snapshotData = null;
  let selectedRoomFilter = 'all';

  const ChronologicalView = {
    async init() {
      AuthGuard.hydrateSidebar();
      activeLocationId = AuthGuard.getActiveLocation();

      this.setupControls();
      await this.loadData();
    },

    setupControls() {
      // Configura seletor de localidade
      const header = document.querySelector('header');
      if (header && !document.getElementById('chrono-loc-select')) {
        const container = document.createElement('div');
        container.id = 'chrono-loc-select';
        container.className = 'flex items-center gap-2 mr-4';
        container.innerHTML = `
          <select id="select-chrono-loc" class="text-xs font-semibold px-2 py-1 bg-slate-100 dark:bg-slate-800 border rounded-lg text-primary">
            <option value="aguas-claras" ${activeLocationId === 'aguas-claras' ? 'selected' : ''}>Sede Águas Claras</option>
            <option value="samambaia" ${activeLocationId === 'samambaia' ? 'selected' : ''}>Sede Samambaia</option>
          </select>
        `;
        header.querySelector('.flex.items-center.gap-3')?.prepend(container);

        document.getElementById('select-chrono-loc').onchange = (e) => {
          activeLocationId = e.target.value;
          AuthGuard.setActiveLocation(activeLocationId);
          this.loadData();
        };
      }

      // Botão "+ Nova Aula"
      const addBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Nova Aula') || b.textContent.includes('Adicionar'));
      if (addBtn) {
        addBtn.onclick = () => this.openSessionEditModal(null);
      }

      // Campo de busca
      const searchInput = document.querySelector('input[type="text"][placeholder*="Buscar"]');
      if (searchInput) {
        searchInput.oninput = (e) => this.renderGrid(e.target.value.toLowerCase().trim());
      }
    },

    async loadData() {
      try {
        snapshotData = await ApiClient.get(`/api/schedule/snapshot?location_id=${activeLocationId}${activeWeekId ? `&week_id=${activeWeekId}` : ''}`);
        this.renderGrid();
      } catch (err) {
        UIToast.error('Erro ao carregar grade: ' + err.message);
      }
    },

    renderGrid(searchTerm = '') {
      if (!snapshotData) return;
      const sessions = snapshotData.sessions || [];
      const rooms = snapshotData.rooms || [];
      const roomsMap = {};
      rooms.forEach(r => roomsMap[r.id] = r);

      const days = [
        { num: 1, name: 'Segunda-feira', label: 'Seg' },
        { num: 2, name: 'Terça-feira', label: 'Ter' },
        { num: 3, name: 'Quarta-feira', label: 'Qua' },
        { num: 4, name: 'Quinta-feira', label: 'Qui' },
        { num: 5, name: 'Sexta-feira', label: 'Sex' },
        { num: 6, name: 'Sábado', label: 'Sáb' }
      ];

      // Faixa horária total: 08:00 (480 min) a 22:30 (1350 min) = 870 minutos totais
      const totalStartMin = 480;
      const totalDurationMin = 870;

      const rowsContainer = document.querySelector('.divide-y') || document.querySelector('.flex.flex-col.flex-1.bg-surface-light');
      if (!rowsContainer) return;

      rowsContainer.innerHTML = days.map(day => {
        let daySessions = sessions.filter(s =>
          s.day_of_week === day.num &&
          s.event_status !== 'CANCELADO' &&
          s.event_status !== 'NAO_ALOCADO' &&
          s.room_id
        );

        if (searchTerm) {
          daySessions = daySessions.filter(s =>
            s.subject_name.toLowerCase().includes(searchTerm) ||
            s.professor_name.toLowerCase().includes(searchTerm) ||
            (s.cohort_codes || []).some(c => c.toLowerCase().includes(searchTerm))
          );
        }

        // Cálculo de sub-faixas verticais para aulas simultâneas em salas diferentes
        const lanes = [];
        daySessions.forEach(s => {
          let placed = false;
          for (let i = 0; i < lanes.length; i++) {
            const hasOverlap = lanes[i].some(existing =>
              Math.max(s.start_minute, existing.start_minute) < Math.min(s.end_minute, existing.end_minute)
            );
            if (!hasOverlap) {
              lanes[i].push(s);
              s._laneIndex = i;
              placed = true;
              break;
            }
          }
          if (!placed) {
            s._laneIndex = lanes.length;
            lanes.push([s]);
          }
        });

        const numLanes = Math.max(1, lanes.length);
        const rowHeightPx = Math.max(90, numLanes * 60 + 20);

        return `
          <div class="flex border-b border-slate-200 dark:border-slate-800 hover:bg-slate-50/50 transition-colors relative" style="min-height: ${rowHeightPx}px;">
            <!-- Cabeçalho do Dia -->
            <div class="w-32 flex-shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col items-center justify-center p-3 z-20">
              <span class="text-sm font-bold text-slate-900 dark:text-white">${day.name}</span>
              <span class="text-xs text-slate-400 font-medium">${day.label}</span>
            </div>

            <!-- Linha do Tempo (08:00 às 22:30) -->
            <div class="flex-1 relative bg-[linear-gradient(90deg,transparent_99%,rgba(0,0,0,0.03)_100%)]" style="background-size: 6.66% 100%;">
              ${daySessions.map(s => {
                const leftPct = Math.max(0, ((s.start_minute - totalStartMin) / totalDurationMin) * 100);
                const widthPct = Math.min(100 - leftPct, ((s.end_minute - s.start_minute) / totalDurationMin) * 100);
                const topPx = (s._laneIndex || 0) * 56 + 8;
                const room = roomsMap[s.room_id] || { name: 'Sala' };
                const cohortsLabel = (s.cohort_codes || []).join(' + ') || 'Turma';

                return `
                  <div data-session-card="${s.id}" style="left: ${leftPct}%; width: ${widthPct}%; top: ${topPx}px; height: 50px;"
                       class="absolute px-1 py-0.5 cursor-pointer select-none group/card">
                    <div class="h-full w-full rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border-l-4 border-primary p-1.5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between">
                      <div class="flex items-center justify-between gap-1 overflow-hidden">
                        <span class="text-[11px] font-bold text-slate-900 dark:text-white truncate">${s.subject_name}</span>
                        <span class="text-[9px] font-bold px-1 rounded bg-primary/10 text-primary shrink-0">${cohortsLabel}</span>
                      </div>
                      <div class="flex items-center justify-between text-[10px] text-slate-500">
                        <span>${ScheduleValidator.minuteToTime(s.start_minute)} - ${ScheduleValidator.minuteToTime(s.end_minute)}</span>
                        <span class="font-medium text-slate-700 dark:text-slate-300 truncate">${room.name} • ${s.professor_name}</span>
                      </div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        `;
      }).join('');

      // Binda clique para abrir edição
      document.querySelectorAll('[data-session-card]').forEach(card => {
        card.onclick = () => {
          const sId = card.getAttribute('data-session-card');
          const sess = (snapshotData.sessions || []).find(x => x.id === sId);
          this.openSessionEditModal(sess);
        };
      });
    },

    openSessionEditModal(session = null) {
      const rooms = snapshotData?.rooms || [];
      const cohorts = snapshotData?.cohorts || [];

      const overlay = document.createElement('div');
      overlay.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4';
      overlay.innerHTML = `
        <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
          <div class="flex items-center justify-between border-b pb-3 dark:border-slate-800">
            <h3 class="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span class="material-symbols-outlined text-primary">calendar_month</span>
              ${session ? 'Editar Aula da Grade' : 'Nova Aula na Grade'}
            </h3>
            <button id="close-chrono-modal" class="text-slate-400 hover:text-slate-600">&times;</button>
          </div>
          <form id="form-chrono-session" class="space-y-3">
            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-1">Disciplina / Atividade</label>
              <input id="ch-subject" type="text" value="${session ? session.subject_name : ''}" required class="w-full text-xs px-3 py-2 border rounded-lg">
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-semibold text-slate-600 mb-1">Sala</label>
                <select id="ch-room" required class="w-full text-xs px-3 py-2 border rounded-lg">
                  ${rooms.map(r => `
                    <option value="${r.id}" ${session && session.room_id === r.id ? 'selected' : ''}>${r.name} (${r.capacity} lug.)</option>
                  `).join('')}
                </select>
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-600 mb-1">Dia da Semana</label>
                <select id="ch-day" class="w-full text-xs px-3 py-2 border rounded-lg">
                  <option value="1" ${session && session.day_of_week === 1 ? 'selected' : ''}>Segunda-feira</option>
                  <option value="2" ${session && session.day_of_week === 2 ? 'selected' : ''}>Terça-feira</option>
                  <option value="3" ${session && session.day_of_week === 3 ? 'selected' : ''}>Quarta-feira</option>
                  <option value="4" ${session && session.day_of_week === 4 ? 'selected' : ''}>Quinta-feira</option>
                  <option value="5" ${session && session.day_of_week === 5 ? 'selected' : ''}>Sexta-feira</option>
                  <option value="6" ${session && session.day_of_week === 6 ? 'selected' : ''}>Sábado</option>
                </select>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-semibold text-slate-600 mb-1">Início (HH:MM)</label>
                <input id="ch-start" type="time" value="${session ? ScheduleValidator.minuteToTime(session.start_minute) : '20:00'}" required class="w-full text-xs px-3 py-2 border rounded-lg">
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-600 mb-1">Término (HH:MM)</label>
                <input id="ch-end" type="time" value="${session ? ScheduleValidator.minuteToTime(session.end_minute) : '21:00'}" required class="w-full text-xs px-3 py-2 border rounded-lg">
              </div>
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-1">Professor</label>
              <input id="ch-prof" type="text" value="${session ? session.professor_name : 'Gustavo'}" required class="w-full text-xs px-3 py-2 border rounded-lg">
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-1">Turmas</label>
              <div class="grid grid-cols-3 gap-2 border p-2 rounded-lg max-h-24 overflow-y-auto">
                ${cohorts.map(c => `
                  <label class="flex items-center gap-1.5 text-xs">
                    <input type="checkbox" value="${c.id}" class="ch-cohort-cb rounded text-primary"
                      ${session && (session.cohort_ids || []).includes(c.id) ? 'checked' : ''}>
                    <span>${c.code}</span>
                  </label>
                `).join('')}
              </div>
            </div>
            <div class="flex items-center justify-between pt-2 border-t">
              ${session ? `
                <button type="button" id="btn-del-chrono" class="px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 rounded-lg">
                  Excluir Aula
                </button>
              ` : '<div></div>'}
              <div class="flex gap-2">
                <button type="button" id="cancel-chrono" class="px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
                <button type="submit" class="px-4 py-2 text-xs font-bold text-white bg-primary hover:bg-primary-hover rounded-lg shadow-sm">Salvar</button>
              </div>
            </div>
          </form>
        </div>
      `;
      document.body.appendChild(overlay);

      overlay.querySelector('#close-chrono-modal').onclick = () => overlay.remove();
      overlay.querySelector('#cancel-chrono').onclick = () => overlay.remove();

      if (session) {
        overlay.querySelector('#btn-del-chrono').onclick = () => {
          UIToast.confirm({
            title: 'Excluir Aula',
            message: `Deseja realmente remover a aula "${session.subject_name}"?`,
            onConfirm: async () => {
              try {
                await ApiClient.delete(`/api/schedule/sessions?id=${session.id}`);
                UIToast.success('Aula excluída com sucesso!');
                overlay.remove();
                await this.loadData();
              } catch (err) {
                UIToast.error(err.message);
              }
            }
          });
        };
      }

      overlay.querySelector('#form-chrono-session').onsubmit = async (e) => {
        e.preventDefault();
        const startVal = overlay.querySelector('#ch-start').value.split(':');
        const endVal = overlay.querySelector('#ch-end').value.split(':');
        const startMinute = parseInt(startVal[0], 10) * 60 + parseInt(startVal[1], 10);
        const endMinute = parseInt(endVal[0], 10) * 60 + parseInt(endVal[1], 10);
        const checkedCohorts = Array.from(overlay.querySelectorAll('.ch-cohort-cb:checked')).map(cb => cb.value);

        const payload = {
          action: 'UPSERT',
          id: session ? session.id : undefined,
          location_id: activeLocationId,
          week_id: activeWeekId,
          subject_name: overlay.querySelector('#ch-subject').value.trim(),
          room_id: overlay.querySelector('#ch-room').value,
          day_of_week: parseInt(overlay.querySelector('#ch-day').value, 10),
          start_minute: startMinute,
          end_minute: endMinute,
          professor_name: overlay.querySelector('#ch-prof').value.trim(),
          cohort_ids: checkedCohorts,
          event_status: 'CONFIRMADO'
        };

        try {
          await ApiClient.post('/api/schedule/sessions', payload);
          UIToast.success('Aula salva com sucesso na Grade!');
          overlay.remove();
          await this.loadData();
        } catch (err) {
          UIToast.error(err.message);
        }
      };
    }
  };

  window.ChronologicalView = ChronologicalView;

  document.addEventListener('DOMContentLoaded', () => {
    ChronologicalView.init();
  });
})(window);

