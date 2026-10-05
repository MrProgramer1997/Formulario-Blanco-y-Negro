// Theme preference only. Never stores form values or credentials.
(() => {
  const key = 'bn2026-ui-theme';
  const root = document.documentElement;
  let theme = 'light';
  try { if (localStorage.getItem(key) === 'dark') theme = 'dark'; } catch {}
  root.dataset.theme = theme;
  function syncButtons() {
    const dark = root.dataset.theme === 'dark';
    const shape = dark
      ? '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5"/>'
      : '<path d="M20.5 13A8.5 8.5 0 0 1 11 3.5 8.5 8.5 0 1 0 20.5 13Z"/>';
    for (const b of document.querySelectorAll('.theme-toggle')) {
      b.innerHTML = '<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + shape + '</svg>';
      b.setAttribute('aria-label', dark ? 'Activar modo claro' : 'Activar modo oscuro');
      b.title = dark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro';
    }
  }
  document.addEventListener('DOMContentLoaded', syncButtons);
  document.addEventListener('click', (event) => {
    if (!event.target.closest('.theme-toggle')) return;
    root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(key, root.dataset.theme); } catch {}
    syncButtons();
  });
})();
