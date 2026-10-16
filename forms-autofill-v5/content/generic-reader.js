// Reads ordinary HTML forms on any website and returns the same question shape as the Google Forms
// reader, so the matcher, panel and AI work unchanged. Reading only: nothing here changes the page.
globalThis.FormsGeneric = (() => {
  const S = globalThis.FormsSafety;
  const MAX_QUESTIONS = 60;
  const SKIP_TYPES = new Set(['hidden', 'submit', 'button', 'reset', 'image', 'range', 'color', 'search']);
  const SHORT_TYPES = new Set(['text', 'email', 'tel', 'url', 'number', '']);
  const MANUAL_TYPES = new Set(['time', 'datetime-local', 'month', 'week']);

  // The browser's own "autocomplete" attribute says exactly what a field is for. Best hint there is.
  const AUTOCOMPLETE = {
    'given-name': 'first name', 'additional-name': 'middle name', 'family-name': 'last name',
    name: 'full name', email: 'email', tel: 'phone number', 'tel-national': 'phone number',
    bday: 'date of birth', sex: 'gender', 'street-address': 'address', 'address-line1': 'address',
    'address-line2': 'address line 2', 'address-level2': 'city', 'address-level1': 'state',
    'postal-code': 'postal code', country: 'country', 'country-name': 'country',
    organization: 'organization', 'organization-title': 'job title', url: 'website', username: 'username'
  };
  const SECRET_AUTOCOMPLETE = /^(current-password|new-password|one-time-code|cc-.*)$/;
  const TYPE_HINT = { email: 'email', tel: 'phone number', url: 'website' };

  const clean = s => (s || '').replace(/\s+/g, ' ').trim();

  // Text of a node WITHOUT the form controls inside it (a <label> wrapping a <select> would otherwise
  // include every option's text).
  function cleanLabelText(node) {
    const c = node.cloneNode(true);
    c.querySelectorAll('input,select,textarea,button,svg,script,style,[aria-hidden="true"]').forEach(n => n.remove());
    return clean(c.textContent);
  }

  function visible(el) {
    if (!el.isConnected || !el.getClientRects().length) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none';
  }
  // Styled radios/checkboxes often hide the real input behind a visible label. Those still count.
  const controlVisible = el => visible(el) || [...(el.labels || [])].some(visible);

  const idsText = ids => String(ids || '').split(/\s+/).filter(Boolean).map(id => {
    const n = document.getElementById(id);
    return n ? cleanLabelText(n) : '';
  }).filter(Boolean).join(' ');

  // Nearest short piece of text sitting before the control (or before one of its ancestors).
  function nearbyLabel(el) {
    let node = el;
    for (let depth = 0; depth < 4 && node && node !== document.body; depth++) {
      let sib = node.previousElementSibling, hops = 0;
      while (sib && hops < 2) {
        if (!/^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(sib.tagName) && !sib.querySelector('input,select,textarea')) {
          const t = cleanLabelText(sib);
          if (t && t.length <= 150) return t;
        }
        sib = sib.previousElementSibling; hops++;
      }
      node = node.parentElement;
    }
    return '';
  }

  function labelFor(el) {
    let t = [...(el.labels || [])].map(cleanLabelText).filter(Boolean).join(' ');
    if (t) return t;
    t = idsText(el.getAttribute('aria-labelledby')); if (t) return t;
    t = clean(el.getAttribute('aria-label')); if (t) return t;
    t = clean(el.placeholder); if (t) return t;
    t = nearbyLabel(el); if (t) return t;
    return clean(el.title);
  }

  function optionLabel(el) {
    let t = [...(el.labels || [])].map(cleanLabelText).filter(Boolean).join(' ');
    if (t) return t;
    t = clean(el.getAttribute('aria-label')); if (t) return t;
    const n = el.nextSibling;
    if (n) {
      if (n.nodeType === 3) t = clean(n.textContent);
      else if (n.nodeType === 1 && !n.querySelector('input,select,textarea')) t = cleanLabelText(n);
    }
    return t || clean(el.value);
  }

  function groupLabel(first) {
    const lg = first.closest('fieldset')?.querySelector('legend');
    if (lg) { const t = cleanLabelText(lg); if (t) return t; }
    const grp = first.closest('[role="radiogroup"],[role="group"]');
    if (grp) {
      const t = idsText(grp.getAttribute('aria-labelledby')) || clean(grp.getAttribute('aria-label'));
      if (t) return t;
    }
    return nearbyLabel(first.closest('label') || first);
  }

  const prettyName = el => clean((el.name || el.id || '')
    .replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_\-\[\].]+/g, ' ')).toLowerCase();

  function autocompleteOf(el) {
    const tokens = clean(el.getAttribute('autocomplete')).toLowerCase().split(' ');
    return tokens[tokens.length - 1] || '';
  }

  function hintFor(el) {
    const ac = autocompleteOf(el);
    return AUTOCOMPLETE[ac] || TYPE_HINT[(el.type || '').toLowerCase()] || '';
  }

  const stripRequired = s => clean(s.replace(/\(\s*required\s*\)|\*+/gi, ' ')).slice(0, 200);

  function buildQuestion(index, controls, kind) {
    const first = controls[0];
    let label, optionEls = [], type;
    const secretFromName = S.asksForSecret(`${prettyName(first)}. ${clean(first.placeholder)}`);
    const secret = first.type === 'password' || SECRET_AUTOCOMPLETE.test(autocompleteOf(first)) || secretFromName;

    if (kind === 'radio') {
      type = 'multiple_choice';
      label = groupLabel(first);
      optionEls = controls.map(el => ({ el, text: optionLabel(el), alt: clean(el.value) })).filter(o => o.text);
    } else if (kind === 'checkbox_group') {
      type = 'checkboxes';
      label = groupLabel(first);
      optionEls = controls.map(el => ({ el, text: optionLabel(el), alt: clean(el.value) })).filter(o => o.text);
    } else if (kind === 'checkbox_single') {
      type = 'checkbox_single';
      label = optionLabel(first) || labelFor(first);
    } else if (kind === 'select') {
      type = first.multiple ? 'unknown' : 'dropdown';
      label = labelFor(first);
      optionEls = [...first.options]
        .filter(o => o.value !== '' && !o.disabled)
        .map(o => ({ el: o, text: clean(o.textContent), alt: clean(o.value) })).filter(o => o.text);
    } else {
      const t = (first.type || 'text').toLowerCase();
      label = labelFor(first);
      if (first.tagName === 'TEXTAREA') type = 'paragraph';
      else if (t === 'file') type = 'file_upload';
      else if (t === 'date') type = 'date';
      else if (MANUAL_TYPES.has(t)) type = 'time';
      else if (t === 'password' || SHORT_TYPES.has(t)) type = 'short_answer';
      else type = 'unknown';
    }

    const hint = hintFor(first);
    const descParts = [
      idsText(first.getAttribute('aria-describedby')),
      hint,
      kind === 'text' || kind === 'select' ? clean(first.placeholder) : '',
      prettyName(first)
    ].filter(Boolean);
    const description = [...new Set(descParts)].join(' ').slice(0, 200);

    label = stripRequired(label || '') || hint || clean(first.placeholder) || prettyName(first) || 'Untitled field';
    const required = controls.some(el => el.required || el.getAttribute('aria-required') === 'true');

    return {
      index, label, description, required: required, type,
      options: optionEls.map(o => o.text),
      optionEls,
      block: first,            // live DOM reference; also used to check the page hasn't re-rendered
      controls,                // live DOM references. Never stored.
      adapter: 'generic',
      hasPasswordInput: Boolean(secret),
      flagged: ''
    };
  }

  function readForm() {
    const all = [...document.querySelectorAll('input, select, textarea')];
    const done = new Set();
    const questions = [];

    for (const el of all) {
      if (questions.length >= MAX_QUESTIONS) break;
      if (done.has(el) || el.disabled || el.readOnly) continue;
      const t = (el.type || '').toLowerCase();
      if (el.tagName === 'INPUT' && SKIP_TYPES.has(t)) continue;
      if (el.getAttribute('role') === 'searchbox' || el.closest('[role="search"], nav')) continue;

      if (el.tagName === 'INPUT' && (t === 'radio' || t === 'checkbox')) {
        const same = el.name
          ? all.filter(x => x.tagName === 'INPUT' && x.type === t && x.name === el.name && x.form === el.form)
          : [el];
        same.forEach(x => done.add(x));
        const usable = same.filter(x => !x.disabled && controlVisible(x));
        if (!usable.length) continue;
        const kind = t === 'radio' ? 'radio' : usable.length > 1 ? 'checkbox_group' : 'checkbox_single';
        questions.push(buildQuestion(questions.length + 1, usable, kind));
        continue;
      }

      done.add(el);
      if (!visible(el)) continue;
      questions.push(buildQuestion(questions.length + 1, [el], el.tagName === 'SELECT' ? 'select' : 'text'));
    }

    return { title: clean(document.title) || location.hostname, description: '', url: location.href, questions };
  }

  return { readForm };
})();
