// Initialize editors
const productsEditor = new JSONEditor(document.getElementById('productsContainer'), { mode: 'tree' });
const faqsEditor = new JSONEditor(document.getElementById('faqsContainer'), { mode: 'tree' });
const customerProductEditor = new JSONEditor(document.getElementById('customerProductContainer'), { mode: 'tree' });

// Mode switchers for editors
function setEditorMode(editor, mode) {
  try {
    const current = editor.get();
    editor.setMode(mode);
    editor.set(current);
  } catch (e) {
    // fallback: just set mode
    editor.setMode(mode);
  }
}

document.getElementById('productsModeSelect').addEventListener('change', function() {
  setEditorMode(productsEditor, this.value);
});
document.getElementById('faqsModeSelect').addEventListener('change', function() {
  setEditorMode(faqsEditor, this.value);
});
document.getElementById('customerProductModeSelect').addEventListener('change', function() {
  setEditorMode(customerProductEditor, this.value);
});

// Expand overlay handling
let overlayEditor = null;
let overlaySource = null; // 'products' | 'faqs' | 'customer'
const overlayEl = document.getElementById('expandOverlay');
const overlayTitleEl = document.getElementById('overlayTitle');
const overlayModeSelect = document.getElementById('overlayModeSelect');
const overlayEditorContainer = document.getElementById('overlayEditorContainer');

function openOverlay(source, title) {
  overlaySource = source;
  overlayTitleEl.textContent = title;
  // derive the source editor and mode
  const srcEditor = source === 'products' ? productsEditor : (source === 'faqs' ? faqsEditor : customerProductEditor);
  const currentMode = (() => {
    try { return srcEditor.getMode ? srcEditor.getMode() : 'tree'; } catch (_) { return 'tree'; }
  })();
  overlayModeSelect.value = currentMode;
  // create overlay editor
  if (overlayEditor) {
    try { overlayEditor.destroy(); } catch (_) {}
  }
  overlayEditor = new JSONEditor(overlayEditorContainer, { mode: currentMode });
  try {
    overlayEditor.set(srcEditor.get());
  } catch (e) {
    overlayEditor.set({ error: 'Unable to copy data to overlay.' });
  }
  overlayEl.style.display = '';
}

function closeOverlay(commitBack = false) {
  if (commitBack && overlaySource && overlayEditor) {
    const dst = overlaySource === 'products' ? productsEditor : (overlaySource === 'faqs' ? faqsEditor : customerProductEditor);
    try {
      dst.set(overlayEditor.get());
    } catch (_) {}
  }
  if (overlayEditor) {
    try { overlayEditor.destroy(); } catch (_) {}
    overlayEditor = null;
  }
  overlayEl.style.display = 'none';
}

overlayModeSelect.addEventListener('change', function() {
  if (!overlayEditor) return;
  setEditorMode(overlayEditor, this.value);
});
document.getElementById('overlayCloseBtn').addEventListener('click', function() {
  closeOverlay(false);
});
document.getElementById('expandProductsBtn').addEventListener('click', function() {
  openOverlay('products', 'Products');
});
document.getElementById('expandFaqsBtn').addEventListener('click', function() {
  openOverlay('faqs', 'FAQs');
});
document.getElementById('expandCustomerBtn').addEventListener('click', function() {
  openOverlay('customer', 'Customer Product');
});

function extractSection(text, startTag, endTag) {
  const regex = new RegExp(`<${startTag}>([\\s\\S]*?)<${endTag}>`, 'g');
  const match = regex.exec(text);
  return match ? match[1].trim() : null;
}

// --- Helpers to support multiple product formats (JSON objects or XML-like strings) ---
function textContent(nodeList) {
  if (!nodeList || nodeList.length === 0) return '';
  return nodeList[0].textContent != null ? nodeList[0].textContent.trim() : '';
}

function parseBooleanString(val) {
  if (typeof val !== 'string') return Boolean(val);
  const v = val.trim().toLowerCase();
  if (v === 'true') return true;
  if (v === 'false') return false;
  return Boolean(val);
}

