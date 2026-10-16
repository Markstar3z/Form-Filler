(() => {
  if (globalThis.__formsHelperLoaded) return;   // never run twice on the same page
  globalThis.__formsHelperLoaded = true;
  globalThis.__formsHelper = { toggle: () => FormsPanel.toggle() };

  let timer, lastSig = '', lastPlan = [], aiConfigured = false;
  const aiCache = new Map(); // in memory only: question -> { answer } (answer may be null = "AI found nothing")

  const isGoogleForm = () => location.hostname === 'docs.google.com' && location.pathname.startsWith('/forms/');

  // Google Forms has its own reader; every other site uses the generic HTML-form reader.
  function readPage() {
    if (isGoogleForm()) return { form: FormsReader.readForm(), risks: FormsReader.scanForRisks() };
    const form = FormsGeneric.readForm();
    const risks = FormsSafety.scanText(form.questions.map(q => q.label + '. ' + q.description).join('\n'));
    return { form, risks };
  }
  const qKey = q => JSON.stringify([q.label, q.type, q.options]);

  async function getProfile() {
    const { profile } = await chrome.storage.local.get('profile');
    return Array.isArray(profile) ? profile : [];
  }

  async function getAiConfigured() {
    try { return Boolean((await chrome.runtime.sendMessage({ type: 'ai-status' }))?.configured); }
    catch { return false; }
  }

  // Changes only when the questions, risks, profile or AI setup change, so the panel isn't rebuilt
  // (and your ticks aren't reset) every time the page's DOM twitches.
  function signature(form, risks, profile, ai) {
    return JSON.stringify([form.title, form.questions.map(q => [q.label, q.type, q.options]), risks, profile, ai]);
  }

  async function logScan(form, risks) {
    if (!isGoogleForm()) return;   // no audit log for other websites
    const cleanUrl = location.origin + location.pathname;   // no query string / hash
    // Local audit log of structure only. Never saves answers or input values.
    const prior = await chrome.storage.local.get('formScanLog');
    const logs = Array.isArray(prior.formScanLog) ? prior.formScanLog : [];
    const record = {
      key: `scan:${cleanUrl}`, title: form.title, url: cleanUrl,
      scannedAt: new Date().toISOString(), questionCount: form.questions.length,
      types: form.questions.reduce((acc, q) => { acc[q.type] = (acc[q.type] || 0) + 1; return acc; }, {}),
      riskFlags: risks
    };
    const i = logs.findIndex(x => x.url === record.url);
    if (i >= 0) logs[i] = record; else logs.unshift(record);
    await chrome.storage.local.set({ formScanLog: logs.slice(0, 100) });
  }

  // Swap "no match" rows for AI answers we already fetched (validated again against the real options).
  function applyAiCache(plan) {
    return plan.map(item => {
      if (item.status !== 'nomatch') return item;
      const hit = aiCache.get(qKey(item.q));
      if (!hit) return item;
      if (hit.answer == null) return { ...item, reason: 'AI found nothing about this in your About me' };
      const built = FormsMatcher.buildItem(item.q, hit.answer, { label: 'AI' }, { ai: true });
      if (built.status === 'nomatch') return { ...item, reason: 'AI answer: ' + built.reason };
      return built;
    });
  }

  function aiCandidates(plan) {
    return plan.filter(p => p.status === 'nomatch' && !aiCache.has(qKey(p.q)));
  }

  function scan(force = false) {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        const { form, risks } = readPage();
        const profile = await getProfile();
        aiConfigured = await getAiConfigured();
        const sig = signature(form, risks, profile, [aiConfigured, aiCache.size]);
        if (!force && sig === lastSig) return;
        lastSig = sig;
        lastPlan = applyAiCache(FormsMatcher.plan(form.questions, profile));
        await FormsPanel.render(form, risks, lastPlan, { configured: aiConfigured, pending: aiCandidates(lastPlan).length });
        await logScan(form, risks);
      } catch (err) {
        // Usually "Extension context invalidated" after reloading the extension: refresh the page.
        console.warn('[Forms Helper]', err.message);
      }
    }, isGoogleForm() ? 250 : 700);   // busier, unknown sites: scan a little less often
  }

  async function askAI() {
    const candidates = aiCandidates(lastPlan);
    if (!candidates.length) return;
    FormsPanel.setBusy(true, 'Asking Gemini…');
    try {
      const questions = candidates.map((p, i) => ({
        id: i + 1,
        question: p.q.label.slice(0, 300),
        description: (p.q.description || '').slice(0, 300),
        type: p.q.type,
        options: p.q.options.slice(0, 40).map(o => o.slice(0, 100))
      }));
      const resp = await chrome.runtime.sendMessage({ type: 'ai-answer', questions });
      if (!resp?.ok) throw new Error(resp?.error || 'No response from the extension');
      let got = 0;
      for (const a of resp.answers) {
        const p = candidates[a.id - 1];
        if (!p) continue;
        aiCache.set(qKey(p.q), { answer: a.answer });
        if (a.answer != null) got++;
      }
      candidates.forEach(p => { if (!aiCache.has(qKey(p.q))) aiCache.set(qKey(p.q), { answer: null }); });
      const via = FormsPanel.viaNote(resp);
      FormsPanel.setNote(got
        ? `AI drafted ${got} answer(s).${via} They are UNTICKED. Read each one, tick the ones you want.`
        : `AI found nothing in your About me for these questions.${via}`);
    } catch (err) {
      FormsPanel.setBusy(false);
      FormsPanel.setNote('AI failed: ' + err.message, true);
      return;
    }
    FormsPanel.setBusy(false);
    scan(true);
  }

  document.addEventListener('forms-helper-rescan', () => scan(true));
  document.addEventListener('forms-helper-ai', askAI);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes.profile || changes.aiKey || changes.aboutMe)) scan(true);
  });

  new MutationObserver(mutations => {
    const host = document.getElementById('forms-helper-host');
    if (host && mutations.every(m => host.contains(m.target))) return; // ignore our own UI
    scan();
  }).observe(document.documentElement, { childList: true, subtree: true });

  scan(true);
})();
