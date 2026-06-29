/* Lightweight, dependency-free rich text editor.
   Enhances any <textarea data-rich> into a formatting editor that writes HTML
   back into the textarea (so existing form submits keep working).
   Toolbar: headings, bold/italic/underline, lists, quote, link, and image upload. */
(function () {
  var UPLOAD_URL = '/admin/upload';

  function btn(label, title, handler) {
    var b = document.createElement('button');
    b.type = 'button';
    b.title = title;
    b.className = 're-btn';
    b.innerHTML = label;
    b.addEventListener('mousedown', function (e) { e.preventDefault(); }); // keep selection
    b.addEventListener('click', function (e) { e.preventDefault(); handler(); });
    return b;
  }
  function icon(name) { return '<span class="material-symbols-outlined" style="font-size:18px">' + name + '</span>'; }

  function enhance(ta) {
    if (ta.dataset.richInit) return;
    ta.dataset.richInit = '1';

    var wrap = document.createElement('div');
    wrap.className = 're-wrap border rounded bg-white';
    var bar = document.createElement('div');
    bar.className = 're-bar flex flex-wrap items-center gap-1 border-b px-2 py-1 bg-surface-container-lowest';
    var ed = document.createElement('div');
    ed.className = 're-editor prose-gdcu px-3 py-2 text-sm';
    ed.contentEditable = 'true';
    ed.style.minHeight = '160px';
    ed.style.outline = 'none';
    ed.innerHTML = ta.value || '';

    function sync() { ta.value = ed.innerHTML; }
    ed.addEventListener('input', sync);
    ed.addEventListener('blur', sync);
    function cmd(c, v) { document.execCommand(c, false, v || null); ed.focus(); sync(); }

    bar.appendChild(btn(icon('title'), 'Heading', function () { cmd('formatBlock', 'H3'); }));
    bar.appendChild(btn('<b>B</b>', 'Bold', function () { cmd('bold'); }));
    bar.appendChild(btn('<i>I</i>', 'Italic', function () { cmd('italic'); }));
    bar.appendChild(btn('<u>U</u>', 'Underline', function () { cmd('underline'); }));
    bar.appendChild(btn(icon('format_list_bulleted'), 'Bulleted list', function () { cmd('insertUnorderedList'); }));
    bar.appendChild(btn(icon('format_list_numbered'), 'Numbered list', function () { cmd('insertOrderedList'); }));
    bar.appendChild(btn(icon('format_quote'), 'Quote', function () { cmd('formatBlock', 'BLOCKQUOTE'); }));
    bar.appendChild(btn(icon('link'), 'Insert link', function () {
      var url = prompt('Link URL:'); if (url) cmd('createLink', url);
    }));
    bar.appendChild(btn(icon('format_clear'), 'Clear formatting', function () { cmd('removeFormat'); cmd('formatBlock', 'P'); }));

    // Image upload button
    var fileInput = document.createElement('input');
    fileInput.type = 'file'; fileInput.accept = 'image/*'; fileInput.style.display = 'none';
    var imgBtn = btn(icon('image'), 'Insert image', function () { fileInput.click(); });
    fileInput.addEventListener('change', function () {
      if (!fileInput.files || !fileInput.files[0]) return;
      var fd = new FormData(); fd.append('image', fileInput.files[0]);
      imgBtn.innerHTML = icon('hourglass_top');
      fetch(UPLOAD_URL, { method: 'POST', body: fd, headers: { 'X-Requested-With': 'fetch' } })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d && d.url) { ed.focus(); cmd('insertHTML', '<img src="' + d.url + '" alt="" style="max-width:100%;border-radius:6px" />'); }
          else { alert(d && d.error ? d.error : 'Upload failed.'); }
        })
        .catch(function () { alert('Upload failed.'); })
        .finally(function () { imgBtn.innerHTML = icon('image'); fileInput.value = ''; });
    });
    bar.appendChild(imgBtn);
    bar.appendChild(fileInput);

    ta.style.display = 'none';
    ta.parentNode.insertBefore(wrap, ta);
    wrap.appendChild(bar); wrap.appendChild(ed); wrap.appendChild(ta);
    // Ensure the textarea is current right before its form submits.
    if (ta.form) ta.form.addEventListener('submit', sync);
  }

  function init(root) { (root || document).querySelectorAll('textarea[data-rich]').forEach(enhance); }

  // Upload buttons for plain image-URL fields: <button data-upload-target="#id" [data-upload-preview="#imgId"]>
  function initUploaders(root) {
    (root || document).querySelectorAll('[data-upload-target]').forEach(function (b) {
      if (b.dataset.upInit) return; b.dataset.upInit = '1';
      var fi = document.createElement('input'); fi.type = 'file'; fi.accept = 'image/*'; fi.style.display = 'none';
      b.parentNode.insertBefore(fi, b.nextSibling);
      b.addEventListener('click', function (e) { e.preventDefault(); fi.click(); });
      fi.addEventListener('change', function () {
        if (!fi.files || !fi.files[0]) return;
        var fd = new FormData(); fd.append('image', fi.files[0]);
        var orig = b.innerHTML; b.innerHTML = 'Uploading…'; b.disabled = true;
        fetch(UPLOAD_URL, { method: 'POST', body: fd, headers: { 'X-Requested-With': 'fetch' } })
          .then(function (r) { return r.json(); })
          .then(function (d) {
            if (d && d.url) {
              var t = document.querySelector(b.getAttribute('data-upload-target'));
              if (t) { t.value = d.url; t.dispatchEvent(new Event('input')); }
              var p = b.getAttribute('data-upload-preview') && document.querySelector(b.getAttribute('data-upload-preview'));
              if (p) { p.src = d.url; }
            } else { alert(d && d.error ? d.error : 'Upload failed.'); }
          })
          .catch(function () { alert('Upload failed.'); })
          .finally(function () { b.innerHTML = orig; b.disabled = false; fi.value = ''; });
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () { init(document); initUploaders(document); });
  // expose for any dynamically injected forms
  window.initRichEditors = function (r) { init(r); initUploaders(r); };
})();
