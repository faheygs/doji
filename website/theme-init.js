(() => {
  try {
    document.documentElement.dataset.theme = localStorage.getItem('doji-portal-theme') || 'light';
  } catch {
    document.documentElement.dataset.theme = 'light';
  }
})();
