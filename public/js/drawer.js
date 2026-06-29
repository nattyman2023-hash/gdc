/* Slide-over drawer for quick view/edit of CRM records (progressive enhancement). */
(function () {
  var drawer = document.getElementById('drawer');
  var panel = document.getElementById('drawer-panel');
  var body = document.getElementById('drawer-body');
  if (!drawer || !panel || !body) return;

  var currentUrl = null;

  function open() {
    drawer.classList.remove('hidden');
    requestAnimationFrame(function () { panel.classList.remove('translate-x-full'); });
  }
  function close() {
    panel.classList.add('translate-x-full');
    setTimeout(function () { drawer.classList.add('hidden'); }, 250);
  }
  function showError(msg) {
    var bar = document.createElement('div');
    bar.className = 'm-4 p-3 rounded bg-error-container text-on-error-container text-sm';
    bar.textContent = msg || 'Sorry, that could not be saved. Please try again.';
    body.insertBefore(bar, body.firstChild);
    setTimeout(function () { bar.remove(); }, 4000);
  }
  function bindForms() {
    body.querySelectorAll('form[data-drawer-form]').forEach(function (f) {
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        var submitBtn = f.querySelector('button[type=submit], button:not([type])');
        var original = submitBtn ? submitBtn.innerHTML : '';
        if (submitBtn) { submitBtn.disabled = true; submitBtn.innerHTML = 'Saving…'; }
        fetch(f.action, {
          method: 'POST',
          body: new URLSearchParams(new FormData(f)),
          headers: { 'X-Requested-With': 'fetch' },
          cache: 'no-store',
        })
          .then(function (r) {
            if (!r.ok) throw new Error('Request failed');
            // Destructive / list-affecting actions refresh the whole page.
            if (f.hasAttribute('data-reload-page')) { window.location.reload(); return; }
            // Otherwise refresh the drawer immediately so the change shows at once.
            load(currentUrl);
          })
          .catch(function () {
            if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = original; }
            showError();
          });
      });
    });
  }
  function load(url) {
    currentUrl = url;
    body.innerHTML = '<div class="p-10 text-center text-on-surface-variant"><span class="material-symbols-outlined animate-spin">progress_activity</span><p class="mt-2 text-sm">Loading…</p></div>';
    open();
    // no-store + cache-buster so the refreshed drawer always reflects the latest data.
    var bust = (url.indexOf('?') === -1 ? '?' : '&') + '_=' + Date.now();
    fetch(url + bust, { headers: { 'X-Requested-With': 'fetch' }, cache: 'no-store' })
      .then(function (r) { return r.text(); })
      .then(function (html) { body.innerHTML = html; bindForms(); })
      .catch(function () { body.innerHTML = '<div class="p-10 text-center text-error">Could not load this record.</div>'; });
  }

  document.addEventListener('click', function (e) {
    var trigger = e.target.closest('[data-drawer]');
    if (trigger) { e.preventDefault(); load(trigger.getAttribute('data-drawer')); return; }
    if (e.target.closest('[data-drawer-close]')) { close(); }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
})();
