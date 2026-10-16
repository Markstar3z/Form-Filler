importScripts('shared/defaults.js', 'shared/ai.js');

chrome.runtime.onInstalled.addListener(async () => {
  const { profile } = await chrome.storage.local.get('profile');
  if (!Array.isArray(profile)) {
    await chrome.storage.local.set({ profile: globalThis.FormsDefaults });
  }
});

// Same file list as manifest.json "content_scripts". Used to run the helper on any site, on demand.
const CONTENT_FILES = [
  'content/selectors.js', 'content/safety.js', 'content/form-reader.js', 'content/generic-reader.js',
  'content/matcher.js', 'content/filler.js', 'content/panel-css.js', 'content/panel.js', 'content/main.js'
];

// Clicking the toolbar icon runs the helper on the current tab ("activeTab": only this tab, only now).
// Nothing runs on other sites until you do this. Google Forms also loads it automatically.
async function toggleOrInject(tab) {
  try {
    if (!tab.id || !/^https?:/i.test(tab.url || '')) throw new Error('unsupported page');
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        if (globalThis.__formsHelper) { globalThis.__formsHelper.toggle(); return 'toggled'; }
        return 'inject';
      }
    });
    if (result === 'inject') {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: CONTENT_FILES });
    }
  } catch (err) {
    // Browser pages (chrome://, the Web Store, PDF viewer) can't be scripted: show a small "×" on the icon.
    chrome.action.setBadgeText({ tabId: tab?.id, text: '×' });
    chrome.action.setBadgeBackgroundColor({ tabId: tab?.id, color: '#b3261e' });
    setTimeout(() => chrome.action.setBadgeText({ tabId: tab?.id, text: '' }), 2500);
  }
}
chrome.action.onClicked.addListener(toggleOrInject);

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !msg) return;

  if (msg.type === 'open-options') { chrome.runtime.openOptionsPage(); return; }

  if (msg.type === 'ai-status') {
    chrome.storage.local.get(FormsAI.FIELDS).then(cfg =>
      sendResponse({ configured: Boolean(cfg.aboutMe && cfg.aboutMe.trim() && FormsAI.hasAnyKey(cfg)) }));
    return true;
  }

  if (msg.type === 'ai-answer') {
    const qs = Array.isArray(msg.questions) ? msg.questions.slice(0, 25) : [];
    FormsAI.answerQuestions(qs)
      .then(r => sendResponse({ ok: true, answers: r.answers, provider: r.provider, tried: r.tried }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (msg.type === 'ai-rewrite') {
    FormsAI.rewriteAnswer(msg)
      .then(r => sendResponse({ ok: true, text: r.text, provider: r.provider, tried: r.tried }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (msg.type === 'ai-test') {
    FormsAI.testAll()
      .then(results => sendResponse({ ok: true, results }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }
});
