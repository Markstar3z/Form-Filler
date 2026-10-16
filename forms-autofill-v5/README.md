# Forms Autofill Helper 0.5.0 — works on any website, with AI fallback

Fills web forms from answers you saved once, and (optionally) lets AI write the rest from your "About me". Gemini is tried first; **Groq** and **Cerebras** take over automatically if it fails. **It never presses Next or Submit, never ticks consent boxes, and AI drafts are never ticked for you.**

## Install

1. Unzip `forms-autofill-v5.zip`.
2. Open `chrome://extensions` (Edge: `edge://extensions`), turn on **Developer mode**.
3. Remove any older version, then **Load unpacked** → pick the `forms-autofill-v5` folder.

## Set up (once)

Right-click the extension icon → **Options** (or press **My answers** in the panel):

1. **Quick answers:** fill the table (name, email, phone, gender, country…).
2. **About me:** write freely and specifically about your background, education, experience, skills, goals. For each area you work in add roles, projects, results and numbers; the AI can only write about what's here.
3. **AI keys:** add a key for one, two or all three providers (any combination). Leave each Model box blank to use its default.
   - **Gemini**: free key at aistudio.google.com (default model `gemini-flash-latest`)
   - **Groq**: free key at console.groq.com/keys (default `llama-3.3-70b-versatile`)
   - **Cerebras**: key at cloud.cerebras.ai (default `gpt-oss-120b`). Sources disagree on whether a payment method must be on file before the free tier activates.
4. **Try first** picks which provider goes first (default Gemini).
5. **Test all my keys** tells you which provider works, one by one. Then **Save everything**.

## How the fallback works

The AI button tries your providers in order and uses the first one that works. A provider is skipped if it: errors, is rate-limited (free-tier limits), is down (5xx), rejects the key, can't be reached, takes longer than 30 seconds, blocks the request, or returns an unusable reply (empty, cut off, or not valid JSON).

- **Providers without a key are never contacted.**
- The panel always says who answered, and why a fallback happened, e.g. *"Used Groq because Gemini failed (free-tier limit reached)."*
- If every provider fails you get one message listing each reason.
- "Rewrite" uses the same fallback.

## Use

- **Google Forms:** the panel appears by itself.
- **Any other website:** open the page with the form, then **click the extension icon**. Click it again to hide/show the panel. Nothing runs on a site until you click.

Then:

1. **Ready to fill:** quick answers matched to the page's fields (ticked). Untick any you don't want.
2. **Answer the rest with AI:** drafts the questions your table couldn't answer (e.g. "Describe your relevant experience in…"). Drafts show in full in an editable box, are **unticked**, and each has a **Rewrite** box ("shorter", "more formal"...).
3. **Fill selected**, review the page, then press Next/Submit yourself.

## What it understands on ordinary websites

Text, email, phone, number, date and URL boxes; text areas; dropdowns; radio buttons; checkbox groups. It finds a field's meaning from its label, `aria-label`, fieldset legend, placeholder, nearby text, the browser's `autocomplete` hint, or its name. It handles styled radios/checkboxes whose real input is hidden, and React/Vue-style fields.

**Always left for you ("Needs you"):** passwords, OTP/PIN/card/ID numbers, file uploads, time pickers, grids, and any single checkbox (consent, terms, newsletter). Fields that already contain text are left alone.

## Limits (be aware)

- **Forms inside iframes** (some embedded sign-up forms, payment frames) can't be reached. The panel says "No fillable fields found".
- **Google Forms** is detected from the real Google markup, which Google can change (`content/selectors.js`). Dropdowns there are the most fragile part.
- **Multi-step pages:** the panel rescans as the page changes; press **Rescan** if a new step doesn't appear.
- Sites that heavily reformat fields (phone masks) may change what you typed; the panel then says "please check".

## Privacy

- **No page access until you click the icon** (except Google Forms). The extension asks for only `activeTab` (the tab you click on, at that moment), `scripting`, `storage`, Google Forms, and the Gemini API address.
- Your answers, About me and API key are stored **unencrypted** in this browser profile. Don't store passwords, ID or card numbers.
- Quick answers never leave your browser.
- **The AI button** (only when you press it) sends, to whichever provider answers (Gemini, Groq or Cerebras, whichever you've given a key): your About me, plus for each unanswered question its text, description, type and options. **Not sent:** your quick-answer table, the page URL or title, anything already typed, questions about passwords/codes/IDs. On any website this includes that site's question text.
- **Free-tier catch:** your About me goes to *whichever provider answers*, including a fallback you forgot about. On Google's free Gemini tier, Google may use what you send to improve its products and human reviewers may read it. I could not verify Groq's or Cerebras's data terms, so read them before adding their keys, and only add a key for a provider you're comfortable sending your About me to. Keep your About me to what forms normally ask for.
- No browsing history or page URLs are logged. (Google Forms keeps a local log of form title, origin+path, question counts and risk flags; never answers.)

## Safety design

- Every AI answer is re-checked against the real field: a choice must be an actual option, dates must be valid, text is capped.
- Questions asking for secrets (and real password inputs) are never filled or sent to the AI. A warning like "never share your private key" is not treated as a request.
- A sensitive-page banner is information only; it never disables filling.
- The panel lives in an isolated Shadow DOM so a site's CSS can't break it, and your page's scripts can't read your API key (it's only used by the background script).

## How it was tested

Real Chromium, not guesses: a messy test signup page (placeholder-only and name-only fields, hidden-input radios, hostile page CSS, a React-style controlled input, honeypot field, search box, password/OTP/file/consent fields); the real extension loaded with its service worker, options page and click-to-inject; and a mocked Google Forms page. Fallback was tested with mocked provider servers (rate limits, outages, timeouts, bad keys, garbage replies, all-fail, keyless providers never contacted, primary selection), both in isolation and through the real extension's service worker. **No live call to Gemini, Groq or Cerebras, and no real Google Forms page, could be tested here**, so use "Test all my keys" first. Groq's and Cerebras's current model names and limits change often; if a default model is rejected, type a current one in its Model box.

## Troubleshooting

- "Model not found" → clear that provider's Model box, or type a current model name from its console.
- "Free-tier limit reached" → that provider's fallback takes over; or wait a minute.
- Groq's free tier has a small daily allowance for large models, and Cerebras's free tier is about 5 requests/minute. That's plenty for this, and the reason a fallback exists.
- Panel says "Extension context invalidated" in the console → you reloaded the extension; refresh the page.
- Gemini 2.5 models are scheduled to shut down on 16 Oct 2026; the default `gemini-flash-latest` avoids that.
