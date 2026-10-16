// Reads the currently visible page of a Google Form. Selectors are centralized in selectors.js.
globalThis.FormsReader = (() => {
  const S = globalThis.FormsSelectors;

  function textOf(el) {
    return (el?.innerText || el?.textContent || '').replace(/\s+/g, ' ').trim();
  }

  // Google puts the readable option text in data-value / aria-label, not always in the text.
  function optionText(el) {
    if (el.hasAttribute('data-value')) {
      const dv = (el.getAttribute('data-value') || '').trim();
      if (dv === '__other_option__') return 'Other';
      return dv; // empty data-value = the dropdown's "Choose" placeholder
    }
    const aria = (el.getAttribute('aria-label') || '').trim();
    return aria || textOf(el);
  }

  function inferType(block) {
    const all = textOf(block);
    if (S.fileUploadText.test(all)) return 'file_upload';
    if (block.querySelector('[role="grid"], table') || block.querySelectorAll(S.radiogroup).length > 1) return 'grid';
    if (block.querySelector(S.radios)) return 'multiple_choice';
    if (block.querySelector(S.checkboxes)) return 'checkboxes';
    if (block.querySelector(S.listbox)) return 'dropdown';

    const inputs = [...block.querySelectorAll('input, textarea')];
    if (inputs.some(x => x.type === 'date')) return 'date';
    if (inputs.some(x => /^(hour|minute)$/i.test(x.getAttribute('aria-label') || ''))) return 'time';
    if (inputs.some(x => x.type === 'time')) return 'time';
    if (/linear scale/i.test(all) || block.querySelector('[role="slider"]')) return 'linear_scale';
    if (inputs.some(x => x.type === 'file')) return 'file_upload';
    if (inputs.some(x => x.tagName === 'TEXTAREA')) return 'paragraph';
    if (inputs.some(x => S.shortTypes.includes(x.type))) return 'short_answer';
    return 'unknown';
  }

  function readQuestion(block, index) {
    const heading = block.querySelector(S.questionTitle);
    const label = textOf(heading) || textOf(block).slice(0, 180);
    const description = textOf(block.querySelector(S.questionDescription));
    const type = inferType(block);
    const required = Boolean(
      block.querySelector(S.requiredMarker) || /\*/.test(heading?.innerText || '')
    );

    const optionEls = [];
    const seen = new Set();
    for (const el of block.querySelectorAll(S.options)) {
      const text = optionText(el);
      if (!text || seen.has(text)) continue;
      seen.add(text);
      optionEls.push({ el, text });
    }

    return {
      index, label, description, required, type,
      options: optionEls.map(o => o.text),
      optionEls,   // live DOM references, used by the filler. Never stored.
      block,       // live DOM reference. Never stored.
      hasPasswordInput: Boolean(block.querySelector('input[type="password"]')),
      flagged: type === 'file_upload' ? 'File upload needs your attention' : ''
    };
  }

  function readForm() {
    const blocks = [...document.querySelectorAll(S.questionBlocks)];
    const questions = blocks
      .map((block, i) => readQuestion(block, i + 1))
      .filter(q => q.label);
    const title = textOf(document.querySelector('[role="heading"]')) ||
      textOf(document.querySelector('title')) || 'Google Form';
    const description = textOf(document.querySelector('.cBGGJ')) || '';
    return { title, description, url: location.href, questions };
  }

  function scanForRisks() {
    // Only text that genuinely asks for / involves risky things; "never share your seed phrase" is a
    // warning, not a risk. (Every Google Form's footer says "Never submit passwords", for example.)
    return globalThis.FormsSafety.scanText(document.body?.innerText || '');
  }

  return { readForm, scanForRisks, optionText, textOf };
})();
