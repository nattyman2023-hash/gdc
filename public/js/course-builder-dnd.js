/* Drag-and-drop reordering for the course builder (modules, lessons within a
 * module). Uses the native HTML5 Drag and Drop API — no third-party library —
 * restricted to a small grip handle so it doesn't fight with the surrounding
 * <details>/<summary> click-to-expand or the bulk-select checkboxes. The
 * numeric "Sort order" field in each edit form remains as a no-JS fallback.
 *
 * After a successful drop, the page reloads so lesson "Lesson N" block
 * groupings and module numbering — computed server-side — stay accurate,
 * rather than trying to keep that nested state in sync client-side.
 */
(function () {
  function initSortable(container) {
    var url = container.getAttribute('data-sortable-url');
    if (!url) return;
    var itemSelector = '[data-sortable-id]';
    var dragEl = null;

    function items() {
      return Array.prototype.slice.call(container.children).filter(function (el) {
        return el.matches && el.matches(itemSelector);
      });
    }

    container.addEventListener('dragstart', function (e) {
      var handle = e.target.closest ? e.target.closest('.drag-handle') : null;
      var item = e.target.closest ? e.target.closest(itemSelector) : null;
      if (!handle || !item || !container.contains(item)) { e.preventDefault(); return; }
      dragEl = item;
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', item.getAttribute('data-sortable-id')); } catch (err) { /* Safari needs a value set; ignore if it fails */ }
      setTimeout(function () { item.classList.add('opacity-40'); }, 0);
    });

    container.addEventListener('dragover', function (e) {
      if (!dragEl) return;
      e.preventDefault();
      var target = e.target.closest ? e.target.closest(itemSelector) : null;
      if (!target || target === dragEl || !container.contains(target)) return;
      var rect = target.getBoundingClientRect();
      var before = (e.clientY - rect.top) < rect.height / 2;
      target.parentNode.insertBefore(dragEl, before ? target : target.nextSibling);
    });

    container.addEventListener('dragend', function () {
      if (dragEl) dragEl.classList.remove('opacity-40');
      var didDrag = !!dragEl;
      dragEl = null;
      if (didDrag) submitOrder();
    });

    function submitOrder() {
      var ids = items().map(function (el) { return el.getAttribute('data-sortable-id'); });
      var body = new URLSearchParams();
      ids.forEach(function (id) { body.append('ids', id); });
      fetch(url, { method: 'POST', body: body, headers: { 'X-Requested-With': 'fetch' } })
        .then(function (r) { if (!r.ok) throw new Error('reorder failed'); location.reload(); })
        .catch(function () { alert('Could not save the new order — reloading.'); location.reload(); });
    }
  }

  document.querySelectorAll('[data-sortable-list]').forEach(initSortable);
})();
