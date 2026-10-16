// Keep Google Forms selectors here so they are easy to update if Google changes its markup.
globalThis.FormsSelectors = {
  questionBlocks: '[role="listitem"]',
  questionTitle: '[role="heading"], .M7eMe',
  questionDescription: '.g2YQtf, .YacQv',
  requiredMarker: '[aria-label*="Required"], [aria-label*="required"]',
  radios: '[role="radio"]',
  radiogroup: '[role="radiogroup"]',
  checkboxes: '[role="checkbox"]',
  listbox: '[role="listbox"]',
  options: '[role="radio"], [role="checkbox"], [role="option"]',
  fileUploadText: /file upload|upload a file/i,
  textInputs: 'input[type="text"], input[type="email"], input[type="tel"], input[type="url"], input[type="number"], input:not([type]), textarea',
  dateInput: 'input[type="date"]',
  shortTypes: ['text', 'email', 'tel', 'url', 'number', '']
};
