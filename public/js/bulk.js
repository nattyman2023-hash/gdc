/* Bulk-action toolbar (progressive enhancement). Used for CRM tables and the
   course builder. Checkboxes are matched by their native `.form` property
   rather than DOM nesting, so a row that already has its own per-item
   <form> (edit/delete) can still host a bulk-select checkbox — it just
   points at the bulk form via a `form="<id>"` attribute instead of being
   physically nested inside it (nested <form> elements are invalid HTML). */
(function () {
  document.querySelectorAll('form[data-bulk]').forEach(function (form) {
    var boxes = function () { return Array.prototype.slice.call(document.querySelectorAll('input[name="ids"]')).filter(function (b) { return b.form === form; }); };
    var all = form.querySelector('[data-bulk-all]');
    var bar = form.querySelector('[data-bulk-bar]');
    var count = form.querySelector('[data-bulk-count]');
    var action = form.querySelector('[data-bulk-action]');
    var valueFields = form.querySelectorAll('[data-bulk-for]');

    function selected() { return boxes().filter(function (b) { return b.checked; }); }
    function refresh() {
      var n = selected().length;
      if (count) count.textContent = n;
      if (bar) bar.classList.toggle('hidden', n === 0);
      if (all) {
        var total = boxes().length;
        all.checked = n > 0 && n === total;
        all.indeterminate = n > 0 && n < total;
      }
    }

    // Stop a checkbox click from bubbling up to the row's drawer trigger.
    boxes().forEach(function (b) {
      b.addEventListener('click', function (e) { e.stopPropagation(); });
      b.addEventListener('change', refresh);
    });
    if (all) {
      all.addEventListener('click', function (e) { e.stopPropagation(); });
      all.addEventListener('change', function () {
        boxes().forEach(function (b) { b.checked = all.checked; });
        refresh();
      });
    }
    if (action) {
      action.addEventListener('change', function () {
        valueFields.forEach(function (f) { f.classList.toggle('hidden', f.getAttribute('data-bulk-for') !== action.value); });
      });
    }
    form.addEventListener('submit', function (e) {
      if (!selected().length) { e.preventDefault(); return; }
      if (action && !action.value) { e.preventDefault(); alert('Choose an action to apply.'); return; }
      if (action && action.value === 'delete' && !confirm('Permanently delete the selected records?')) { e.preventDefault(); }
    });
    refresh();
  });
})();
