(() => {
  'use strict';

  // ---------- constants ----------
  const MAX_QUESTION = 500;
  const MAX_UPLOAD_BYTES = 12 * 1024 * 1024; // before client-side compression
  const MAX_SEND_BYTES = 4.5 * 1024 * 1024; // after compression
  const MAX_DIMENSION = 1600;
  const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
  const REQUEST_TIMEOUT_MS = 45000;
  const FALLBACK_PLATFORMS = [
    { id: 'digicampus', name: 'DigiCampus', examples: ["Where's my attendance?", 'Show me everything related to DBMS', 'Find my notes'] },
    { id: 'moodle', name: 'Moodle', examples: ['Where can I find my DBMS attendance?', 'Show me everything related to DBMS', 'Find my notes'] },
    { id: 'canvas', name: 'Canvas', examples: ['Where can I find my DBMS attendance?', 'Show me everything related to DBMS', 'Where are my grades?'] },
  ];

  // ---------- state ----------
  const state = { platforms: [], platform: 'digicampus', image: null, busy: false, aiEnabled: false, lastRequest: null };

  // ---------- helpers ----------
  const $ = (id) => document.getElementById(id);

  /** Tiny safe DOM builder: text is always set via textContent / text nodes, never innerHTML. */
  function el(tag, props = {}, ...kids) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (value === null || value === undefined || value === false) continue;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? '' : String(value));
    }
    for (const kid of kids.flat()) {
      if (kid === null || kid === undefined || kid === false) continue;
      node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return node;
  }

  const formatBytes = (n) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / (1024 * 1024)).toFixed(1)} MB`);
  const platformName = (id) => (state.platforms.find((p) => p.id === id) || { name: id }).name;

  const els = {
    tabs: $('platformTabs'), question: $('question'), counter: $('counter'), inputError: $('inputError'),
    suggestions: $('suggestions'), submit: $('submitBtn'), submitText: $('submitText'),
    dropzone: $('dropzone'), fileInput: $('screenshotUpload'), dzIdle: $('dzIdle'), dzFile: $('dzFile'),
    previewImg: $('previewImg'), fileName: $('fileName'), fileMeta: $('fileMeta'), removeImage: $('removeImage'),
    uploadError: $('uploadError'), result: $('resultBox'), badge: $('statusBadge'), statusText: $('statusText'),
    uploadSubtitle: $('uploadSubtitle'),
  };

  // ---------- platforms & suggestions ----------
  function renderTabs() {
    els.tabs.replaceChildren(
      ...state.platforms.map((p) => el('button', {
        type: 'button', class: 'p-tab', role: 'radio', id: `tab-${p.id}`,
        'aria-checked': String(p.id === state.platform), tabindex: p.id === state.platform ? '0' : '-1',
        text: p.name, onclick: () => selectPlatform(p.id),
        onkeydown: (e) => {
          const i = state.platforms.findIndex((x) => x.id === state.platform);
          const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
          if (!step) return;
          e.preventDefault();
          const next = state.platforms[(i + step + state.platforms.length) % state.platforms.length];
          selectPlatform(next.id, true);
        },
      })),
    );
  }

  function renderSuggestions() {
    const platform = state.platforms.find((p) => p.id === state.platform);
    const examples = (platform && platform.examples) || [];
    els.suggestions.replaceChildren(
      ...examples.map((text) => el('button', { type: 'button', class: 'sugg-chip', text, onclick: () => { els.question.value = text; updateCounter(); clearInputError(); els.question.focus(); } })),
    );
  }

  function selectPlatform(id, focus = false) {
    if (!state.platforms.some((p) => p.id === id)) return;
    state.platform = id;
    renderTabs();
    renderSuggestions();
    if (focus) $(`tab-${id}`).focus();
  }

  // ---------- input ----------
  function updateCounter() {
    const n = els.question.value.length;
    els.counter.textContent = `${n}/${MAX_QUESTION}`;
    els.counter.classList.toggle('near-limit', n > MAX_QUESTION * 0.9);
  }
  function showInputError(message) {
    els.inputError.textContent = message;
    els.inputError.hidden = false;
    els.question.setAttribute('aria-invalid', 'true');
  }
  function clearInputError() {
    els.inputError.hidden = true;
    els.inputError.textContent = '';
    els.question.removeAttribute('aria-invalid');
  }

  // ---------- screenshot handling ----------
  function showUploadError(message) {
    els.uploadError.textContent = message;
    els.uploadError.hidden = false;
    els.dropzone.classList.add('has-error');
  }
  function clearUploadError() {
    els.uploadError.hidden = true;
    els.uploadError.textContent = '';
    els.dropzone.classList.remove('has-error');
  }

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('That file could not be read as an image. Try a different screenshot.'));
      img.src = url;
    });
  }

  /** Validate, downscale and re-encode a screenshot so uploads stay small and fast. */
  async function prepareImage(file) {
    if (!ALLOWED_TYPES.includes(file.type)) throw new Error('Unsupported file type. Upload a PNG, JPEG or WebP screenshot.');
    if (file.size === 0) throw new Error('That file is empty.');
    if (file.size > MAX_UPLOAD_BYTES) throw new Error(`That image is ${formatBytes(file.size)}. The limit is ${formatBytes(MAX_UPLOAD_BYTES)}.`);

    const previewUrl = URL.createObjectURL(file);
    try {
      const img = await loadImage(previewUrl);
      if (img.naturalWidth < 80 || img.naturalHeight < 80) throw new Error('That image is too small to read. Upload a full screenshot.');

      let scale = Math.min(1, MAX_DIMENSION / Math.max(img.naturalWidth, img.naturalHeight));
      let quality = 0.9;
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff'; // JPEG has no alpha
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        const bytes = Math.round((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75);
        if (bytes <= MAX_SEND_BYTES) return { dataUrl, previewUrl, name: file.name || 'screenshot', bytes };
        scale *= 0.8;
        quality = Math.max(0.6, quality - 0.1);
      }
      throw new Error('That screenshot is too large even after compression. Crop it and try again.');
    } catch (err) {
      URL.revokeObjectURL(previewUrl);
      throw err;
    }
  }

  async function attachFile(file) {
    if (!file) return;
    clearUploadError();
    try {
      const prepared = await prepareImage(file);
      removeImage(true);
      state.image = prepared;
      els.previewImg.src = prepared.previewUrl;
      els.fileName.textContent = prepared.name;
      els.fileMeta.textContent = `${formatBytes(prepared.bytes)} · ready. Add a question above, or send it on its own.`;
      els.dzIdle.hidden = true;
      els.dzFile.hidden = false;
      els.dropzone.classList.add('has-file');
    } catch (err) {
      els.fileInput.value = '';
      showUploadError(err.message);
    }
  }

  function removeImage(silent = false) {
    if (state.image) URL.revokeObjectURL(state.image.previewUrl);
    state.image = null;
    els.fileInput.value = '';
    els.previewImg.removeAttribute('src');
    els.dzFile.hidden = true;
    els.dzIdle.hidden = false;
    els.dropzone.classList.remove('has-file');
    if (!silent) clearUploadError();
  }

  // ---------- result rendering ----------
  function setResult(...nodes) {
    els.result.replaceChildren(...nodes.flat().filter(Boolean));
    els.result.classList.remove('res-in');
    void els.result.offsetWidth; // restart the entrance animation
    els.result.classList.add('res-in');
  }
  const revealResult = () => {
    if (window.matchMedia('(max-width: 900px)').matches) els.result.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  function renderEmpty() {
    setResult(el('div', { class: 'empty' },
      el('span', { class: 'glyph', 'aria-hidden': 'true', text: '⌖' }),
      el('h3', { text: 'Your route will appear here' }),
      el('p', { text: 'Ask where something is, or attach a screenshot of the page you are stuck on.' }),
      el('ul', { class: 'tip-list' },
        el('li', { text: 'Name the course to get a tailored path, e.g. “DBMS attendance”.' }),
        el('li', { text: 'Say “everything related to DBMS” to see every section at once.' }),
        el('li', { text: 'Attach a screenshot and we will skip the steps you have already done.' }),
      ),
    ));
  }

  function renderLoading(withImage) {
    const messages = withImage
      ? ['Reading your screenshot…', 'Working out where you are…', 'Building your route…']
      : ['Understanding your question…', 'Mapping the route…'];
    const msg = el('div', { class: 'load-msg' }, el('span', { class: 'btn-spinner', 'aria-hidden': 'true' }), el('span', { id: 'loadText', text: messages[0] }));
    setResult(el('div', { class: 'loading', role: 'status' },
      msg,
      el('div', { class: 'skel w40' }), el('div', { class: 'skel w80' }), el('div', { class: 'skel w60' }), el('div', { class: 'skel w80' }),
    ));
    let i = 0;
    const timer = setInterval(() => {
      i = Math.min(i + 1, messages.length - 1);
      const node = $('loadText');
      if (node) node.textContent = messages[i]; else clearInterval(timer);
    }, withImage ? 2200 : 1400);
    return () => clearInterval(timer);
  }

  function renderError({ title, message, retryable }) {
    setResult(
      el('div', { class: 'res-head' }, el('span', { class: 'pill error', text: 'Something went wrong' })),
      el('h3', { class: 'res-title', text: title }),
      el('p', { class: 'callout error', text: message }),
      el('div', { class: 'actions' },
        retryable && state.lastRequest ? el('button', { type: 'button', class: 'btn-ghost', text: 'Try again', onclick: () => submit({ retry: true }) }) : null,
        el('button', { type: 'button', class: 'btn-ghost', text: 'Edit my question', onclick: () => els.question.focus() }),
      ),
    );
  }

  function pipelineCell(key, value, sub, cls) {
    return el('li', { class: 'pipe-cell' },
      el('span', { class: 'pipe-key', text: key }),
      el('span', { class: `pipe-val${value ? '' : ' is-empty'} ${cls || ''}`, text: value || 'Not specified' }),
      sub ? el('span', { class: 'pipe-src', text: sub }) : null,
    );
  }

  const SOURCE_TEXT = { selected: 'from your selection', query: 'from your question', screenshot: 'from your screenshot' };
  const METHOD_TEXT = { rules: 'understood directly', ai: 'inferred by AI', 'ai-vision': 'inferred from screenshot', keywords: 'matched known phrases' };

  function renderPipeline(u) {
    return el('ol', { class: 'pipeline', 'aria-label': 'How your question was understood' },
      pipelineCell('Intent', u.intent && u.intent.label, METHOD_TEXT[u.method]),
      pipelineCell('Platform', u.platform && u.platform.name, SOURCE_TEXT[u.platform && u.platform.source]),
      pipelineCell('Target course', u.course, u.course ? 'from your words' : 'add one for a tailored path'),
      pipelineCell('Confidence', u.confidenceLabel ? u.confidenceLabel.charAt(0).toUpperCase() + u.confidenceLabel.slice(1) : '', null, `conf-${u.confidenceLabel}`),
    );
  }

  function renderCrumbs(nodes) {
    return el('ol', { class: 'crumbs', 'aria-label': 'Navigation path' },
      nodes.map((n) => el('li', {
        class: ['crumb', `crumb-${n.kind}`, n.final ? 'final' : '', n.here ? 'here' : '', n.placeholder ? 'placeholder' : ''].filter(Boolean).join(' '),
        'aria-current': n.final ? 'step' : null,
      },
      n.here ? el('span', { class: 'here-tag', text: 'You are here' }) : null,
      el('span', { class: 'crumb-label', text: n.label }))),
    );
  }

  function renderSteps(steps) {
    let counter = 0;
    const lastPending = steps.map((s) => !s.done).lastIndexOf(true);
    return el('ol', { class: 'steps' }, steps.map((s, i) => {
      if (s.done) {
        return el('li', { class: 'step done' }, el('span', { class: 'step-marker', 'aria-hidden': 'true', text: '✓' }),
          el('h4', { text: s.title }), el('p', { text: 'Already done, based on your screenshot.' }));
      }
      counter += 1;
      return el('li', { class: `step${i === lastPending ? ' last' : ''}` },
        el('span', { class: 'step-marker', 'aria-hidden': 'true', text: i === lastPending ? '✓' : String(counter) }),
        el('h4', { text: s.title }), el('p', { text: s.description }));
    }));
  }

  function renderCallouts(data, extra = []) {
    const items = [
      ...(data.notices || []).map((t) => ['info', t]),
      ...extra.map((t) => ['info', t]),
      ...(data.warnings || []).map((t) => ['warn', t]),
    ];
    return items.length ? el('div', { class: 'callouts' }, items.map(([kind, text]) => el('p', { class: `callout ${kind}`, text }))) : null;
  }

  function renderScreen(screen) {
    if (!screen) return null;
    return el('div', { class: 'screen-card' },
      state.image ? el('img', { src: state.image.previewUrl, alt: 'Your screenshot' }) : null,
      el('div', { class: 'screen-body' },
        el('h3', { text: screen.headline }),
        screen.description ? el('p', { text: screen.description }) : null,
        screen.uncertainty ? el('p', { class: 'callout warn', text: `Not sure about: ${screen.uncertainty}` }) : null,
        el('div', { class: 'screen-meta' },
          el('span', { class: `tag conf-${screen.confidenceLabel}`, text: `Screen confidence: ${screen.confidenceLabel}` }),
          screen.platform ? el('span', { class: 'tag', text: `Looks like ${screen.platform}` }) : null,
          ...(screen.visibleMenuItems || []).slice(0, 5).map((t) => el('span', { class: 'tag', text: t })),
        ),
      ),
    );
  }

  function copyButton(text) {
    const btn = el('button', { type: 'button', class: 'btn-ghost', text: 'Copy steps' });
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(text);
        btn.textContent = 'Copied';
      } catch (_) {
        btn.textContent = 'Copy not available';
      }
      setTimeout(() => { btn.textContent = 'Copy steps'; }, 1800);
    });
    return btn;
  }

  const routeAsText = (route) => [
    route.breadcrumb.map((n) => n.label).join(' > '),
    ...route.steps.filter((s) => !s.done).map((s, i) => `${i + 1}. ${s.title}: ${s.description}`),
  ].join('\n');

  function renderRoute(data) {
    const { route } = data;
    setResult(
      el('div', { class: 'res-head' },
        el('span', { class: 'pill ok', text: route.atDestination ? 'You may already be there' : 'Route found' }),
      ),
      renderScreen(data.screen),
      renderPipeline(data.understanding),
      el('h3', { class: 'block-title', text: 'Path' }),
      renderCrumbs(route.breadcrumb),
      el('h3', { class: 'block-title', text: 'Steps' }),
      renderSteps(route.steps),
      renderCallouts(data, route.notes),
      route.derived ? el('p', { class: 'res-sub', text: 'This route is derived from how the platform organises courses, not a feature-specific check.' }) : null,
      el('div', { class: 'actions' }, copyButton(routeAsText(route))),
    );
  }

  function renderSearch(data) {
    const s = data.search;
    setResult(
      el('div', { class: 'res-head' }, el('span', { class: 'pill ok', text: 'Everything for this course' })),
      el('h3', { class: 'res-title', text: `“${s.course}” on ${s.platform.name}` }),
      el('p', { class: 'res-sub', text: `${s.mappedCount} of ${s.totalCount} sections have a verified route. Open a card for the steps.` }),
      renderScreen(data.screen),
      renderPipeline(data.understanding),
      el('h3', { class: 'block-title', text: 'Sections' }),
      el('div', { class: 'search-grid' }, s.groups.map((g) => {
        if (g.status !== 'mapped') {
          return el('div', { class: 's-card unmapped' }, el('div', { class: 's-unmapped' },
            el('h3', { text: g.category }), el('p', { text: `No verified route for ${s.platform.name} yet.` })));
        }
        const r = g.route;
        return el('details', { class: 's-card' },
          el('summary', {},
            el('div', { class: 's-title' }, el('span', { text: g.category }), el('span', { class: 'chev', 'aria-hidden': 'true', text: '›' })),
            el('p', { class: 's-path', text: r.breadcrumb.slice(1).map((n) => n.label).join(' → ') })),
          el('div', { class: 's-body' }, renderCrumbs(r.breadcrumb), el('h3', { class: 'block-title', text: 'Steps' }), renderSteps(r.steps),
            r.notes.length ? el('div', { class: 'callouts' }, r.notes.map((t) => el('p', { class: 'callout info', text: t }))) : null),
        );
      })),
      renderCallouts(data),
    );
  }

  function runOption(opt) {
    if (opt.platform) selectPlatform(opt.platform);
    if (opt.question) { els.question.value = opt.question; updateCounter(); }
    submit();
  }
  const renderOptions = (options) => (options && options.length
    ? el('div', { class: 'options' }, options.map((o) => el('button', { type: 'button', class: 'option-btn', text: o.label, onclick: () => runOption(o) })))
    : null);

  function renderClarify(data) {
    setResult(
      el('div', { class: 'res-head' }, el('span', { class: 'pill info', text: 'Need a bit more' })),
      renderScreen(data.screen),
      el('h3', { class: 'res-title', text: data.message }),
      renderOptions(data.options),
      renderCallouts(data),
    );
  }

  function renderPartial(data) {
    const approx = data.approximateRoute;
    setResult(
      el('div', { class: 'res-head' }, el('span', { class: 'pill warn', text: 'Not mapped yet' })),
      renderScreen(data.screen),
      renderPipeline(data.understanding),
      el('h3', { class: 'res-title', text: data.message }),
      el('p', { class: 'res-sub', text: 'I will not guess a path I have not verified.' }),
      approx ? [
        el('h3', { class: 'block-title', text: 'Closest verified route' }),
        renderCrumbs(approx.breadcrumb),
        el('p', { class: 'callout warn', text: data.approximateNote }),
        renderSteps(approx.steps),
      ] : null,
      renderOptions(data.options),
      renderCallouts(data),
    );
  }

  function render(data) {
    if (data.mode === 'route') renderRoute(data);
    else if (data.mode === 'search') renderSearch(data);
    else if (data.mode === 'partial') renderPartial(data);
    else renderClarify(data);
  }

  // ---------- submit ----------
  function setBusy(busy) {
    state.busy = busy;
    els.submit.disabled = busy;
    els.submit.classList.toggle('is-busy', busy);
    els.submitText.textContent = busy ? 'Working…' : 'Find my way';
    els.result.setAttribute('aria-busy', String(busy));
  }

  function httpProblem(status, data) {
    const fallback = {
      400: ['Check your input', 'The request was not valid. Adjust your question or screenshot and try again.'],
      413: ['Screenshot too large', 'That upload is too large. Use a smaller screenshot.'],
      429: ['Slow down a little', 'Too many requests. Wait a moment and try again.'],
      502: ['The AI reply was unusable', 'Please try again in a moment.'],
      503: ['Service unavailable', 'The service is busy or unavailable. Please try again shortly.'],
      504: ['That took too long', 'The AI did not answer in time. Please try again.'],
    }[status] || ['Something went wrong', 'An unexpected error occurred. Please try again.'];
    const retryable = data && typeof data.retryable === 'boolean' ? data.retryable : status >= 500 || status === 429;
    return { title: fallback[0], message: (data && data.error) || fallback[1], retryable };
  }

  async function submit({ retry = false } = {}) {
    if (state.busy) return;
    clearInputError();

    let payload;
    if (retry && state.lastRequest) {
      payload = state.lastRequest;
    } else {
      const question = els.question.value.trim();
      if (!question && !state.image) {
        showInputError('Describe what you are looking for, or attach a screenshot.');
        els.question.focus();
        return;
      }
      if (question && !/[\p{L}\p{N}]/u.test(question)) {
        showInputError('That does not look like a question. Try something like “DBMS attendance”.');
        els.question.focus();
        return;
      }
      payload = { platform: state.platform, question };
      if (state.image) payload.image = state.image.dataUrl;
    }
    state.lastRequest = payload;

    setBusy(true);
    const stopLoading = renderLoading(Boolean(payload.image));
    revealResult();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch('/api/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      let data = null;
      try { data = await res.json(); } catch (_) { /* non-JSON error page */ }
      stopLoading();

      if (!res.ok || !data || data.status === 'error') {
        renderError(httpProblem(res.status, data));
      } else {
        // Reflect the platform actually used (it may have come from the question or screenshot).
        const used = data.understanding && data.understanding.platform && data.understanding.platform.id;
        if (used && used !== state.platform) selectPlatform(used);
        render(data);
      }
    } catch (err) {
      stopLoading();
      if (err && err.name === 'AbortError') {
        renderError({ title: 'That took too long', message: 'The server did not respond in time. Check your connection and try again.', retryable: true });
      } else if (!navigator.onLine) {
        renderError({ title: 'You appear to be offline', message: 'Reconnect to the internet and try again.', retryable: true });
      } else {
        renderError({ title: 'Could not reach the server', message: 'The ACE-Scholar server is not responding. Make sure it is running, then try again.', retryable: true });
      }
    } finally {
      clearTimeout(timer);
      setBusy(false);
    }
  }

  // ---------- boot ----------
  async function loadPlatforms() {
    try {
      const res = await fetch('/api/platforms', { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!Array.isArray(data.platforms) || !data.platforms.length) throw new Error('empty');
      state.platforms = data.platforms;
      state.aiEnabled = Boolean(data.aiEnabled);
      els.statusText.textContent = state.aiEnabled ? 'AI ready' : 'Text mode';
      els.badge.classList.toggle('is-text', !state.aiEnabled);
      els.badge.title = state.aiEnabled ? '' : 'Screenshot analysis is off on this server (no Gemini key configured).';
      if (!state.aiEnabled) els.uploadSubtitle.textContent = 'Screenshot analysis is off on this server. Your question text will still be used.';
    } catch (_) {
      state.platforms = FALLBACK_PLATFORMS;
      els.statusText.textContent = 'Server unreachable';
      els.badge.classList.add('is-offline');
    }
    if (!state.platforms.some((p) => p.id === state.platform)) state.platform = state.platforms[0].id;
    renderTabs();
    renderSuggestions();
  }

  function wire() {
    els.question.addEventListener('input', () => { updateCounter(); clearInputError(); });
    els.question.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); } });
    els.submit.addEventListener('click', () => submit());
    els.fileInput.addEventListener('change', (e) => attachFile(e.target.files && e.target.files[0]));
    els.removeImage.addEventListener('click', () => removeImage());

    ['dragenter', 'dragover'].forEach((ev) => els.dropzone.addEventListener(ev, (e) => { e.preventDefault(); els.dropzone.classList.add('is-drag'); }));
    ['dragleave', 'drop'].forEach((ev) => els.dropzone.addEventListener(ev, (e) => { e.preventDefault(); els.dropzone.classList.remove('is-drag'); }));
    els.dropzone.addEventListener('drop', (e) => attachFile(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]));
    // Pasting a screenshot from the clipboard works anywhere on the page.
    document.addEventListener('paste', (e) => {
      const file = [...(e.clipboardData ? e.clipboardData.files : [])].find((f) => f.type.startsWith('image/'));
      if (file) attachFile(file);
    });
    // Dropping a file outside the zone should not navigate away from the app.
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => e.preventDefault());

    // Decorative cursor glow + active nav link (unchanged behaviour).
    const glow = $('cursorGlow');
    document.addEventListener('mousemove', (e) => {
      glow.style.setProperty('--mouse-x', `${e.clientX}px`);
      glow.style.setProperty('--mouse-y', `${e.clientY}px`);
    });
    const sections = [...document.querySelectorAll('section[id]')];
    const links = [...document.querySelectorAll('.nav-links a')];
    window.addEventListener('scroll', () => {
      let current = '';
      sections.forEach((s) => { if (window.scrollY >= s.offsetTop - 120) current = s.id; });
      links.forEach((l) => l.classList.toggle('active', l.getAttribute('href') === `#${current}`));
    }, { passive: true });
  }

  wire();
  updateCounter();
  renderEmpty();
  loadPlatforms();
})();
