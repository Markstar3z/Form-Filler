globalThis.FormsPanel = (() => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let panel, host, pendingNote = '';
  let state = { form: null, plan: [], rows: [], ai: { configured: false, pending: 0 } };
  const unchecked = new Set(); // profile rows you un-ticked (they default to ticked)
  const aiTicked = new Set();
  const edits = new Map();     // text you edited or had rewritten, kept across rescans  // AI rows you ticked (they default to UNticked)

  function h(tag, props = {}, ...kids) {
    const n = Object.assign(document.createElement(tag), props);
    kids.forEach(k => n.append(k));
    return n;
  }

  function ensure() {
    if (panel?.isConnected) return panel;
    // Shadow DOM: the website's CSS can't restyle the panel, and the panel can't leak CSS into the site.
    host = h('div', { id: 'forms-helper-host' });
    const root = host.attachShadow({ mode: 'open' });
    try {
      const sheet = new CSSStyleSheet();   // constructable sheets aren't blocked by strict page CSP
      sheet.replaceSync(':host{all:initial}\n' + globalThis.FormsPanelCSS);
      root.adoptedStyleSheets = [sheet];
    } catch {
      root.append(h('style', { textContent: ':host{all:initial}\n' + globalThis.FormsPanelCSS }));
    }

    const min = h('button', { id: 'fh-min', type: 'button', textContent: '−' });
    min.setAttribute('aria-label', 'Minimize');
    const fill = h('button', { id: 'fh-fill', type: 'button', className: 'fh-primary', textContent: 'Fill selected', disabled: true });
    const ai = h('button', { id: 'fh-ai', type: 'button', textContent: 'Answer the rest with AI', hidden: true });
    const scan = h('button', { id: 'fh-scan', type: 'button', textContent: 'Rescan' });
    const prof = h('button', { id: 'fh-profile', type: 'button', textContent: 'My answers' });
    const risk = h('div', { id: 'fh-risk', hidden: true }); risk.setAttribute('role', 'alert');
    const summary = h('div', { id: 'fh-summary' }); summary.setAttribute('aria-live', 'polite');

    panel = h('section', { id: 'forms-helper-panel' },
      h('header', { id: 'fh-drag' }, h('strong', { textContent: 'Forms Helper' }), min),
      h('div', { id: 'fh-content' },
        h('div', { id: 'fh-status', textContent: 'Reading page…' }),
        risk,
        h('div', { id: 'fh-buttons' }, fill, ai, scan, prof),
        h('div', { id: 'fh-hint', hidden: true }),
        summary,
        h('div', { id: 'fh-list' }),
        h('small', { textContent: 'Fills only what you tick on this page. Never presses Next or Submit.' })));
    root.append(panel);
    document.documentElement.appendChild(host);

    scan.addEventListener('click', () => document.dispatchEvent(new CustomEvent('forms-helper-rescan')));
    ai.addEventListener('click', () => document.dispatchEvent(new CustomEvent('forms-helper-ai')));
    prof.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'open-options' }));
    fill.addEventListener('click', fillSelected);
    min.addEventListener('click', () => {
      panel.classList.toggle('fh-minimized');
      min.textContent = panel.classList.contains('fh-minimized') ? '+' : '−';
    });
    makeDraggable(panel, panel.querySelector('#fh-drag'));
    return panel;
  }

  // Toolbar icon: show/hide the panel.
  function toggle() {
    if (!host?.isConnected) return;
    host.style.display = host.style.display === 'none' ? '' : 'none';
  }

  function makeDraggable(el, handle) {
    let startX = 0, startY = 0, left = 0, top = 0, dragging = false;
    handle.addEventListener('pointerdown', e => {
      if (e.target.closest('button')) return;
      const rect = el.getBoundingClientRect();
      startX = e.clientX; startY = e.clientY; left = rect.left; top = rect.top;
      dragging = true; handle.setPointerCapture(e.pointerId);
    });
    handle.addEventListener('pointermove', e => {
      if (!dragging) return;
      el.style.left = `${Math.max(0, left + e.clientX - startX)}px`;
      el.style.top = `${Math.max(0, top + e.clientY - startY)}px`;
      el.style.right = 'auto';
      el.style.bottom = 'auto';
    });
    handle.addEventListener('pointerup', () => {
      if (!dragging) return;
      dragging = false;
      chrome.storage.local.set({ panelPosition: { left: el.style.left, top: el.style.top } });
    });
  }

  function updateButtons() {
    const fill = panel.querySelector('#fh-fill');
    const n = state.rows.filter(r => r.cb.checked).length;
    fill.textContent = n ? `Fill selected (${n})` : 'Fill selected';
    fill.disabled = n === 0;

    const ai = panel.querySelector('#fh-ai');
    const hint = panel.querySelector('#fh-hint');
    const { configured, pending } = state.ai;
    ai.hidden = !(configured && pending > 0);
    ai.textContent = `Answer the rest with AI (${pending})`;
    hint.hidden = !(!configured && pending > 0);
    hint.textContent = 'Want these answered too? Add an API key and an About me under "My answers".';
  }

  function renderList() {
    const list = panel.querySelector('#fh-list');
    list.replaceChildren();
    state.rows = [];
    if (!state.form.questions.length) {
      list.append(h('div', { className: 'fh-empty', textContent: 'No fillable fields found on this page. (Forms inside embedded frames can\'t be reached.)' }));
      updateButtons();
      return;
    }
    const ready = state.plan.filter(p => p.status === 'ready');
    const rest = state.plan.filter(p => p.status !== 'ready');

    if (ready.length) list.append(h('div', { className: 'fh-h', textContent: 'Ready to fill' }));
    for (const item of ready) {
      const key = item.q.label;
      const cb = h('input', { type: 'checkbox', checked: item.ai ? aiTicked.has(key) : !unchecked.has(key) });
      const note = h('div', { className: 'fh-rownote' });
      cb.addEventListener('change', () => {
        if (item.ai) cb.checked ? aiTicked.add(key) : aiTicked.delete(key);
        else cb.checked ? unchecked.delete(key) : unchecked.add(key);
        updateButtons();
      });
      const q = h('div', { className: 'fh-q', textContent: item.q.label });
      q.addEventListener('click', () => { cb.click(); });
      const body = h('div', { className: 'fh-body' }, q);

      const longText = item.value !== undefined &&
        (item.q.type === 'paragraph' || (item.q.type === 'short_answer' && item.value.length > 80));
      if (longText) {
        // Write-ups: show the WHOLE text, editable, so you can read and fix it before it is filled.
        const ta = h('textarea', { className: 'fh-edit', rows: 6, value: edits.has(key) ? edits.get(key) : item.value });
        item.value = ta.value;
        ta.addEventListener('keydown', e => e.stopPropagation());
        ta.addEventListener('input', () => { edits.set(key, ta.value); item.value = ta.value; });
        const head = h('div', { className: 'fh-a' });
        if (item.ai) head.append(h('span', { className: 'fh-badge', textContent: 'AI draft' }), 'Read and edit before filling');
        else head.append('Edit before filling');
        body.append(head, ta);
        if (item.ai) {
          const instr = h('input', { type: 'text', className: 'fh-instr', placeholder: 'Ask for changes: shorter, more formal, mention my DeSci work…' });
          instr.addEventListener('keydown', e => e.stopPropagation());
          const btn = h('button', { type: 'button', className: 'fh-rewrite', textContent: 'Rewrite' });
          btn.addEventListener('click', async () => {
            btn.disabled = true; note.className = 'fh-rownote fh-skip'; note.textContent = 'Rewriting…';
            try {
              const r = await chrome.runtime.sendMessage({
                type: 'ai-rewrite', question: item.q.label, description: item.q.description || '',
                draft: ta.value, instruction: instr.value
              });
              if (!r?.ok) throw new Error(r?.error || 'No response');
              ta.value = r.text; ta.dispatchEvent(new Event('input'));
              note.textContent = 'Rewritten.' + viaNote(r) + ' Read it again.';
            } catch (err) {
              note.className = 'fh-rownote fh-bad'; note.textContent = 'Rewrite failed: ' + err.message;
            }
            btn.disabled = false;
          });
          body.append(h('div', { className: 'fh-rewrite-row' }, instr, btn));
        }
      } else {
        const answer = h('div', { className: 'fh-a' });
        if (item.ai) answer.append(h('span', { className: 'fh-badge', textContent: 'AI' }));
        answer.append('→ ' + item.display);
        body.append(answer);
      }
      body.append(note);
      list.append(h('div', { className: 'fh-row' }, cb, body));
      state.rows.push({ item, cb, note });
    }
    if (rest.length) list.append(h('div', { className: 'fh-h', textContent: 'Needs you' }));
    for (const item of rest) {
      list.append(h('div', { className: 'fh-row fh-manual' },
        h('div', {},
          h('div', { className: 'fh-q', textContent: item.q.label }),
          h('div', { className: 'fh-a', textContent: item.reason }))));
    }
    updateButtons();
  }

  async function fillSelected() {
    panel.querySelector('#fh-fill').disabled = true;
    let ok = 0, skipped = 0, failed = 0;
    for (const row of state.rows) {
      if (!row.cb.checked) continue;
      const r = await globalThis.FormsFiller.fill(row.item);
      row.note.textContent = r.note;
      row.note.className = 'fh-rownote ' + (r.ok ? 'fh-ok' : r.skipped ? 'fh-skip' : 'fh-bad');
      if (r.ok) ok++; else if (r.skipped) skipped++; else failed++;
      await sleep(150);
    }
    setNote(`Filled ${ok}` + (skipped ? `, left ${skipped} alone` : '') + (failed ? `, ${failed} need a check` : '') +
      '. Review the form, then press Next/Submit yourself.');
    updateButtons();
  }

  // " (via Groq)" or " Used Groq because Gemini failed (free-tier limit reached)."
  function viaNote(r) {
    const failed = (r?.tried || []).map(t => `${t.provider} failed (${t.error})`).join('; ');
    if (failed) return ` Used ${r.provider} because ${failed}.`;
    return r?.provider ? ` (via ${r.provider})` : '';
  }

  function setNote(text, isError = false) {
    pendingNote = text;
    if (!panel?.isConnected) return;
    const s = panel.querySelector('#fh-summary');
    s.textContent = text;
    s.classList.toggle('fh-err', isError);
  }

  function setBusy(busy, text) {
    if (!panel?.isConnected) return;
    const ai = panel.querySelector('#fh-ai');
    ai.disabled = busy;
    if (busy && text) setNote(text);
  }

  async function render(form, risks, plan, ai) {
    const el = ensure();
    const saved = await chrome.storage.local.get('panelPosition');
    if (saved.panelPosition && !el.dataset.positionRestored) {
      el.style.left = saved.panelPosition.left;
      el.style.top = saved.panelPosition.top;
      el.style.right = 'auto';
      el.style.bottom = 'auto';
      el.dataset.positionRestored = '1';
    }
    state = { form, plan, rows: [], ai: ai || state.ai };
    el.querySelector('#fh-status').textContent = `${form.title} · ${form.questions.length} field(s) found`;
    const s = el.querySelector('#fh-summary');
    s.textContent = pendingNote; s.classList.remove('fh-err'); pendingNote = '';
    const risk = el.querySelector('#fh-risk');
    if (risks.length) {
      risk.hidden = false;
      risk.textContent = `Heads up: this page mentions ${risks.join(', ')}. Don't enter secrets or send crypto. ` +
        'Questions that ask for passwords, codes or keys are never filled for you.';
    } else {
      risk.hidden = true;
      risk.textContent = '';
    }
    renderList();
    el.querySelector('#fh-ai').disabled = false;
  }

  return { render, setNote, setBusy, toggle, viaNote };
})();
