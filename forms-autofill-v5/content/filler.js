// Writes approved answers into the form. Never clicks Next or Submit.
globalThis.FormsFiller = (() => {
  const S = globalThis.FormsSelectors;
  const R = globalThis.FormsReader;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const norm = globalThis.FormsMatcher.norm;

  const visible = el => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);

  function press(el) {
    for (const type of ['mousedown', 'mouseup', 'click']) {
      el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
    }
  }

  function setValue(input, value) {
    const proto = input instanceof HTMLSelectElement ? HTMLSelectElement.prototype
      : input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    input.focus();
    setter.call(input, value);   // the native setter, so React/Vue-style frameworks notice the change
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.blur();
  }

  function textInput(q) {
    if (q.type === 'paragraph') return q.block.querySelector('textarea');
    return [...q.block.querySelectorAll(S.textInputs)].find(i => i.type !== 'hidden' && visible(i));
  }

  // Reads existing input locally only to avoid overwriting; nothing is stored or sent.
  function isAnswered(q) {
    if (q.type === 'short_answer' || q.type === 'paragraph') return !!textInput(q)?.value.trim();
    if (q.type === 'date') return !!q.block.querySelector(S.dateInput)?.value;
    if (q.type === 'multiple_choice' || q.type === 'checkboxes') {
      return q.optionEls.some(o => o.el.getAttribute('aria-checked') === 'true');
    }
    if (q.type === 'dropdown') {
      const sel = q.block.querySelector('[role="option"][aria-selected="true"]');
      return !!sel && R.optionText(sel) !== '';
    }
    return false;
  }

  async function fillDropdown(q, target) {
    const lb = q.block.querySelector(S.listbox);
    if (!lb) return { note: 'Dropdown not found' };
    press(lb);
    await sleep(350);
    const pool = [...q.block.querySelectorAll('[role="option"]'), ...document.querySelectorAll('[role="option"]')];
    const matches = pool.filter(o => norm(R.optionText(o)) === norm(target.text));
    const opt = matches.find(visible) || matches[matches.length - 1];
    if (!opt) return { note: `Couldn't find "${target.text}" in the dropdown` };
    press(opt);
    await sleep(250);
    const sel = q.block.querySelector('[role="option"][aria-selected="true"]');
    return sel && norm(R.optionText(sel)) === norm(target.text)
      ? { ok: true, note: 'Filled' }
      : { note: "Clicked, but couldn't confirm the selection — please check" };
  }

  // ---- ordinary websites ----
  function isAnsweredGeneric(q) {
    const c = q.controls;
    if (q.type === 'multiple_choice' || q.type === 'checkboxes') return c.some(x => x.checked);
    if (q.type === 'dropdown') {
      // The browser silently selects the first option; only count it as an answer if it's a real choice.
      const sel = c[0], o = sel.options[sel.selectedIndex];
      return !!o && o.value !== '' && (sel.selectedIndex > 0 || o.defaultSelected);
    }
    return c[0].value.trim() !== '';
  }

  async function fillGeneric(item) {
    const q = item.q;
    if (isAnsweredGeneric(q)) return { skipped: true, note: 'Already answered — left alone' };
    const c = q.controls;

    if (q.type === 'short_answer' || q.type === 'paragraph' || q.type === 'date') {
      setValue(c[0], item.value);
      await sleep(60);
      if (c[0].value === item.value) return { ok: true, note: 'Filled' };
      // Phone/date boxes often reformat what you type; empty means it was really rejected.
      return c[0].value.trim()
        ? { ok: true, note: 'Filled (the site reformatted it, please check)' }
        : { note: 'The site rejected the value — please fill this one yourself' };
    }
    if (q.type === 'dropdown') {
      const opt = item.chosen[0].el;
      setValue(c[0], opt.value);
      await sleep(60);
      return c[0].value === opt.value ? { ok: true, note: 'Filled' } : { note: "Couldn't select it — please check" };
    }
    if (q.type === 'multiple_choice' || q.type === 'checkboxes') {
      for (const ch of item.chosen) {
        if (!ch.el.checked) ch.el.click();
        if (!ch.el.checked) ch.el.labels?.[0]?.click();   // custom-styled controls sometimes need the label
        await sleep(60);
      }
      return item.chosen.every(ch => ch.el.checked) ? { ok: true, note: 'Filled' } : { note: "Clicked, but couldn't confirm — please check" };
    }
    return { skipped: true, note: 'Unsupported type' };
  }

  async function fill(item) {
    const q = item.q;
    if (q.adapter === 'generic') {
      if (!q.block?.isConnected) return { skipped: true, note: 'Page changed — press Rescan' };
      try { return await fillGeneric(item); } catch (err) { return { note: 'Failed: ' + err.message }; }
    }
    if (!q.block?.isConnected) return { skipped: true, note: 'Page changed — press Rescan' };
    try {
      if (isAnswered(q)) return { skipped: true, note: 'Already answered — left alone' };

      if (q.type === 'short_answer' || q.type === 'paragraph') {
        const input = textInput(q);
        if (!input) return { note: 'Input box not found' };
        setValue(input, item.value);
        return input.value === item.value ? { ok: true, note: 'Filled' } : { note: 'Value did not stick — check it' };
      }
      if (q.type === 'date') {
        const input = q.block.querySelector(S.dateInput);
        if (!input) return { note: 'Date box not found' };
        setValue(input, item.value);
        return input.value === item.value ? { ok: true, note: 'Filled' } : { note: 'Value did not stick — check it' };
      }
      if (q.type === 'dropdown') return await fillDropdown(q, item.chosen[0]);

      if (q.type === 'multiple_choice' || q.type === 'checkboxes') {
        for (const c of item.chosen) {
          if (c.el.getAttribute('aria-checked') !== 'true') press(c.el);
          await sleep(80);
        }
        const ok = item.chosen.every(c => c.el.getAttribute('aria-checked') === 'true');
        return ok ? { ok: true, note: 'Filled' } : { note: "Clicked, but couldn't confirm — please check" };
      }
      return { skipped: true, note: 'Unsupported type' };
    } catch (err) {
      return { note: 'Failed: ' + err.message };
    }
  }

  return { fill };
})();
