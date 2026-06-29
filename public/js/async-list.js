/* Submit a form via fetch and refresh an on-page list region without a full reload.
   Usage: <form data-async-refresh="#notes-list" ...>  with a matching element id on the list. */
(function () {
  document.querySelectorAll('form[data-async-refresh]').forEach(function (f) {
    var sel = f.getAttribute('data-async-refresh');
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var target = document.querySelector(sel);
      if (!target) { f.submit(); return; }
      var btn = f.querySelector('button[type=submit], button:not([type])');
      var original = btn ? btn.innerHTML : '';
      if (btn) { btn.disabled = true; btn.innerHTML = 'Saving…'; }
      // The POST redirects to the detail page; fetch follows it and returns that HTML.
      fetch(f.action, { method: 'POST', body: new URLSearchParams(new FormData(f)), headers: { 'X-Requested-With': 'fetch' } })
        .then(function (r) { if (!r.ok) throw new Error('failed'); return r.text(); })
        .then(function (html) {
          var doc = new DOMParser().parseFromString(html, 'text/html');
          var fresh = doc.querySelector(sel);
          if (fresh) { target.innerHTML = fresh.innerHTML; }
          f.reset();
          if (btn) { btn.disabled = false; btn.innerHTML = original; }
          target.classList.add('ring-1', 'ring-secondary');
          setTimeout(function () { target.classList.remove('ring-1', 'ring-secondary'); }, 600);
        })
        .catch(function () { f.submit(); }); // fall back to a normal submit on any error
    });
  });
})();
