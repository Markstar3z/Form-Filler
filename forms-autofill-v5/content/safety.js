// One place that decides "is this text ASKING for a secret?" vs "is it warning you NOT to share one?".
// Splits text into short clauses; a clause that mentions a secret AND contains a negation
// ("never share…", "do not enter…", "no password required") is treated as a warning, not a request.
globalThis.FormsSafety = (() => {
  const SECRET = /\b(passwords?|passphrase|seed phrase|recovery phrase|secret recovery phrase|private key|secret key|cvv|cvc|card number|otp|one[- ]time (code|password)|pin|security code|verification code|bvn|nin|ssn|social security)\b/i;
  const NEGATION = /\b(never|do not|don'?t|dont|does not|doesn'?t|not|no|without|avoid|won'?t|will not|shouldn'?t|should not|cannot|can'?t|neither|nor)\b/i;
  const SPLIT = /[.?!()\[\]\n;:,\u2014\u2013]+|\s-\s/;

  const PAGE_PATTERNS = [
    ['seed phrase', /seed phrase|recovery phrase|secret recovery phrase/i],
    ['private key', /private key|secret key/i],
    ['password', /\bpasswords?\b|passphrase/i],
    ['payment or deposit', /\bpayment\b|\bdeposit\b|send crypto|pay a fee|transfer crypto/i],
    ['wallet connection or signing', /connect your wallet|sign (a |the )?transaction|sign this message/i]
  ];

  const clausesOf = text => String(text || '').split(SPLIT).map(c => c.trim()).filter(Boolean);

  // True if the text asks for a secret (ignores clauses that warn against sharing it).
  function asksForSecret(text) {
    return clausesOf(text).some(c => SECRET.test(c) && !NEGATION.test(c));
  }

  // Names of risky things the page genuinely asks for or involves (warnings against them are ignored).
  function scanText(text) {
    const clauses = clausesOf(text);
    return PAGE_PATTERNS
      .filter(([, re]) => clauses.some(c => re.test(c) && !NEGATION.test(c)))
      .map(([name]) => name);
  }

  return { asksForSecret, scanText };
})();
