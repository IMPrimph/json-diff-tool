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

function extractSection(text, startTag, endTag) {
  const regex = new RegExp(`<${startTag}>([\\s\\S]*?)<${endTag}>`, 'g');
  const match = regex.exec(text);
  return match ? match[1].trim() : null;
}

function parseProducts(text) {
  const productsRaw = extractSection(text, 'PRODUCTS_START', 'PRODUCTS_END');
  if (!productsRaw) throw new Error("Products section not found.");
  const productsArray = JSON.parse(productsRaw);
  return productsArray.map(prodStr => JSON.parse(prodStr));
}

function parseFaqs(text) {
  const faqRegex = /<FAQS_START>([\s\S]*?)<FAQS_END>/g;
  let match, allFaqs = [];
  while ((match = faqRegex.exec(text)) !== null) {
    let faqsRaw = match[1].trim();
    if (faqsRaw) {
      let parsedFaqs = JSON.parse(faqsRaw);
      allFaqs.push(...parsedFaqs);
    }
  }
  // Remove duplicates
  const seen = new Set();
  return allFaqs.filter(faq => {
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

// Customer Query Product Parser (NEW)
function parseCustomerQuery() {
  const input = document.getElementById('customerQueryText').value;
  const regex = /Customer is asking about the below product:\s*({[\s\S]*?})<OTHER_CONTENT_START>/;
  const match = input.match(regex);
  if (!match || !match[1]) {
    customerProductEditor.set({ error: "Customer product data not found or malformed." });
    return;
  }
  try {
    const parsedJSON = JSON.parse(match[1]);
    customerProductEditor.set(parsedJSON);
  } catch (e) {
    customerProductEditor.set({ error: "JSON parsing error in customer product data." });
    console.error(e);
  }
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

// Set default section
showSection('products');

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

// On load, set theme from localStorage or system preference
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
