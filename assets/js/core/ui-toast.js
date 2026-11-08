// assets/js/core/ui-toast.js
// Utilitário de notificações visuais (Toasts) e modais para CRUD

(function(window) {
  function getToastContainer() {
    let container = document.getElementById('na-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'na-toast-container';
      container.className = 'fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm pointer-events-none';
      document.body.appendChild(container);
    }
    return container;
  }

  const UIToast = {
    show(message, type = 'info', duration = 4000) {
      const container = getToastContainer();
      const toast = document.createElement('div');
      toast.className = 'pointer-events-auto flex items-center gap-3 p-4 rounded-xl shadow-lg border transition-all transform translate-y-[-10px] opacity-0 text-sm font-medium';

      const typeStyles = {
        success: 'bg-emerald-50 text-emerald-900 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-100 dark:border-emerald-800',
        error: 'bg-red-50 text-red-900 border-red-200 dark:bg-red-950 dark:text-red-100 dark:border-red-800',
        warning: 'bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950 dark:text-amber-100 dark:border-amber-800',
        info: 'bg-primary/10 text-primary border-primary/20 dark:bg-slate-800 dark:text-white dark:border-slate-700'
      };

      const icons = {
        success: 'check_circle',
        error: 'error',
        warning: 'warning',
        info: 'info'
      };

      toast.className += ` ${typeStyles[type] || typeStyles.info}`;
      toast.innerHTML = `
        <span class="material-symbols-outlined text-[20px] select-none">${icons[type] || 'info'}</span>
        <div class="flex-1">${message}</div>
      `;

      container.appendChild(toast);

      requestAnimationFrame(() => {
        toast.classList.remove('translate-y-[-10px]', 'opacity-0');
        toast.classList.add('translate-y-0', 'opacity-100');
      });

      setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-[-10px]');
        setTimeout(() => toast.remove(), 300);
      }, duration);
    },

    success(msg) { this.show(msg, 'success'); },
    error(msg) { this.show(msg, 'error'); },
    warning(msg) { this.show(msg, 'warning'); },
    info(msg) { this.show(msg, 'info'); },

    confirm({ title, message, confirmText = 'Confirmar', cancelText = 'Cancelar', onConfirm }) {
      const overlay = document.createElement('div');
      overlay.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4';
      overlay.innerHTML = `
        <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-6 space-y-4">
          <h3 class="text-lg font-bold text-slate-900 dark:text-white">${title}</h3>
          <p class="text-sm text-slate-600 dark:text-slate-300">${message}</p>
          <div class="flex justify-end gap-3 pt-2">
            <button id="modal-cancel" class="px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
              ${cancelText}
            </button>
            <button id="modal-confirm" class="px-4 py-2 text-sm font-semibold text-white bg-primary hover:bg-primary-hover rounded-lg shadow-sm transition-colors">
              ${confirmText}
            </button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);

      overlay.querySelector('#modal-cancel').onclick = () => overlay.remove();
      overlay.querySelector('#modal-confirm').onclick = () => {
        overlay.remove();
        if (onConfirm) onConfirm();
      };
    }
  };

  window.UIToast = UIToast;
})(window);