function parseTagsList(str) {
  if (!str) return [];
  const cleaned = str.replaceAll('&gt;', '>').trim();
  return cleaned
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

function parseFaqTextToArray(text) {
  if (!text) return [];
  const t = text.replace(/\s+/g, ' ').trim();
  // Find question marks that likely end a question; questions start with uppercase letter
  const questionRegex = /[A-Z][^.?!\n]{2,}\?/g;
  const hits = [];
  let m;
  while ((m = questionRegex.exec(t)) !== null) {
    hits.push({ index: m.index, q: m[0] });
  }
  if (hits.length === 0) {
    // Fallback: treat entire text as one answer with no question
    return [{ Question: 'FAQ', Answer: t }];
  }
  const faqs = [];
  for (let i = 0; i < hits.length; i++) {
    const q = hits[i];
    const startAns = q.index + q.q.length;
    const end = (i + 1 < hits.length) ? hits[i + 1].index : t.length;
    let ans = t.slice(startAns, end).trim();
    if (ans.startsWith(':')) ans = ans.slice(1).trim();
    faqs.push({ Question: q.q.trim(), Answer: ans });
  }
  return faqs;
}

function parseProductXMLLike(xmlString) {
  const parser = new DOMParser();

  // Try strict XML first
  let doc = parser.parseFromString(xmlString, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    // Try wrapping in a root in case multiple roots or stray text
    const wrapped = `<root>${xmlString}</root>`;
    doc = parser.parseFromString(wrapped, 'application/xml');
  }
  let rootEl = null;
  if (doc.getElementsByTagName('parsererror').length === 0) {
    rootEl = doc.getElementsByTagName('product')[0] || doc.documentElement;
  } else {
    // Last resort: HTML parsing
    const hdoc = parser.parseFromString(xmlString, 'text/html');
    rootEl = hdoc.getElementsByTagName('product')[0] || hdoc.body;
  }

  function elementToObject(el) {
    if (!el) return null;
    const children = Array.from(el.children || []);
    if (children.length === 0) {
      return (el.textContent || '').trim();
    }
    const obj = {};
    children.forEach(child => {
      const key = child.tagName ? child.tagName.toLowerCase() : 'value';
      const val = elementToObject(child);
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        if (!Array.isArray(obj[key])) obj[key] = [obj[key]];
        obj[key].push(val);
      } else {
        obj[key] = val;
      }
    });
    return obj;
  }

  // If the root is <product>, use its children as top-level fields; otherwise, convert whole element
  let productObj;
  if (rootEl && rootEl.tagName && rootEl.tagName.toLowerCase() === 'product') {
    // Build object from the <product> element; unwrap one level so keys are direct children
    const tmp = elementToObject(rootEl);
    productObj = tmp;
  } else {
    productObj = elementToObject(rootEl);
  }

  // Derive FAQs if a product_faq field exists as string
  const faqTextCandidate = typeof productObj?.product_faq === 'string'
    ? productObj.product_faq
    : (typeof productObj?.product_faq_text === 'string' ? productObj.product_faq_text : null);
  if (faqTextCandidate) {
    try {
      productObj.faqs = parseFaqTextToArray(faqTextCandidate);
    } catch (_) {
      // keep going even if heuristic fails
    }
  }

  return productObj;
}

function parseProducts(text) {
  const productsRaw = extractSection(text, 'PRODUCTS_START', 'PRODUCTS_END');
  if (!productsRaw) throw new Error('Products section not found.');
  const parsed = JSON.parse(productsRaw);
  if (!Array.isArray(parsed)) {
    throw new Error('Products payload must be a JSON array.');
  }
  if (parsed.length === 0) return [];

  // Case 1: Array of objects already
  if (typeof parsed[0] === 'object') {
    return parsed;
  }

  // Case 2: Array of strings; each could be a JSON stringified object or XML-like <product>...</product>
  return parsed.map((entry) => {
    if (typeof entry !== 'string') return entry;
    const s = entry.trim();
    // Try JSON object inside string first
    try {
      const maybeObj = JSON.parse(s);
      if (maybeObj && typeof maybeObj === 'object') return maybeObj;
    } catch (_) {}
    // Fallback to XML-like parsing
    if (s.startsWith('<product') || s.includes('<product>')) {
      return parseProductXMLLike(s);
    }
    // As a last resort, return a wrapper
    return { raw: s };
  });
}

function parseFaqs(text) {
  // First try the explicit FAQ blocks if present
  const faqRegex = /<FAQS_START>([\s\S]*?)<FAQS_END>/g;
  let match, allFaqs = [];
  while ((match = faqRegex.exec(text)) !== null) {
    const faqsRaw = match[1].trim();
    if (faqsRaw) {
      try {
        const parsedFaqs = JSON.parse(faqsRaw);
        allFaqs.push(...parsedFaqs);
      } catch (_) {
        // ignore malformed explicit FAQ blocks
      }
    }
  }
  // If we found explicit FAQs, dedupe and return
  if (allFaqs.length > 0) {
    const seen = new Set();
    return allFaqs.filter(faq => {
      if (!faq || !faq.Question) return false;
      if (seen.has(faq.Question)) return false;
      seen.add(faq.Question);
      return true;
    });
  }

  // Otherwise, derive FAQs from product_faq fields inside products
  let products = [];
  try {
    products = parseProducts(text);
  } catch (_) {
    products = [];
  }
  const derivedFaqs = [];
  products.forEach(p => {
    if (Array.isArray(p?.faqs)) {
      derivedFaqs.push(...p.faqs);
    } else if (p && typeof p.product_faq_text === 'string') {
      derivedFaqs.push(...parseFaqTextToArray(p.product_faq_text));
    } else if (typeof p?.product_faq === 'string') {
      derivedFaqs.push(...parseFaqTextToArray(p.product_faq));
    }
  });
  const seen = new Set();
  return derivedFaqs.filter(faq => {
    if (!faq || !faq.Question) return false;
    if (seen.has(faq.Question)) return false;
    seen.add(faq.Question);
    return true;
  });
}

