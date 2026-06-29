/* Multi-step application wizard with progress + autosave/resume (localStorage). */
(function () {
  var form = document.getElementById('apply-form');
  if (!form) return;
  var steps = Array.prototype.slice.call(form.querySelectorAll(':scope > fieldset'));
  var submitRow = form.querySelector('[data-submit-row]');
  var progressEl = document.getElementById('apply-progress');
  if (steps.length < 2 || !submitRow) return;

  var DRAFT_KEY = 'gdcu-application-draft-v1';
  var current = 0;

  // ── Progress header ───────────────────────────────────────
  var labels = steps.map(function (s, i) {
    var lg = s.querySelector('legend');
    var text = lg ? lg.textContent.replace(/^\s*\d+\s*·\s*/, '').trim() : ('Step ' + (i + 1));
    if (lg) lg.style.display = 'none'; // we show the title in the progress bar / step header
    return text;
  });

  function renderProgress() {
    if (!progressEl) return;
    var html = '<div class="flex items-center gap-2 overflow-x-auto pb-2">';
    labels.forEach(function (lbl, i) {
      var state = i < current ? 'done' : (i === current ? 'active' : 'todo');
      var circle = state === 'done'
        ? '<span class="material-symbols-outlined text-base">check</span>'
        : (i + 1);
      var cls = state === 'active' ? 'bg-primary text-on-primary' : (state === 'done' ? 'bg-secondary text-on-secondary' : 'bg-surface-container-high text-on-surface-variant');
      html += '<div class="flex items-center gap-2 shrink-0">' +
        '<span class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ' + cls + '">' + circle + '</span>' +
        '<span class="text-xs font-bold ' + (i === current ? 'text-primary' : 'text-on-surface-variant') + ' hidden sm:inline">' + lbl + '</span>' +
        (i < labels.length - 1 ? '<span class="w-6 h-px bg-outline-variant"></span>' : '') +
        '</div>';
    });
    html += '</div><p class="font-headline text-headline-sm text-primary mt-3 sm:hidden">Step ' + (current + 1) + ' of ' + labels.length + ' — ' + labels[current] + '</p>';
    progressEl.innerHTML = html;
  }

  function showStep(n) {
    current = Math.max(0, Math.min(steps.length - 1, n));
    steps.forEach(function (s, i) { s.style.display = i === current ? '' : 'none'; });
    submitRow.style.display = current === steps.length - 1 ? '' : 'none';
    nav.querySelector('[data-back]').style.display = current === 0 ? 'none' : '';
    nav.querySelector('[data-next]').style.display = current === steps.length - 1 ? 'none' : '';
    renderProgress();
    window.scrollTo({ top: form.offsetTop - 90, behavior: 'smooth' });
  }

  function validateStep() {
    var fields = steps[current].querySelectorAll('input, select, textarea');
    for (var i = 0; i < fields.length; i++) {
      if (!fields[i].checkValidity()) { fields[i].reportValidity(); return false; }
    }
    return true;
  }

  // ── Navigation bar ────────────────────────────────────────
  var nav = document.createElement('div');
  nav.className = 'flex items-center justify-between gap-3 pt-4';
  nav.innerHTML =
    '<button type="button" data-back class="px-5 py-2.5 rounded-lg font-bold border border-outline text-on-surface-variant">Back</button>' +
    '<div class="flex items-center gap-3"><span data-saved class="text-xs text-on-surface-variant"></span>' +
    '<button type="button" data-next class="bg-primary text-on-primary px-6 py-2.5 rounded-lg font-bold">Next</button></div>';
  submitRow.parentNode.insertBefore(nav, submitRow);
  nav.querySelector('[data-back]').addEventListener('click', function () { showStep(current - 1); });
  nav.querySelector('[data-next]').addEventListener('click', function () { if (validateStep()) showStep(current + 1); });

  // ── Autosave / resume ─────────────────────────────────────
  var savedEl = nav.querySelector('[data-saved]');
  var saveTimer = null;
  function saveDraft() {
    var data = {};
    form.querySelectorAll('input, select, textarea').forEach(function (el) {
      if (!el.name) return;
      if (el.type === 'checkbox') data[el.name] = el.checked;
      else data[el.name] = el.value;
    });
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(data)); savedEl.textContent = 'Draft saved'; } catch (e) {}
  }
  function restoreDraft() {
    var raw;
    try { raw = localStorage.getItem(DRAFT_KEY); } catch (e) { return; }
    if (!raw) return;
    var data;
    try { data = JSON.parse(raw); } catch (e) { return; }
    var restored = false;
    form.querySelectorAll('input, select, textarea').forEach(function (el) {
      if (!el.name || !(el.name in data)) return;
      if (el.type === 'checkbox') el.checked = !!data[el.name];
      else if (!el.value) el.value = data[el.name];
      if (data[el.name]) restored = true;
    });
    if (restored && savedEl) savedEl.textContent = 'Resumed your saved draft';
  }
  form.addEventListener('input', function () {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveDraft, 500);
  });
  form.addEventListener('submit', function () { try { localStorage.removeItem(DRAFT_KEY); } catch (e) {} });

  restoreDraft();
  showStep(0);
})();
