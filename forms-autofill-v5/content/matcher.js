// Decides which saved answer (if any) belongs to each question. Pure logic, no DOM writes.
globalThis.FormsMatcher = (() => {
  const norm = s => (s || '').toLowerCase().normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

  // Questions that ASK for secrets are never auto-filled (and never sent to the AI). Questions that merely
  // warn against sharing them ("never share a private key") are fine. See safety.js.
  const isSecretQuestion = q => Boolean(q.hasPasswordInput) ||
    globalThis.FormsSafety.asksForSecret(q.label + '. ' + (q.description || ''));
  const UNSUPPORTED = ['file_upload', 'grid', 'time', 'linear_scale', 'unknown', 'checkbox_single'];
  const TEXT = ['short_answer', 'paragraph'];
  const CHOICE = ['multiple_choice', 'dropdown', 'checkboxes'];

  // "Describe…", "Why…", "Tell us…" questions want a write-up. They must never be answered by a short
  // profile field just because they contain a word like "company" or "role".
  const OPEN_ENDED = /^\s*(optional[:\s-]*)?(please\s+)?(describe|explain|tell\s+(us|me)|why\b|how\b|share|what\s+(makes|motivates|inspired|experience)|in\s+\d+\s+words)/i;

  const hasWord = (haystack, needle) => (' ' + haystack + ' ').includes(' ' + needle + ' ');

  function scoreEntry(entry, labelN, descN) {
    const kws = [entry.label, ...String(entry.keywords || '').split(',')]
      .map(s => s.trim()).filter(Boolean);
    let best = 0;
    for (const raw of kws) {
      const exact = raw.startsWith('=');
      const kw = norm(exact ? raw.slice(1) : raw);
      if (!kw) continue;
      if (labelN === kw) { best = Math.max(best, 100); continue; }
      if (exact) continue;
      const strength = kw.split(' ').length * 10 + kw.length;
      if (hasWord(labelN, kw)) best = Math.max(best, strength);
      else if (descN && hasWord(descN, kw)) best = Math.max(best, strength / 2);
    }
    return best;
  }

  function findOption(want, optionEls) {
    const w = norm(want);
    if (!w) return null;
    const exact = optionEls.find(o => norm(o.text) === w) || optionEls.find(o => o.alt && norm(o.alt) === w);
    if (exact) return exact;
    const loose = optionEls.filter(o => {
      const t = norm(o.text);
      return t.length > 1 && (hasWord(t, w) || hasWord(w, t));
    });
    return loose.length === 1 ? loose[0] : null; // ambiguous = don't guess
  }

  function toIsoDate(v) {
    v = v.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    const m = v.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/); // day first
    if (!m) return null;
    return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }

  // Turns a raw answer (from the profile or from the AI) into a fill-ready item, or a "nomatch".
  // The answer is always validated against the real question (options, date format), wherever it came from.
  function buildItem(q, rawIn, entry, extra = {}) {
    const raw = (Array.isArray(rawIn) ? rawIn.join(';') : String(rawIn ?? '')).trim();
    const fail = reason => ({ q, status: 'nomatch', reason });
    const ok = props => ({ q, status: 'ready', entry, ...extra, ...props });

    if (!raw) return fail('No answer');
    if (TEXT.includes(q.type)) {
      const v = raw.slice(0, 2000);
      return ok({ value: v, display: v.length > 80 ? v.slice(0, 77) + '…' : v });
    }
    if (q.type === 'date') {
      const iso = toIsoDate(raw);
      if (!iso) return fail(`"${raw.slice(0, 30)}" isn't a usable date (use 31/12/1999 or 1999-12-31)`);
      return ok({ value: iso, display: iso });
    }
    if (CHOICE.includes(q.type)) {
      const wanted = raw.split(/[;\n]+/).map(s => s.trim()).filter(Boolean);
      const chosen = [];
      for (const w of wanted) {
        const hit = findOption(w, q.optionEls);
        if (hit && !chosen.includes(hit)) chosen.push(hit);
        if (q.type !== 'checkboxes' && chosen.length) break;
      }
      if (!chosen.length) return fail(`"${raw.slice(0, 40)}" isn't one of the options`);
      return ok({ chosen, display: chosen.map(c => c.text).join(', ') });
    }
    return { q, status: 'manual', reason: 'Unsupported question type' };
  }

  function plan(questions, profile) {
    const entries = (profile || []).filter(e => String(e.value || '').trim());
    return questions.map(q => {
      if (UNSUPPORTED.includes(q.type)) {
        return { q, status: 'manual', reason: q.type === 'checkbox_single'
          ? 'Single checkbox (consent / terms / newsletter) — tick it yourself'
          : `${q.type.replace('_', ' ')} — do this one yourself` };
      }
      const labelN = norm(q.label), descN = norm(q.description);
      if (isSecretQuestion(q)) return { q, status: 'blocked', reason: 'Sensitive — type this yourself' };

      let best = null, bestScore = 0;
      for (const e of entries) {
        const s = scoreEntry(e, labelN, descN);
        if (s > bestScore) { best = e; bestScore = s; }
      }
      if (best && bestScore < 100 && (q.type === 'paragraph' || OPEN_ENDED.test(q.label))) best = null;
      if (!best || bestScore < 10) return { q, status: 'nomatch', reason: 'No matching answer in your profile' };
      const item = buildItem(q, best.value, best);
      if (item.status === 'nomatch') item.reason = `"${best.label}": ${item.reason}`;
      return item;
    });
  }

  return { plan, buildItem, norm };
})();