function parseAndDisplay() {
  const inputText = document.getElementById('inputText').value;

  try {
    productsEditor.set(parseProducts(inputText));
  } catch (err) {
    productsEditor.set({ error: err.message });
  }

  try {
    faqsEditor.set(parseFaqs(inputText));
  } catch (err) {
    faqsEditor.set({ error: err.message });
  }
}

// Customer Query Product Parser (updated to support XML-like <product> blocks and legacy JSON)
function parseCustomerQuery() {
  const input = document.getElementById('customerQueryText').value || '';

  // 1) Preferred: find an XML-like <product>...</product> block anywhere in text
  const productBlock = input.match(/<product[\s\S]*?<\/product>/i);
  if (productBlock && productBlock[0]) {
    try {
      const productObj = parseProductXMLLike(productBlock[0]);
      customerProductEditor.set(productObj);
      return;
    } catch (e) {
      // Fall through to other strategies
      console.warn('XML-like product parse failed', e);
    }
  }

  // 2) Legacy: JSON object after the phrase, optionally with or without the word 'the', and optional terminator
  const legacyRegexWithTerminator = /Customer is asking about(?: the)? below product:\s*({[\s\S]*?})\s*<OTHER_CONTENT_START>/i;
  const legacyMatchTerm = input.match(legacyRegexWithTerminator);
  if (legacyMatchTerm && legacyMatchTerm[1]) {
    try {
      const obj = JSON.parse(legacyMatchTerm[1]);
      customerProductEditor.set(obj);
      return;
    } catch (e) {
      console.warn('Legacy JSON with terminator parse failed', e);
    }
  }

  // 3) Legacy without terminator: attempt to JSON-parse from the first '{' after the phrase, using a simple brace counter
  const phraseIdx = input.search(/Customer is asking about(?: the)? below product:/i);
  if (phraseIdx !== -1) {
    const rest = input.slice(phraseIdx);
    const braceStart = rest.indexOf('{');
    if (braceStart !== -1) {
      let i = braceStart;
      let depth = 0;
      let end = -1;
      let inString = false;
      let escape = false;
      while (i < rest.length) {
        const ch = rest[i];
        if (inString) {
          if (escape) {
            escape = false;
          } else if (ch === '\\') {
            escape = true;
          } else if (ch === '"') {
            inString = false;
          }
        } else {
          if (ch === '"') inString = true;
          else if (ch === '{') depth++;
          else if (ch === '}') {
            depth--;
            if (depth === 0) { end = i + 1; break; }
          }
        }
        i++;
      }
      if (end !== -1) {
        const jsonSlice = rest.slice(braceStart, end);
        try {
          const obj = JSON.parse(jsonSlice);
          customerProductEditor.set(obj);
          return;
        } catch (e) {
          console.warn('Legacy JSON without terminator parse failed', e);
        }
      }
    }
  }

  customerProductEditor.set({ error: 'Customer product data not found or could not be parsed.' });
}

// Improved Diff functionality: side-by-side view for original and modified
function showDiff() {
  const original = document.getElementById('originalText').value;
  const modified = document.getElementById('modifiedText').value;

  const originalLines = original.split('\n');
  const modifiedLines = modified.split('\n');
  const maxLines = Math.max(originalLines.length, modifiedLines.length);

  const originalFragment = document.createDocumentFragment();
  const modifiedFragment = document.createDocumentFragment();

  for (let i = 0; i < maxLines; i++) {
    const origLine = originalLines[i] || '';
    const modLine = modifiedLines[i] || '';
    if (origLine === modLine) {
      // Unchanged line
      const spanOrig = document.createElement('span');
      spanOrig.textContent = origLine + '\n';
      originalFragment.appendChild(spanOrig);
      const spanMod = document.createElement('span');
      spanMod.textContent = modLine + '\n';
      modifiedFragment.appendChild(spanMod);
    } else {
      // Word-level diff for this line
      const wordDiff = Diff.diffWords(origLine, modLine);
      // Original side: show removals and unchanged
      wordDiff.forEach((part) => {
        const span = document.createElement('span');
        if (part.removed) {
          span.style.backgroundColor = '#fbb6c2';
        } else if (!part.added) {
          span.style.backgroundColor = 'transparent';
        } else {
          // Added text: don't show on original side
          return;
        }
        span.textContent = part.value;
        originalFragment.appendChild(span);
      });
      originalFragment.appendChild(document.createTextNode('\n'));
      // Modified side: show additions and unchanged
      wordDiff.forEach((part) => {
        const span = document.createElement('span');
        if (part.added) {
          span.style.backgroundColor = '#d4f8d4';
        } else if (!part.removed) {
          span.style.backgroundColor = 'transparent';
        } else {
          // Removed text: don't show on modified side
          return;
        }
        span.textContent = part.value;
        modifiedFragment.appendChild(span);
      });
      modifiedFragment.appendChild(document.createTextNode('\n'));
    }
  }

  document.getElementById('diffOutputOriginal').innerHTML = '';
  document.getElementById('diffOutputOriginal').appendChild(originalFragment);
  document.getElementById('diffOutputModified').innerHTML = '';
  document.getElementById('diffOutputModified').appendChild(modifiedFragment);
}

