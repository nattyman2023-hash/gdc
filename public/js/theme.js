/**
 * GDCU Theme Manager (Dark Mode)
 * - Detects system preference on first visit
 * - Persists choice in localStorage
 * - Adds 'dark' class to <html> when dark mode is active
 */
(function () {
  const KEY = 'gdcu-theme';
  const html = document.documentElement;

  function setTheme(theme) {
    if (theme === 'dark') {
      html.classList.add('dark');
    } else {
      html.classList.remove('dark');
    }
    localStorage.setItem(KEY, theme);
  }

  function getSavedTheme() {
    return localStorage.getItem(KEY);
  }

  function getSystemTheme() {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  // On load, determine theme
  const saved = getSavedTheme();
  if (saved) {
    setTheme(saved);
  } else {
    setTheme(getSystemTheme());
  }

  // Listen for system preference changes (only if user hasn't saved a preference)
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function (e) {
    if (!getSavedTheme()) {
      setTheme(e.matches ? 'dark' : 'light');
    }
  });

  // Expose toggle function globally
  window.toggleTheme = function () {
    const current = html.classList.contains('dark') ? 'dark' : 'light';
    setTheme(current === 'dark' ? 'light' : 'dark');
  };
})();
