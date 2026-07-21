/* <demo-slot> — user-fillable demo media placeholder (video + image).
 * Drop an MP4/WebM/GIF/PNG/JPEG/WebP onto it (or click to browse).
 * Video renders autoplay/loop/muted. Persists via .demo-slots.state.json
 * (fetch-read / window.omelette.writeFile-write, same pattern as image-slot).
 * Attributes: id (persistence key, required), placeholder (empty caption).
 * Sets data-filled on the host when showing media.
 */
(() => {
  const STATE_FILE = '.demo-slots.state.json';
  const MAX_BYTES = 30 * 1024 * 1024;
  const ACCEPT = ['video/mp4', 'video/webm', 'image/gif', 'image/png', 'image/jpeg', 'image/webp'];

  // ── shared sidecar store ──
  const subs = new Set();
  let slots = {};
  let loadP = null;
  let loaded = false;
  let saving = false, saveDirty = false;

  function load() {
    if (loadP) return loadP;
    loadP = fetch(STATE_FILE)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j && typeof j === 'object') slots = j; })
      .catch(() => {})
      .then(() => { loaded = true; subs.forEach((f) => f()); });
    return loadP;
  }
  function save() {
    if (saving) { saveDirty = true; return; }
    const w = window.omelette && window.omelette.writeFile;
    if (!w) return;
    saving = true;
    Promise.resolve(w(STATE_FILE, JSON.stringify(slots)))
      .catch(() => {})
      .then(() => { saving = false; if (saveDirty) { saveDirty = false; save(); } });
  }
  function setSlot(id, val) {
    if (val == null) delete slots[id]; else slots[id] = val;
    subs.forEach((f) => f());
    save();
  }

  const icon =
    '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
    '<rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="M10 9.5v5l4.5-2.5z" fill="currentColor" stroke="none"></path></svg>';

  class DemoSlot extends HTMLElement {
    static get observedAttributes() { return ['placeholder', 'id', 'src']; }

    constructor() {
      super();
      const root = this.attachShadow({ mode: 'open' });
      root.innerHTML =
        '<style>' +
        ':host{display:block;position:relative;width:100%;height:100%;font:12.5px/1.4 system-ui,-apple-system,sans-serif;color:#8b8981}' +
        '.frame{position:absolute;inset:0;overflow:hidden;background:#282824}' +
        '.frame video,.frame img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:none}' +
        '.empty{position:absolute;inset:0;display:none;flex-direction:column;align-items:flex-end;justify-content:flex-start;gap:6px;padding:22px 52px 0 0;cursor:pointer;user-select:none;outline:1.5px dashed #4d4c45;outline-offset:-14px}' +
        '.empty svg{opacity:.5}' +
        '.empty .cap{font-weight:500;letter-spacing:.01em;max-width:200px;text-align:right}' +
        '.empty .sub{font-size:11px}' +
        '.empty .sub u{text-underline-offset:2px}' +
        '.empty:hover .sub u{color:#c8c6be}' +
        ':host([data-over]) .frame{outline:2px solid #b8d4a8;outline-offset:-2px;background:rgba(184,212,168,.08)}' +
        ':host([data-reframe]) .frame{outline:2px solid #b8d4a8;outline-offset:-2px;cursor:grab}' +
        ':host([data-reframe][data-panning]) .frame{cursor:grabbing}' +
        '.rhint{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);white-space:nowrap;font-size:11px;background:rgba(35,35,32,.85);color:#c8c6be;padding:6px 14px;border-radius:99px;display:none;z-index:6;pointer-events:none}' +
        ':host([data-reframe]) .rhint{display:block}' +
        ':host([data-reframe]) .ctl{opacity:1;pointer-events:auto}' +
        '.ctl{position:absolute;top:12px;right:52px;display:flex;gap:6px;opacity:0;pointer-events:none;transition:opacity .15s;z-index:5}' +
        ':host([data-filled][data-editable]:hover) .ctl{opacity:1;pointer-events:auto}' +
        '.ctl button{appearance:none;border:0;border-radius:6px;padding:5px 10px;cursor:pointer;font:11.5px system-ui,sans-serif;background:rgba(240,239,233,.9);color:#232320}' +
        '.ctl button:hover{background:#fff}' +
        '.err{position:absolute;left:16px;bottom:12px;font-size:11px;color:#e0a598;display:none;z-index:5}' +
        '</style>' +
        '<div class="frame">' +
        '  <video muted loop playsinline autoplay></video>' +
        '  <img alt="" draggable="false">' +
        '  <div class="empty">' + icon +
        '    <div class="cap"></div>' +
        '    <div class="sub">or <u>browse files</u></div></div>' +
        '</div>' +
        '<div class="ctl"><button data-act="adjust">Adjust</button><button data-act="replace">Replace</button><button data-act="clear">Clear</button></div>' +
        '<div class="rhint">drag to move · scroll to zoom · click Done or press Esc</div>' +
        '<div class="err"></div>' +
        '<input type="file" accept="' + ACCEPT.join(',') + '" hidden>';

      this._video = root.querySelector('video');
      this._img = root.querySelector('img');
      this._empty = root.querySelector('.empty');
      this._cap = root.querySelector('.cap');
      this._sub = root.querySelector('.sub');
      this._err = root.querySelector('.err');
      this._input = root.querySelector('input');
      this._local = null;
      this._depth = 0;
      this._view = { x: 0, y: 0, s: 1 };
      this._reframing = false;
      this._adjBtn = root.querySelector('[data-act="adjust"]');
      this._subFn = () => this._render();

      this._empty.addEventListener('click', () => this._input.click());
      root.addEventListener('click', (e) => {
        const act = e.target && e.target.getAttribute && e.target.getAttribute('data-act');
        if (act === 'replace') { this._exitReframe(true); this._input.click(); }
        else if (act === 'clear') { this._exitReframe(false); if (this.id) setSlot(this.id, null); this._local = null; this._render(); }
        else if (act === 'adjust') { this._reframing ? this._exitReframe(true) : this._enterReframe(); }
      });
      this.addEventListener('dblclick', () => {
        if (this.hasAttribute('data-filled') && this.hasAttribute('data-editable') && !this._reframing) this._enterReframe();
      });
      this._input.addEventListener('change', () => {
        const f = this._input.files && this._input.files[0];
        if (f) this._ingest(f);
        this._input.value = '';
      });
    }

    connectedCallback() {
      ['dragenter', 'dragover', 'dragleave', 'drop'].forEach((t) => this.addEventListener(t, this));
      subs.add(this._subFn);
      this.addEventListener('pointerenter', this._subFn);
      load().then(() => this._render());
      this._render();
    }
    disconnectedCallback() {
      subs.delete(this._subFn);
      this.removeEventListener('pointerenter', this._subFn);
    }
    attributeChangedCallback() { if (this.shadowRoot) this._render(); }

    handleEvent(e) {
      if (e.type === 'dragenter' || e.type === 'dragover') {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
        if (e.type === 'dragenter') this._depth++;
        this.setAttribute('data-over', '');
      } else if (e.type === 'dragleave') {
        if (--this._depth <= 0) { this._depth = 0; this.removeAttribute('data-over'); }
      } else if (e.type === 'drop') {
        e.preventDefault();
        this._depth = 0;
        this.removeAttribute('data-over');
        const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) this._ingest(f);
      }
    }

    _applyView() {
      const t = 'translate(' + this._view.x + 'px,' + this._view.y + 'px) scale(' + this._view.s + ')';
      this._video.style.transform = t;
      this._img.style.transform = t;
    }

    _enterReframe() {
      if (this._reframing) return;
      this._reframing = true;
      this.setAttribute('data-reframe', '');
      this._adjBtn.textContent = 'Done';
      const onDown = (e) => {
        if (e.button !== 0) return;
        const path = e.composedPath ? e.composedPath() : [];
        if (path.indexOf(this) < 0) { this._exitReframe(true); return; }
        if (e.target && e.target.getAttribute && e.target.getAttribute('data-act')) return;
        e.preventDefault();
        this.setAttribute('data-panning', '');
        const start = { px: e.clientX, py: e.clientY, x: this._view.x, y: this._view.y };
        const move = (ev) => {
          this._view.x = start.x + (ev.clientX - start.px);
          this._view.y = start.y + (ev.clientY - start.py);
          this._applyView();
        };
        const up = () => {
          this.removeAttribute('data-panning');
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
      };
      const onWheel = (e) => {
        e.preventDefault();
        const k = Math.exp(-e.deltaY * 0.0015);
        const ns = Math.min(6, Math.max(0.3, this._view.s * k));
        const r = this.getBoundingClientRect();
        const cx = e.clientX - (r.left + r.width / 2);
        const cy = e.clientY - (r.top + r.height / 2);
        const real = ns / this._view.s;
        this._view.x = cx + (this._view.x - cx) * real;
        this._view.y = cy + (this._view.y - cy) * real;
        this._view.s = ns;
        this._applyView();
      };
      const onKey = (e) => { if (e.key === 'Escape') this._exitReframe(true); };
      this._rf = { onDown, onWheel, onKey };
      window.addEventListener('pointerdown', onDown, true);
      this.addEventListener('wheel', onWheel, { passive: false });
      window.addEventListener('keydown', onKey);
    }

    _exitReframe(commit) {
      if (!this._reframing) return;
      this._reframing = false;
      this.removeAttribute('data-reframe');
      this.removeAttribute('data-panning');
      this._adjBtn.textContent = 'Adjust';
      if (this._rf) {
        window.removeEventListener('pointerdown', this._rf.onDown, true);
        this.removeEventListener('wheel', this._rf.onWheel);
        window.removeEventListener('keydown', this._rf.onKey);
        this._rf = null;
      }
      if (commit) {
        const stored = this.id ? slots[this.id] : this._local;
        if (stored && stored.url) {
          const val = { url: stored.url, view: { x: this._view.x, y: this._view.y, s: this._view.s } };
          if (this.id) setSlot(this.id, val); else this._local = val;
        }
      }
    }

    _setError(msg) {
      this._err.textContent = msg || '';
      this._err.style.display = msg ? 'block' : 'none';
      if (msg) setTimeout(() => { this._err.style.display = 'none'; }, 4000);
    }

    _ingest(file) {
      this._setError(null);
      if (!file || ACCEPT.indexOf(file.type) < 0) {
        this._setError('Drop an MP4, WebM, GIF, PNG, JPEG, or WebP.');
        return;
      }
      if (file.size > MAX_BYTES) {
        this._setError('File too large — keep it under 30 MB.');
        return;
      }
      const rd = new FileReader();
      rd.onload = () => {
        const url = rd.result;
        this._view = { x: 0, y: 0, s: 1 };
        if (this.id) setSlot(this.id, { url }); else { this._local = { url }; this._render(); }
      };
      rd.readAsDataURL(file);
    }

    _render() {
      const editable = !!(window.omelette && window.omelette.writeFile);
      this.toggleAttribute('data-editable', editable);
      this._sub.style.display = editable ? '' : 'none';

      let stored = this.id ? slots[this.id] : this._local;
      let url = stored && typeof stored.url === 'string' ? stored.url : null;
      // sidecar is agent/user-writable — only accept media data URLs
      if (url && !/^data:(video|image)\//.test(url)) url = null;
      // author-set fallback (project file or http URL); a user drop overrides it
      if (!url) { url = this.getAttribute('src') || null; stored = url ? { url } : stored; }

      this._cap.textContent = this.getAttribute('placeholder') || 'Drop a demo video or GIF';

      if (url) {
        if (!this._reframing) {
          const v = stored && stored.view;
          this._view = v && typeof v.s === 'number' ? { x: v.x || 0, y: v.y || 0, s: v.s } : { x: 0, y: 0, s: 1 };
        }
        this._applyView();
        const isVideo = url.indexOf('data:video/') === 0 || /\.(mp4|webm|mov)(\?|#|$)/i.test(url);
        if (isVideo) {
          if (this._video.getAttribute('src') !== url) this._video.setAttribute('src', url);
          this._video.style.display = 'block';
          this._video.play && this._video.play().catch(() => {});
          this._img.style.display = 'none';
          this._img.removeAttribute('src');
        } else {
          if (this._img.getAttribute('src') !== url) this._img.setAttribute('src', url);
          this._img.style.display = 'block';
          this._video.style.display = 'none';
          this._video.removeAttribute('src');
        }
        this._empty.style.display = 'none';
        this.setAttribute('data-filled', '');
      } else {
        this._video.style.display = 'none';
        this._video.removeAttribute('src');
        this._img.style.display = 'none';
        this._img.removeAttribute('src');
        // only show the drop-zone placeholder while authoring; viewers see a clean panel
        this._empty.style.display = editable ? 'flex' : 'none';
        this.removeAttribute('data-filled');
      }
    }
  }

  if (!customElements.get('demo-slot')) customElements.define('demo-slot', DemoSlot);
})();