// Navbar navigation logic
function showSection(section) {
  document.getElementById('section-products').style.display = 'none';
  document.getElementById('section-customer').style.display = 'none';
  document.getElementById('section-diff').style.display = 'none';
  document.getElementById('nav-products').classList.remove('active');
  document.getElementById('nav-customer').classList.remove('active');
  document.getElementById('nav-diff').classList.remove('active');

  if (section === 'products') {
    document.getElementById('section-products').style.display = '';
    document.getElementById('nav-products').classList.add('active');
  } else if (section === 'customer') {
    document.getElementById('section-customer').style.display = '';
    document.getElementById('nav-customer').classList.add('active');
  } else if (section === 'diff') {
    document.getElementById('section-diff').style.display = '';
    document.getElementById('nav-diff').classList.add('active');
  }
}

document.getElementById('nav-products').onclick = function() { showSection('products'); };
document.getElementById('nav-customer').onclick = function() { showSection('customer'); };
document.getElementById('nav-diff').onclick = function() { showSection('diff'); };

// Handle URL parameters for integration
function handleUrlParameters() {
  console.log('handleUrlParameters called');
  console.log('URL:', window.location.href);
  console.log('Hash:', window.location.hash);
  
  const urlParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.slice(1));
  
  // Check both URL params and hash params
  const section = urlParams.get('section') || hashParams.get('section');
  const content = urlParams.get('content') || hashParams.get('content');
  
  console.log('Section:', section);
  console.log('Content length:', content ? content.length : 'null');
  
  if (section && content) {
    const decodedContent = decodeURIComponent(content);
    console.log('Decoded content preview:', decodedContent.substring(0, 100) + '...');
    
    if (section === 'products') {
      showSection('products');
      const inputEl = document.getElementById('inputText');
      if (inputEl) {
        inputEl.value = decodedContent;
        console.log('Content loaded into products textarea');
        // Auto-parse if content is provided
        setTimeout(() => {
          console.log('Auto-parsing products...');
          parseAndDisplay();
        }, 500);
      } else {
        console.error('inputText element not found');
      }
    } else if (section === 'customer') {
      showSection('customer');
      const inputEl = document.getElementById('customerQueryText');
      if (inputEl) {
        inputEl.value = decodedContent;
        console.log('Content loaded into customer textarea');
        // Auto-parse if content is provided
        setTimeout(() => {
          console.log('Auto-parsing customer query...');
          parseCustomerQuery();
        }, 500);
      } else {
        console.error('customerQueryText element not found');
      }
    }
  } else {
    console.log('No section/content found, showing default');
    // Set default section
    showSection('products');
  }
}

// Initialize with URL parameters - ensure DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', handleUrlParameters);
} else {
  handleUrlParameters();
}

// Listen for hash changes to handle navigation
window.addEventListener('hashchange', handleUrlParameters);

// Theme toggle logic
const themeSwitch = document.getElementById('themeSwitch');
const themeLabel = document.getElementById('themeLabel');

function setTheme(dark) {
  if (dark) {
    document.body.classList.add('dark');
    themeLabel.textContent = 'Dark';
    localStorage.setItem('theme', 'dark');
  } else {
    document.body.classList.remove('dark');
    themeLabel.textContent = 'Light';
    localStorage.setItem('theme', 'light');
  }
}

themeSwitch.addEventListener('change', function() {
  setTheme(this.checked);
});

// On load, set theme from localStorage (default to light)
(function() {
  const saved = localStorage.getItem('theme');
  if (saved === 'dark') {
    themeSwitch.checked = true;
    setTheme(true);
  } else {
    themeSwitch.checked = false;
    setTheme(false);
  }
})();
