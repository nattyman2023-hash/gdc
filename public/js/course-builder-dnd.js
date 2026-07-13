/* Drag-and-drop reordering for the course builder.
 *
 * The builder uses native HTML5 drag and drop so it also works without a
 * third-party dependency. Reordering is saved in the background with the
 * page's CSRF token; a successful drop does not reload the whole builder.
 */
(function () {
  var csrfMeta = document.querySelector('meta[name="csrf-token"]');
  var csrfToken = csrfMeta ? csrfMeta.getAttribute('content') : '';

  function initSortable(container) {
    var url = container.getAttribute('data-sortable-url');
    if (!url) return;

    var itemSelector = '[data-sortable-id]';
    var dragState = null;

    function items() {
      return Array.prototype.slice.call(container.children).filter(function (el) {
        return el.matches && el.matches(itemSelector);
      });
    }

    function order() {
      return items().map(function (el) {
        return el.getAttribute('data-sortable-id');
      });
    }

    function groups() {
      var result = {};
      items().forEach(function (el) {
        var id = el.getAttribute('data-sortable-id');
        result[id] = {
          block_no: el.getAttribute('data-sortable-group') || null,
          block_title: el.getAttribute('data-sortable-group-title') || null,
        };
      });
      return result;
    }

    function sameOrder(a, b) {
      if (a.length !== b.length) return false;
      return a.every(function (id, index) { return id === b[index]; });
    }

    function sameGroups(a, b) {
      var aKeys = Object.keys(a);
      var bKeys = Object.keys(b);
      if (aKeys.length !== bKeys.length) return false;
      return aKeys.every(function (id) {
        return a[id].block_no === b[id].block_no && a[id].block_title === b[id].block_title;
      });
    }

    function setStatus(message, tone) {
      var status = container.previousElementSibling;
      if (!status || !status.hasAttribute('data-sortable-status')) {
        status = document.createElement('p');
        status.setAttribute('data-sortable-status', '');
        status.className = 'text-xs px-2 py-1 hidden';
        container.parentNode.insertBefore(status, container);
      }
      status.textContent = message || '';
      status.classList.remove('hidden', 'text-green-700', 'text-red-700', 'text-on-surface-variant');
      if (!message) status.classList.add('hidden');
      else status.classList.add(tone === 'error' ? 'text-red-700' : tone === 'success' ? 'text-green-700' : 'text-on-surface-variant');
    }

    function updatePositions() {
      var offset = Number(container.getAttribute('data-sortable-offset')) || 0;
      items().forEach(function (item, index) {
        var position = item.querySelector('[data-sortable-position]');
        if (position) {
          var value = index + 1 + offset;
          position.textContent = position.textContent.indexOf('.') === -1 ? String(value) : value + '.';
        }
        var group = item.getAttribute('data-sortable-group') || '';
        item.classList.toggle('pl-10', !!group);
      });

      // A block heading should not remain visible after its last part is
      // dragged into another block.
      container.querySelectorAll('[data-sortable-group-header]').forEach(function (header) {
        var group = header.getAttribute('data-sortable-group-header') || '';
        var hasItems = items().some(function (item) {
          return (item.getAttribute('data-sortable-group') || '') === group;
        });
        header.classList.toggle('hidden', !hasItems);
      });
    }

    function restore(state) {
      state.originalChildren.forEach(function (child) {
        container.appendChild(child);
      });
      Object.keys(state.originalGroups).forEach(function (id) {
        var item = container.querySelector('[data-sortable-id="' + id + '"]');
        if (!item) return;
        var group = state.originalGroups[id];
        if (group.block_no) item.setAttribute('data-sortable-group', group.block_no);
        else item.removeAttribute('data-sortable-group');
        if (group.block_title) item.setAttribute('data-sortable-group-title', group.block_title);
        else item.removeAttribute('data-sortable-group-title');
      });
      updatePositions();
    }

    function snapshot(item) {
      return {
        item: item,
        originalOrder: order(),
        originalGroups: groups(),
        originalChildren: Array.prototype.slice.call(container.children),
      };
    }

    function applyTargetGroup(item, target) {
      var targetGroup = target.getAttribute('data-sortable-group') || '';
      var targetTitle = target.getAttribute('data-sortable-group-title') || '';
      if (targetGroup) item.setAttribute('data-sortable-group', targetGroup);
      else item.removeAttribute('data-sortable-group');
      if (targetTitle) item.setAttribute('data-sortable-group-title', targetTitle);
      else item.removeAttribute('data-sortable-group-title');
    }

    function bundle(item) {
      var nodes = [item];
      var next = item.nextElementSibling;
      while (next && !next.matches(itemSelector) && !next.matches('[data-sortable-group-header]')) {
        nodes.push(next);
        next = next.nextElementSibling;
      }
      return nodes;
    }

    function moveBundle(item, target, before) {
      var itemNodes = bundle(item);
      var targetNodes = bundle(target);
      var anchor = before ? targetNodes[0] : targetNodes[targetNodes.length - 1].nextSibling;
      itemNodes.forEach(function (node) {
        container.insertBefore(node, anchor);
      });
    }

    container.addEventListener('dragstart', function (e) {
      var handle = e.target.closest ? e.target.closest('.drag-handle') : null;
      var item = e.target.closest ? e.target.closest(itemSelector) : null;
      if (!handle || !item || !container.contains(item)) {
        e.preventDefault();
        return;
      }

      dragState = snapshot(item);
      setStatus('Reordering…', 'pending');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', item.getAttribute('data-sortable-id')); } catch (err) { /* Safari requires a value; ignore if unavailable. */ }
      setTimeout(function () { item.classList.add('opacity-40'); }, 0);
    });

    container.addEventListener('dragover', function (e) {
      if (!dragState) return;
      e.preventDefault();
      var target = e.target.closest ? e.target.closest(itemSelector) : null;
      if (!target || target === dragState.item || !container.contains(target)) return;

      var rect = target.getBoundingClientRect();
      var before = (e.clientY - rect.top) < rect.height / 2;
      moveBundle(dragState.item, target, before);

      // Lessons may be moved between blocks. The receiving block's number and
      // title travel with the part and are persisted with the new sort order.
      applyTargetGroup(dragState.item, target);
      updatePositions();
    });

    container.addEventListener('dragend', function () {
      if (!dragState) return;
      dragState.item.classList.remove('opacity-40');
      var state = dragState;
      dragState = null;
      var changed = !sameOrder(state.originalOrder, order()) || !sameGroups(state.originalGroups, groups());
      if (changed) submitOrder(state);
      else setStatus('', '');
    });

    // Native drag-and-drop is not dependable on every touch device or browser.
    // These controls use the same save endpoint, so ordering remains usable
    // when dragging is unavailable or difficult.
    container.addEventListener('click', function (e) {
      var button = e.target.closest ? e.target.closest('[data-sortable-move]') : null;
      if (!button || !container.contains(button)) return;
      e.preventDefault();
      e.stopPropagation();

      var item = button.closest(itemSelector);
      if (!item || !container.contains(item)) return;
      var allItems = items();
      var index = allItems.indexOf(item);
      var direction = button.getAttribute('data-sortable-move');
      var targetIndex = direction === 'up' ? index - 1 : index + 1;
      var target = allItems[targetIndex];
      if (!target) return;

      var state = snapshot(item);
      moveBundle(item, target, direction === 'up');
      applyTargetGroup(item, target);
      updatePositions();
      setStatus('Reordering…', 'pending');
      submitOrder(state);
    });

    function submitOrder(state) {
      var ids = order();
      var body = new URLSearchParams();
      ids.forEach(function (id) { body.append('ids', id); });
      body.append('groups', JSON.stringify(groups()));
      if (csrfToken) body.append('_csrf', csrfToken);

      fetch(url, {
        method: 'POST',
        body: body,
        credentials: 'same-origin',
        headers: { 'X-Requested-With': 'fetch', Accept: 'application/json' },
      })
        .then(function (response) {
          var contentType = response.headers.get('content-type') || '';
          if (response.redirected || contentType.indexOf('application/json') === -1) {
            throw new Error('The session or builder response was not available.');
          }
          return response.json().catch(function () { return {}; }).then(function (data) {
            if (!response.ok) throw new Error(data.error || 'reorder failed');
            return data;
          });
        })
        .then(function () {
          setStatus('Order saved.', 'success');
          window.setTimeout(function () { setStatus('', ''); }, 2500);
        })
        .catch(function () {
          restore(state);
          setStatus('Could not save the new order. The previous order has been restored.', 'error');
        });
    }

    updatePositions();
  }

  document.querySelectorAll('[data-sortable-list]').forEach(initSortable);
})();
