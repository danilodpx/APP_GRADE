// assets/js/modules/mod-schedule-kanban/kanban-view.js
// Painel Kanban Drag-and-Drop, Gaveta NAO_ALOCADO, Bastião e Alertas de Card Vermelho (Módulo 3)

(function(window) {
  let activeLocationId = 'aguas-claras';
  let activeWeekId = null; // null = Grade Matriz Permanente
  let snapshotData = null;
  let otherLocationsSessions = [];
  let professorBlocks = [];
  let professorAbsences = [];

  const KanbanView = {
    async init() {
      AuthGuard.hydrateSidebar();
      activeLocationId = AuthGuard.getActiveLocation();

      // Remove card flutuante estático de demonstração da tela original
      const staticDemoCard = document.querySelector('.absolute.top-\\[280px\\].left-\\[350px\\]');
      if (staticDemoCard) {
        staticDemoCard.remove();
      }

      this.setupHeaderControls();
      await this.loadScheduleData();
    },

    setupHeaderControls() {
      const header = document.querySelector('header');
      if (!header) return;

      // Seletor de Localidade e Semana no cabeçalho
      const headerTitleArea = header.querySelector('h2')?.parentElement;
      if (headerTitleArea && !document.getElementById('kanban-location-selector')) {
        const selectorContainer = document.createElement('div');
        selectorContainer.id = 'kanban-location-selector';
        selectorContainer.className = 'flex items-center gap-2 mt-1';
        selectorContainer.innerHTML = `
          <select id="select-location" class="text-xs font-semibold px-2 py-1 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-primary focus:ring-1 focus:ring-primary">
            <option value="aguas-claras" ${activeLocationId === 'aguas-claras' ? 'selected' : ''}>Sede Águas Claras</option>
            <option value="samambaia" ${activeLocationId === 'samambaia' ? 'selected' : ''}>Sede Samambaia</option>
          </select>
          <select id="select-week" class="text-xs font-semibold px-2 py-1 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200 focus:ring-1 focus:ring-primary">
            <option value="">Grade Matriz Permanente</option>
            <option value="ac-2025-W39">Semana 22/09 a 27/09/2025</option>
          </select>
        `;
        headerTitleArea.appendChild(selectorContainer);

        document.getElementById('select-location').onchange = (e) => {
          activeLocationId = e.target.value;
          AuthGuard.setActiveLocation(activeLocationId);
          this.loadScheduleData();
        };

        document.getElementById('select-week').onchange = (e) => {
          activeWeekId = e.target.value || null;
          this.loadScheduleData();
        };
      }

      // Botão "+ Add Class"
      const addClassBtn = Array.from(header.querySelectorAll('button')).find(b => b.textContent.includes('Add Class'));
      if (addClassBtn) {
        addClassBtn.onclick = () => this.openSessionEditModal(null);
      }
    },

    async loadScheduleData() {
      try {
        const [snapRes, editRes] = await Promise.all([
          ApiClient.get(`/api/schedule/snapshot?location_id=${activeLocationId}${activeWeekId ? `&week_id=${activeWeekId}` : ''}`),
          ApiClient.get(`/api/schedule/sessions?location_id=${activeLocationId}${activeWeekId ? `&week_id=${activeWeekId}` : ''}`)
        ]);

        snapshotData = snapRes;
        otherLocationsSessions = editRes.otherLocationsSessions || [];
        professorBlocks = editRes.professorBlocks || [];
        professorAbsences = editRes.professorAbsences || [];

        this.renderKanbanGrid();
        this.renderUnscheduledDrawer();
      } catch (err) {
        UIToast.error('Erro ao carregar dados da grade: ' + err.message);
      }
    },

    renderKanbanGrid() {
      if (!snapshotData) return;
      const rooms = snapshotData.rooms || [];
      const sessions = snapshotData.sessions || [];

      const scrollContainer = document.querySelector('main .min-w-\\[1000px\\]');
      if (!scrollContainer) return;

      const timeSlots = [
        { label: '18h30 (Pré-Aula)', start: 1110, end: 1170 },
        { label: '19h15 (Acolhimento)', start: 1155, end: 1200 },
        { label: '20h00 [1º Horário]', start: 1200, end: 1260 },
        { label: '21h10 [2º Horário]', start: 1270, end: 1330 },
        { label: '22h15 (Encerramento)', start: 1335, end: 1380 }
      ];

      scrollContainer.innerHTML = `
        <div class="grid grid-cols-[160px_repeat(${rooms.length},minmax(180px,1fr))] gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <!-- Header: Salas -->
          <div class="font-bold text-xs uppercase tracking-wider text-slate-400 p-3 flex items-center">
            Horário / Sala
          </div>
          ${rooms.map(r => `
            <div class="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700/80 text-center">
              <span class="font-bold text-sm text-slate-800 dark:text-white block">${r.name}</span>
              <span class="text-[11px] text-slate-500 block">Capacidade: <strong>${r.capacity}</strong> • ${r.floor_label || 'Térreo'}</span>
            </div>
          `).join('')}

          <!-- Linhas de Horário -->
          ${timeSlots.map(slot => `
            <div class="p-3 font-mono text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center border-t border-slate-100 dark:border-slate-800">
              ${slot.label}
            </div>
            ${rooms.map(room => {
              const matchingSessions = sessions.filter(s =>
                s.room_id === room.id &&
                s.start_minute < slot.end &&
                s.end_minute > slot.start
              );

              return `
                <div data-drop-zone="true" data-room-id="${room.id}" data-start="${slot.start}" data-end="${slot.end}" data-label="${slot.label}"
                     class="min-h-[110px] p-2 bg-slate-50/50 dark:bg-slate-800/20 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl flex flex-col gap-2 transition-all hover:border-primary/50">
                  ${matchingSessions.map(s => this.renderSessionCard(s, room)).join('')}
                </div>
              `;
            }).join('')}
          `).join('')}
        </div>
      `;

      this.bindDragAndDrop();
    },

    renderSessionCard(session, room) {
      const isBastiao = session.is_bastiao ? 1 : 0;
      const cohortsLabel = (session.cohort_codes || []).join(' + ') || 'Sem turma';

      return `
        <div id="card-${session.id}" draggable="true" data-session-id="${session.id}"
             class="group relative p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md cursor-grab active:cursor-grabbing transition-all select-none">
          <div class="flex items-center justify-between gap-1 mb-1.5">
            <span class="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded ${
              isBastiao ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300' : 'bg-primary/10 text-primary'
            }">
              ${isBastiao ? 'Bastião (' + cohortsLabel + ')' : cohortsLabel}
            </span>
            <div class="flex items-center gap-1">
              <span class="material-symbols-outlined text-slate-300 group-hover:text-primary text-[14px]">drag_indicator</span>
            </div>
          </div>
          <p class="text-xs font-bold text-slate-900 dark:text-white leading-snug line-clamp-2">${session.subject_name}</p>
          <div class="flex items-center justify-between mt-2 pt-2 border-t border-slate-100 dark:border-slate-700/60 text-[11px]">
            <span class="text-slate-600 dark:text-slate-400 font-medium truncate max-w-[100px]">
              ${session.substitute_professor_name ? `Sub: ${session.substitute_professor_name}` : session.professor_name}
            </span>
            <button data-edit-session="${session.id}" class="text-slate-400 hover:text-primary p-0.5">
              <span class="material-symbols-outlined text-[16px]">edit</span>
            </button>
          </div>
        </div>
      `;
    },

    renderUnscheduledDrawer() {
      const drawerContent = document.querySelector('.group\\/item')?.parentElement;
      if (!drawerContent || !snapshotData) return;

      const unscheduled = (snapshotData.sessions || []).filter(s => !s.room_id || s.event_status === 'NAO_ALOCADO');
      const countHeader = document.querySelector('h3.font-bold.text-sm.text-slate-700');
      if (countHeader) countHeader.textContent = `Aulas Não Alocadas (${unscheduled.length})`;

      drawerContent.innerHTML = `
        <div class="flex items-center justify-between mt-2 border-b border-slate-100 pb-2">
          <h3 class="font-bold text-xs text-slate-700 uppercase tracking-wider">Gaveta Lateral (${unscheduled.length})</h3>
          <button id="btn-add-unscheduled" class="text-xs text-primary font-bold hover:underline">+ Nova</button>
        </div>
        ${unscheduled.length === 0 ? `
          <p class="text-xs text-slate-400 italic py-4 text-center">Todas as aulas estão alocadas em salas.</p>
        ` : `
          <div class="space-y-2 mt-2">
            ${unscheduled.map(s => `
              <div id="card-${s.id}" draggable="true" data-session-id="${s.id}"
                   class="p-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-white hover:border-primary/40 hover:shadow-md cursor-grab active:cursor-grabbing transition-all select-none">
                <div class="flex justify-between items-center mb-1">
                  <span class="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                    ${(s.cohort_codes || []).join(' + ') || 'Sem turma'}
                  </span>
                  <span class="material-symbols-outlined text-slate-300 text-[14px]">drag_indicator</span>
                </div>
                <p class="text-xs font-bold text-slate-800">${s.subject_name}</p>
                <p class="text-[10px] text-slate-500 mt-0.5">${s.professor_name}</p>
              </div>
            `).join('')}
          </div>
        `}
      `;

      const addBtn = document.getElementById('btn-add-unscheduled');
      if (addBtn) addBtn.onclick = () => this.openSessionEditModal(null, true);

      this.bindDragAndDrop();
    },

    bindDragAndDrop() {
      let draggedSessionId = null;

      document.querySelectorAll('[draggable="true"]').forEach(card => {
        card.ondragstart = (e) => {
          draggedSessionId = card.getAttribute('data-session-id');
          e.dataTransfer.setData('text/plain', draggedSessionId);
          card.classList.add('opacity-50', 'scale-95');
        };

        card.ondragend = () => {
          card.classList.remove('opacity-50', 'scale-95');
        };
      });

      document.querySelectorAll('[data-drop-zone="true"]').forEach(zone => {
        zone.ondragover = (e) => {
          e.preventDefault();
          zone.classList.add('bg-primary/5', 'border-primary');
        };

        zone.ondragleave = () => {
          zone.classList.remove('bg-primary/5', 'border-primary');
        };

        zone.ondrop = async (e) => {
          e.preventDefault();
          zone.classList.remove('bg-primary/5', 'border-primary');
          const sessionId = e.dataTransfer.getData('text/plain') || draggedSessionId;
          if (!sessionId) return;

          const session = (snapshotData.sessions || []).find(s => s.id === sessionId);
          if (!session) return;

          const targetRoomId = zone.getAttribute('data-room-id');
          const targetStart = parseInt(zone.getAttribute('data-start'), 10);
          const targetEnd = parseInt(zone.getAttribute('data-end'), 10);
          const targetSlotLabel = zone.getAttribute('data-label');

          // Verifica se já existe um card nesse mesmo slot da sala
          const existingSessionInSlot = (snapshotData.sessions || []).find(s =>
            s.id !== sessionId &&
            s.room_id === targetRoomId &&
            s.start_minute < targetEnd &&
            s.end_minute > targetStart
          );

          if (existingSessionInSlot) {
            // Conflito de ocupação de sala: abre modal Swap ou Bastião
            this.openConflictResolutionModal(session, existingSessionInSlot, {
              targetRoomId, targetStart, targetEnd, targetSlotLabel
            });
            return;
          }

          // Se o slot estiver livre, valida com o motor anti-choque
          const candidate = {
            ...session,
            room_id: targetRoomId,
            start_minute: targetStart,
            end_minute: targetEnd,
            slot_label: targetSlotLabel,
            event_status: 'CONFIRMADO'
          };

          const roomsMap = {};
          (snapshotData.rooms || []).forEach(r => roomsMap[r.id] = r);
          const cohortsMap = {};
          (snapshotData.cohorts || []).forEach(c => cohortsMap[c.id] = c);

          const validation = ScheduleValidator.validateSessionCandidate(
            candidate,
            [...(snapshotData.sessions || []), ...otherLocationsSessions],
            professorBlocks,
            professorAbsences,
            roomsMap,
            cohortsMap,
            activeWeekId ? '2025-09-22' : null
          );

          if (!validation.isValid) {
            // Alerta de Card Vermelho
            const cardEl = document.getElementById(`card-${sessionId}`);
            if (cardEl) {
              cardEl.classList.add('bg-red-50', 'dark:bg-red-950/60', 'border-red-500', 'ring-2', 'ring-red-500/30');
            }
            validation.conflictingSessionIds.forEach(cId => {
              const conflictCard = document.getElementById(`card-${cId}`);
              if (conflictCard) conflictCard.classList.add('border-red-500', 'animate-pulse');
            });
            UIToast.error(validation.errors[0]?.message || 'Conflito detectado na alocação da aula.');
            return;
          }

          // Se for válido, persiste no backend
          try {
            await ApiClient.post('/api/schedule/sessions', {
              action: 'UPSERT',
              ...candidate
            });
            UIToast.success(`Aula movida para ${roomsMap[targetRoomId]?.name} (${targetSlotLabel})`);
            await this.loadScheduleData();
          } catch (err) {
            UIToast.error(err.message);
          }
        };
      });

      // Binda cliques de edição
      document.querySelectorAll('[data-edit-session]').forEach(btn => {
        btn.onclick = () => {
          const sId = btn.getAttribute('data-edit-session');
          const s = (snapshotData.sessions || []).find(x => x.id === sId);
          this.openSessionEditModal(s);
        };
      });
    },

    /**
     * Modal quando solta um card sobre outro ocupado: 1. Swap (Trocar) ou 2. Bastião (Unir)
     */
    openConflictResolutionModal(movingSession, occupiedSession, targetSlot) {
      const overlay = document.createElement('div');
      overlay.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4';
      overlay.innerHTML = `
        <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-6 space-y-4">
          <div class="flex items-center justify-between border-b pb-3 dark:border-slate-800">
            <h3 class="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span class="material-symbols-outlined text-amber-500">warning</span>
              Sala Já Ocupada neste Horário
            </h3>
            <button id="close-res-modal" class="text-slate-400 hover:text-slate-600">&times;</button>
          </div>
          <p class="text-xs text-slate-600 dark:text-slate-300">
            A aula <strong>"${occupiedSession.subject_name}"</strong> já ocupa este espaço. O que você deseja fazer?
          </p>
          <div class="space-y-3 pt-2">
            <button id="opt-swap" class="w-full text-left p-3 rounded-xl border border-slate-200 hover:border-primary hover:bg-primary/5 transition-all">
              <span class="font-bold text-xs text-slate-900 dark:text-white block">1. Trocar Salas (Swap)</span>
              <span class="text-[11px] text-slate-500">Inverte as salas e horários entre as duas aulas atomicamente.</span>
            </button>
            <button id="opt-bastiao" class="w-full text-left p-3 rounded-xl border border-slate-200 hover:border-purple-500 hover:bg-purple-50/50 transition-all">
              <span class="font-bold text-xs text-purple-900 dark:text-purple-300 block">2. Unir Turmas em Bastião</span>
              <span class="text-[11px] text-slate-500">Junta as duas turmas na mesma sala sob uma única aula compartilhada.</span>
            </button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      overlay.querySelector('#close-res-modal').onclick = () => overlay.remove();

      // Opção 1: SWAP
      overlay.querySelector('#opt-swap').onclick = async () => {
        try {
          await ApiClient.post('/api/schedule/sessions', {
            action: 'SWAP',
            source_session_id: movingSession.id,
            target_session_id: occupiedSession.id
          });
          UIToast.success('Salas trocadas com sucesso!');
          overlay.remove();
          await this.loadScheduleData();
        } catch (err) {
          UIToast.error(err.message);
        }
      };

      // Opção 2: BASTIÃO
      overlay.querySelector('#opt-bastiao').onclick = async () => {
        try {
          await ApiClient.post('/api/schedule/sessions', {
            action: 'MERGE_BASTIAO',
            source_session_id: movingSession.id,
            target_session_id: occupiedSession.id
          });
          UIToast.success('Turmas unidas em Bastião com sucesso!');
          overlay.remove();
          await this.loadScheduleData();
        } catch (err) {
          UIToast.error(err.message);
        }
      };
    },

    /**
     * Modal completo de Criação e Edição de Sessões (CRUD Total)
     */
    openSessionEditModal(session = null, isUnscheduled = false) {
      const rooms = snapshotData?.rooms || [];
      const cohorts = snapshotData?.cohorts || [];
      const isNew = !session;

      const overlay = document.createElement('div');
      overlay.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4';
      overlay.innerHTML = `
        <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
          <div class="flex items-center justify-between border-b pb-3 dark:border-slate-800">
            <h3 class="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span class="material-symbols-outlined text-primary">calendar_month</span>
              ${isNew ? 'Nova Aula / Sessão' : 'Editar Aula / Sessão'}
            </h3>
            <button id="close-edit-modal" class="text-slate-400 hover:text-slate-600">&times;</button>
          </div>
          <form id="form-session" class="space-y-3">
            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-1">Disciplina / Tema</label>
              <input id="sess-subject" type="text" value="${session ? session.subject_name : ''}" required placeholder="Ex: Ética e Moralidade" class="w-full text-xs px-3 py-2 border rounded-lg">
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-semibold text-slate-600 mb-1">Sala</label>
                <select id="sess-room" class="w-full text-xs px-3 py-2 border rounded-lg">
                  <option value="" ${(!session || !session.room_id) ? 'selected' : ''}>-- Gaveta Lateral (Não Alocada) --</option>
                  ${rooms.map(r => `
                    <option value="${r.id}" ${session && session.room_id === r.id ? 'selected' : ''}>${r.name} (${r.capacity} lug.)</option>
                  `).join('')}
                </select>
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-600 mb-1">Dia da Semana</label>
                <select id="sess-day" class="w-full text-xs px-3 py-2 border rounded-lg">
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
                <input id="sess-start" type="time" value="${session ? ScheduleValidator.minuteToTime(session.start_minute) : '20:00'}" required class="w-full text-xs px-3 py-2 border rounded-lg">
              </div>
              <div>
                <label class="block text-xs font-semibold text-slate-600 mb-1">Término (HH:MM)</label>
                <input id="sess-end" type="time" value="${session ? ScheduleValidator.minuteToTime(session.end_minute) : '21:00'}" required class="w-full text-xs px-3 py-2 border rounded-lg">
              </div>
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-1">Professor Titular</label>
              <input id="sess-prof-name" type="text" value="${session ? session.professor_name : 'Gustavo'}" required class="w-full text-xs px-3 py-2 border rounded-lg">
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-1">Professor Substituto (opcional)</label>
              <input id="sess-sub-name" type="text" value="${session ? (session.substitute_professor_name || '') : ''}" placeholder="Deixe em branco se for o titular" class="w-full text-xs px-3 py-2 border rounded-lg">
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-600 mb-1">Turmas Vinculadas</label>
              <div class="grid grid-cols-3 gap-2 border p-2 rounded-lg max-h-28 overflow-y-auto">
                ${cohorts.map(c => `
                  <label class="flex items-center gap-1.5 text-xs">
                    <input type="checkbox" value="${c.id}" class="sess-cohort-check rounded text-primary"
                      ${session && (session.cohort_ids || []).includes(c.id) ? 'checked' : ''}>
                    <span>${c.code}</span>
                  </label>
                `).join('')}
              </div>
            </div>
            ${session && session.is_bastiao ? `
              <div class="p-3 bg-purple-50 rounded-xl border border-purple-200 flex items-center justify-between">
                <div>
                  <span class="font-bold text-xs text-purple-900 block">Sessão em Bastião</span>
                  <span class="text-[11px] text-purple-700">Duas ou mais turmas unidas.</span>
                </div>
                <button type="button" id="btn-split-bastiao" class="px-3 py-1.5 text-xs font-bold text-purple-700 bg-white border border-purple-300 rounded-lg hover:bg-purple-100">
                  Desfazer Bastião
                </button>
              </div>
            ` : ''}
            <div class="flex items-center justify-between pt-2 border-t">
              ${session ? `
                <button type="button" id="btn-del-session" class="px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 rounded-lg">
                  Excluir Aula
                </button>
              ` : '<div></div>'}
              <div class="flex gap-2">
                <button type="button" id="cancel-edit" class="px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
                <button type="submit" class="px-4 py-2 text-xs font-bold text-white bg-primary hover:bg-primary-hover rounded-lg shadow-sm">Salvar</button>
              </div>
            </div>
          </form>
        </div>
      `;
      document.body.appendChild(overlay);

      overlay.querySelector('#close-edit-modal').onclick = () => overlay.remove();
      overlay.querySelector('#cancel-edit').onclick = () => overlay.remove();

      // Desfazer Bastião
      const splitBtn = overlay.querySelector('#btn-split-bastiao');
      if (splitBtn) {
        splitBtn.onclick = async () => {
          try {
            await ApiClient.post('/api/schedule/sessions', {
              action: 'SPLIT_BASTIAO',
              session_id: session.id
            });
            UIToast.success('Bastião desfeito com sucesso!');
            overlay.remove();
            await this.loadScheduleData();
          } catch (err) {
            UIToast.error(err.message);
          }
        };
      }

      // Excluir Aula
      const delBtn = overlay.querySelector('#btn-del-session');
      if (delBtn) {
        delBtn.onclick = () => {
          UIToast.confirm({
            title: 'Excluir Aula',
            message: `Deseja realmente remover a aula "${session.subject_name}" da grade?`,
            onConfirm: async () => {
              try {
                await ApiClient.delete(`/api/schedule/sessions?id=${session.id}`);
                UIToast.success('Aula removida com sucesso!');
                overlay.remove();
                await this.loadScheduleData();
              } catch (err) {
                UIToast.error(err.message);
              }
            }
          });
        };
      }

      // Salvar Sessão
      overlay.querySelector('#form-session').onsubmit = async (e) => {
        e.preventDefault();
        const startVal = overlay.querySelector('#sess-start').value.split(':');
        const endVal = overlay.querySelector('#sess-end').value.split(':');
        const startMinute = parseInt(startVal[0], 10) * 60 + parseInt(startVal[1], 10);
        const endMinute = parseInt(endVal[0], 10) * 60 + parseInt(endVal[1], 10);

        const checkedCohorts = Array.from(overlay.querySelectorAll('.sess-cohort-check:checked')).map(cb => cb.value);

        const payload = {
          action: 'UPSERT',
          id: session ? session.id : undefined,
          location_id: activeLocationId,
          week_id: activeWeekId,
          subject_name: overlay.querySelector('#sess-subject').value.trim(),
          room_id: overlay.querySelector('#sess-room').value || null,
          day_of_week: parseInt(overlay.querySelector('#sess-day').value, 10),
          start_minute: startMinute,
          end_minute: endMinute,
          professor_name: overlay.querySelector('#sess-prof-name').value.trim(),
          substitute_professor_name: overlay.querySelector('#sess-sub-name').value.trim() || null,
          cohort_ids: checkedCohorts,
          event_status: overlay.querySelector('#sess-room').value ? 'CONFIRMADO' : 'NAO_ALOCADO'
        };

        try {
          await ApiClient.post('/api/schedule/sessions', payload);
          UIToast.success('Aula salva com sucesso!');
          overlay.remove();
          await this.loadScheduleData();
        } catch (err) {
          UIToast.error(err.message);
        }
      };
    }
  };

  window.KanbanView = KanbanView;

  document.addEventListener('DOMContentLoaded', () => {
    KanbanView.init();
  });
})(window);
