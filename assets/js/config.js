/** Ambil subject saat ini dari XML (kalau ada) */
function getXmlSubject() {
  if (!xmlDoc) return '';
  const mc = xmlDoc.querySelector('MessageContent');
  return mc ? (mc.getAttribute('subject') || '') : '';
}

// ---- State & element refs ----
let fileHandle;
let xmlDoc;
let currentDirfileHandle = null;

const saveFileBtn = document.getElementById('saveFileBtn');
const editor = document.getElementById('editor');

const campaignIdInput = document.getElementById('campaignId');
const updateCampaignIdBtn = document.getElementById('updateCampaignIdBtn');

const subjectInput = document.getElementById('subject');
const updateSubjectBtn = document.getElementById('updateSubjectBtn');

const linkInput = document.getElementById('link');
const updateLinkBtn = document.getElementById('updateLinkBtn');

const campaignCountIndicator = document.getElementById('campaignCountIndicator');

const folderOpenBtn = document.getElementById('folderOpenBtn');
const fileListRoot = document.getElementById('fileList');

// NEW: opened file bar element (create if missing)
// let openedFileBar = document.getElementById('openedFileBar');
// if (!openedFileBar) {
//   openedFileBar = document.createElement('div');
//   // openedFileBar.id = 'openedFileBar';
//   openedFileBar.innerHTML = `<i class="fa-solid fa-file-lines" aria-hidden="true"></i><span>No file opened</span>`;
//   const sidebar = document.getElementById('sidebar');
//   if (sidebar) sidebar.appendChild(openedFileBar);
// }

/* Util: label tombol dengan ikon FA */
function setFolderBtn(label, danger = false) {
  folderOpenBtn.innerHTML = `<i class="fa-solid fa-folder-open" aria-hidden="true"></i> ${label}`;
  folderOpenBtn.style.backgroundColor = danger ? '#ff6b6b' : '';
}

/* Status icons (FA) */
function setStatusIcon(id, status) {
  const el = document.getElementById(id);
  if (!el) return;
  let icon = el.querySelector('i');
  if (!icon) {
    icon = document.createElement('i');
    icon.setAttribute('aria-hidden', 'true');
    el.appendChild(icon);
  }
  icon.className = (status === 'error')
    ? 'fa-solid fa-circle-xmark'
    : 'fa-solid fa-circle-check';
  el.style.display = 'inline';
}
function clearStatusIcon(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}

/* Campaign vs Link validator (4-digit prefer, then 3-digit) */
function extractDigitsFromCampaignId(id) {
  if (!id) return null;
  let m = id.match(/_(\d{4})$/);
  if (m) return m[1];
  m = id.match(/_(\d{3})$/);
  return m ? m[1] : null;
}
function extractDigitsFromLink(urlStr) {
  if (!urlStr) return null;
  let lastSeg = '';
  try {
    const u = new URL(urlStr);
    const parts = u.pathname.split('/').filter(Boolean);
    lastSeg = parts[parts.length - 1] || '';
  } catch {
    const parts = urlStr.split('/').filter(Boolean);
    lastSeg = parts[parts.length - 1] || '';
  }
  let m = lastSeg.match(/^(\d{4})(?=\W|_|-)/);
  if (m) return m[1];
  m = lastSeg.match(/^(\d{3})(?=\W|_|-)/);
  return m ? m[1] : null;
}
function validateCampaignLinkPair(campaignId, link) {
  const cid = extractDigitsFromCampaignId(campaignId);
  const lnk = extractDigitsFromLink(link);
  if (!campaignId || !link) return { ok: true, expected: cid, found: lnk };
  if (!cid || !lnk) return { ok: false, expected: cid || '(3–4 digit)', found: lnk || '(?)' };
  return { ok: cid === lnk, expected: cid, found: lnk };
}

/* Sidebar state */
function markFileListNeedsReopen() {
  fileListRoot.classList.add('needs-reopen');
  fileListRoot.innerHTML = '';
  const placeholder = document.createElement('div');
  placeholder.className = 'filelist-placeholder';
  placeholder.textContent = 'Folder permission berakhir. Klik "Reopen Folder" untuk memuat ulang.';
  fileListRoot.appendChild(placeholder);
  setFolderBtn('Reopen Folder', true);
}
function clearFileListDisabled() {
  const ph = document.querySelector('.filelist-placeholder');
  if (ph) ph.remove();
  fileListRoot.classList.remove('needs-reopen');
  setFolderBtn('Open Folder');
}

/* ============================
   KRHRED normalizer (toleran)
   ============================

   - Mendeteksi:
     krhred_XX, krhred-unit-XX, <krhred_XX>, <%[KRHRED_Unit_XX]|>, dst.
   - Mengoreksi OCR-like: O→0, l/I→1
   - Melengkapi bagian yang kurang → <%[KRHRED_Unit_XX]|%>
*/
const KRHRED_FAST_RE = /<?%?\s*\[?\s*KRHRED(?:_Unit)?[_\s-]*([0-9oOlLiI]{1,2})\s*\]?\s*\|?\s*%?>?/gi;

function normalizeKrhredTokens(text) {
  if (!text) return { text, missingDetected: false };
  if (!/krhred/i.test(text)) return { text, missingDetected: false };

  const toDigits2 = (raw) => {
    if (!raw) return null;
    const d = String(raw)
      .replace(/[oO]/g, '0')
      .replace(/[lI]/g, '1')
      .replace(/\D/g, '');
    return d ? d.padStart(2, '0').slice(-2) : null;
  };

  // Invalid jika ada "KRHRED" tanpa angka
  let missingDetected = /\bKRHRED\b(?![_\s-]*[0-9oOlLiI]{1,2})/i.test(text);

  // Ganti semua variasi menjadi format final
  const replaced = text.replace(KRHRED_FAST_RE, (m, num) => {
    const d2 = toDigits2(num) || '00';
    return `<%[KRHRED_Unit_${d2}]|%>`;
  });

  // Lengkapi jadi format persis <%[KRHRED_Unit_XX]|%>
  const completed = replaced
    .replace(/<\s*KRHRED_Unit_(\d{2})\s*>/gi, '<%[KRHRED_Unit_$1]|%>')       // <KRHRED_Unit_39>
    .replace(/<%\s*\[?\s*KRHRED_Unit_(\d{2})\]?\s*\|?\s*%?>?/gi, '<%[KRHRED_Unit_$1]|%>'); // variasi kurang/salah

  return { text: completed, missingDetected };
}

/* CLEAR / RESET */
function clearAllUI(opts = { clearStorage: false }) {
  xmlDoc = null; filefileHandle = null;
  [campaignIdInput, subjectInput, linkInput].forEach(inp => {
    inp.value = '';
    inp.classList.remove('error');
    inp.style.borderColor = '';
  });
  updateCampaignCountIndicator('');
  const cc1 = document.getElementById('campaignIdCharCount'); if (cc1) cc1.textContent = '(0)';
  const cc2 = document.getElementById('subjectCharCount'); if (cc2) cc2.textContent = '(0)';
  ['campaignIdCheckmark','subjectCheckmark','linkCheckmark'].forEach(clearStatusIcon);
  const mw = document.getElementById('mismatchWarning'); if (mw) mw.style.display = 'none';
  editor.textContent = ''; saveFileBtn.style.borderColor = ''; saveFileBtn.style.backgroundColor = '';
  updateSubjectBtn.disabled = true;
  if (opts.clearStorage) localStorage.removeItem('config_state');
}

/* Save / Load XML */
saveFileBtn.addEventListener('click', async () => {
  if (!fileHandle) { alert("No file opened yet."); return; }
  if (!editor.textContent.trim()) { alert("Editor is empty, cannot save."); return; }

  saveFileBtn.disabled = true;
  const originalText = saveFileBtn.textContent; saveFileBtn.textContent = 'Saving...';

  const parser = new DOMParser();
  const parsedDoc = parser.parseFromString(editor.textContent, "application/xml");
  if (parsedDoc.getElementsByTagName('parsererror').length) {
    alert('Error parsing XML before saving');
    saveFileBtn.disabled = false; saveFileBtn.textContent = originalText;
    return;
  }
  xmlDoc = parsedDoc;

  try {
    const writable = await fileHandle.createWritable();
    await writable.write(editor.textContent);
    await writable.close();
    saveFileBtn.style.borderColor = 'green'; saveFileBtn.style.backgroundColor = '#e6ffe6';
  } catch (err) {
    alert("Error saving file: " + err.message);
  } finally {
    saveFileBtn.disabled = false; saveFileBtn.textContent = originalText;
  }
});

[campaignIdInput, subjectInput, linkInput].forEach(inp => {
  inp.addEventListener('input', () => {
    saveFileBtn.style.borderColor = '';
    saveFileBtn.style.backgroundColor = '';
  });
});

/* Live validation CampaignID ↔ Link */
function extractCountByCampaignId(campaignId) {
  if (!xmlDoc || !campaignId || campaignId.trim() === '') return 0;
  let count = 0;
  xmlDoc.querySelectorAll('AudienceModel').forEach(el => { if (el.getAttribute('name') === campaignId) count++; });
  xmlDoc.querySelectorAll('Campaign').forEach(el => { if (el.getAttribute('name') === campaignId) count++; if (el.getAttribute('audience') === campaignId) count++; });
  xmlDoc.querySelectorAll('Interaction').forEach(el => { if (el.getAttribute('name') === campaignId) count++; if (el.getAttribute('message') === campaignId) count++; });
  xmlDoc.querySelectorAll('MessageContent').forEach(el => { if (el.getAttribute('name') === campaignId) count++; });
  xmlDoc.querySelectorAll('FilterValue').forEach(el => { if (el.getAttribute('value') === campaignId) count++; });
  return count;
}
function updateCampaignCountIndicator(campaignId) {
  const n = extractCountByCampaignId(campaignId);
  if (!campaignId || !xmlDoc) {
    campaignCountIndicator.style.backgroundColor = "#ef4444"; // red
    campaignCountIndicator.textContent = "0/7";
    campaignCountIndicator.title = "0/7";
  } else {
    campaignCountIndicator.style.backgroundColor = (n === 7) ? "#22c55e" : "#ef4444"; // green/red
    campaignCountIndicator.textContent = n + "/7";
    campaignCountIndicator.title = n + "/7";
  }
}
function liveValidatePair() {
  const cid = campaignIdInput.value.trim();
  const lnk = linkInput.value.trim();
  const res = validateCampaignLinkPair(cid, lnk);
  const mismatchWarning = document.getElementById('mismatchWarning');

  campaignIdInput.classList.remove('error');
  linkInput.classList.remove('error');
  campaignIdInput.style.borderColor = '';
  linkInput.style.borderColor = '';
  if (mismatchWarning) mismatchWarning.style.display = 'none';

  if (cid && lnk && !res.ok) {
    if (mismatchWarning) mismatchWarning.style.display = 'inline';
    campaignIdInput.classList.add('error');
    linkInput.classList.add('error');
  }
}
campaignIdInput.addEventListener('input', liveValidatePair);
linkInput.addEventListener('input', liveValidatePair);

/* SAFE loader */
function loadXmlFromText(xmlText, { suppressAlert = false } = {}) {
  const raw = (xmlText || '').trim();
  if (!raw) {
    xmlDoc = null; initializeFields(); updateEditor(); gateSubjectButton(); return;
  }
  const parser = new DOMParser();
  const parsed = parser.parseFromString(raw, "application/xml");
  const hasError = parsed.getElementsByTagName('parsererror').length > 0;
  if (hasError) {
    if (!suppressAlert) console.warn('XML parse error on load; UI cleared.');
    xmlDoc = null; initializeFields(); editor.textContent = ''; gateSubjectButton(); return;
  }
  xmlDoc = parsed; initializeFields(); updateEditor(); gateSubjectButton();
}

function initializeFields() {
  if (!xmlDoc) {
    campaignIdInput.value = '';
    subjectInput.value = '';
    linkInput.value = '';
    updateCampaignCountIndicator('');
    return;
  }
  let currentCampaignId = '';
  const audienceModel = xmlDoc.querySelector('AudienceModel');
  if (audienceModel) currentCampaignId = audienceModel.getAttribute('name') || '';
  if (!currentCampaignId) {
    const campaign = xmlDoc.querySelector('Campaign');
    if (campaign) currentCampaignId = campaign.getAttribute('name') || '';
  }
  campaignIdInput.value = currentCampaignId;
  updateCampaignCountIndicator(currentCampaignId);

  const messageContent = xmlDoc.querySelector('MessageContent');
  const subject = messageContent ? messageContent.getAttribute('subject') : '';
  subjectInput.value = subject;

  const messageBody = xmlDoc.querySelector('MessageBody');
  const link = messageBody ? messageBody.getAttribute('content') : '';
  linkInput.value = link;
}

/* Live campaignId input */
campaignIdInput.addEventListener('input', () => {
  updateCampaignCountIndicator(campaignIdInput.value);
  const raw = campaignIdInput.value;
  const hasSpace = /\s/.test(raw);
  const isEmpty  = raw.trim() === '';
  if (hasSpace || isEmpty) campaignIdInput.classList.add('error');
  else campaignIdInput.classList.remove('error');
  clearStatusIcon('campaignIdCheckmark');
});

/* ============================
   SUBJECT gate (no icon by default)
   ============================ */
function gateSubjectButton() {
  const raw = subjectInput.value || '';
  const noXml = !xmlDoc;
  const empty = raw.trim() === '';

  // Jangan tampilkan ikon apapun saat mengetik
  clearStatusIcon('subjectCheckmark');

  // Disable button kalau belum ada XML atau kosong
  updateSubjectBtn.disabled = noXml || empty;
}

subjectInput.addEventListener('input', () => {
  // Sembunyikan ikon ketika user mengubah input
  clearStatusIcon('subjectCheckmark');
  const cc = document.getElementById('subjectCharCount');
  if (cc) cc.textContent = `(${(subjectInput.value || '').length})`;
  gateSubjectButton();
});

/* UPDATE CAMPAIGN ID */
updateCampaignIdBtn.addEventListener('click', () => {
  if (!xmlDoc) return alert("No XML loaded.");
  const val = campaignIdInput.value.trim();
  if (val === '') {
    campaignIdInput.classList.add('error');
    clearStatusIcon('campaignIdCheckmark');
    alert('Campaign ID cannot be empty.');
    return;
  }
  if (/\s/.test(val)) {
    campaignIdInput.classList.add('error');
    alert('Campaign ID must not contain spaces.');
    clearStatusIcon('campaignIdCheckmark');
    return;
  }

  const ln = linkInput.value.trim();
  if (ln) {
    const res = validateCampaignLinkPair(val, ln);
    const mw = document.getElementById('mismatchWarning');
    if (!res.ok) {
      if (mw) mw.style.display = 'inline';
      campaignIdInput.classList.add('error');
      linkInput.classList.add('error');
    } else {
      if (mw) mw.style.display = 'none';
      campaignIdInput.classList.remove('error');
      linkInput.classList.remove('error');
    }
  }

  const audienceModel = xmlDoc.querySelector('AudienceModel');
  if (audienceModel) audienceModel.setAttribute('name', val);
  const filterValue = xmlDoc.querySelector('AudienceModel > Filter > FilterValue');
  if (filterValue) filterValue.setAttribute('value', val);
  const campaign = xmlDoc.querySelector('Campaign');
  if (campaign) { campaign.setAttribute('name', val); campaign.setAttribute('audience', val); }
  const interaction = xmlDoc.querySelector('Interaction');
  if (interaction) { interaction.setAttribute('name', val); interaction.setAttribute('message', val); }
  const messageContent = xmlDoc.querySelector('MessageContent');
  if (messageContent) messageContent.setAttribute('name', val);

  updateEditor();
  const cc = document.getElementById('campaignIdCharCount'); if (cc) cc.textContent = `(${val.length})`;
  updateCampaignCountIndicator(val);
  setStatusIcon('campaignIdCheckmark', 'ok');
});
campaignIdInput.addEventListener('input', () => clearStatusIcon('campaignIdCheckmark'));
linkInput.addEventListener('input', () => clearStatusIcon('linkCheckmark'));

/* ============================
   UPDATE SUBJECT (ikon muncul saat ditekan)
   ============================ */
updateSubjectBtn.addEventListener('click', () => {
  if (!xmlDoc) { alert("No XML loaded."); return; }
  const messageContent = xmlDoc.querySelector('MessageContent');
  if (!messageContent) { alert("MessageContent not found in XML."); return; }

  // Ambil & rapikan input
  let s = (subjectInput.value || '').replace(/\s{2,}/g, ' ').trim();

  // Normalisasi KRHRED
  const result = normalizeKrhredTokens(s);
  const normalized = (result.text || '').trim();
  const missingDetected = result.missingDetected;

  if (missingDetected || normalized === '') {
    // Invalid → X merah, tidak masuk ke XML
    subjectInput.classList.add('error');
    setStatusIcon('subjectCheckmark', 'error');
    updateSubjectBtn.disabled = false; // tetap bisa coba lagi
    return;
  }

  // Valid → commit ke XML & centang hijau
  s = normalized;
  subjectInput.value = s;

  const charCountSpan = document.getElementById('subjectCharCount');
  if (charCountSpan) charCountSpan.textContent = `(${s.length})`;

  messageContent.setAttribute('subject', s);

  subjectInput.classList.remove('error');
  setStatusIcon('subjectCheckmark', 'ok');

  updateEditor();
  updateSubjectBtn.disabled = true; // disable setelah sukses
});

/* UPDATE LINK */
updateLinkBtn.addEventListener('click', () => {
  if (!xmlDoc) return alert("No XML loaded.");
  const messageBody = xmlDoc.querySelector('MessageBody');
  if (!messageBody) return;

  let linkValue = linkInput.value.trim();
  const urlPattern = /^(http:\/\/|https:\/\/).+/i;
  if (!urlPattern.test(linkValue)) {
    alert('Please enter a valid link starting with http:// or https://');
    linkInput.classList.add('error');
    clearStatusIcon('linkCheckmark');
    return;
  }
  if (linkValue.startsWith('https://')) linkValue = 'http://' + linkValue.substring(8);

  const cid = campaignIdInput.value.trim();
  if (cid) {
    const res = validateCampaignLinkPair(cid, linkValue);
    const mw = document.getElementById('mismatchWarning');
    if (!res.ok) {
      if (mw) mw.style.display = 'inline';
      campaignIdInput.classList.add('error');
      linkInput.classList.add('error');
    } else {
      if (mw) mw.style.display = 'none';
      campaignIdInput.classList.remove('error');
      linkInput.classList.remove('error');
    }
  }

  messageBody.setAttribute('content', linkValue);
  setStatusIcon('linkCheckmark', 'ok');
  updateEditor();
});

/* Editor helper */
function updateEditor() {
  if (!xmlDoc) { editor.textContent = ''; return; }
  const serializer = new XMLSerializer();
  let updatedXmlStr = serializer.serializeToString(xmlDoc);
  updatedXmlStr = formatXml(updatedXmlStr);
  editor.textContent = updatedXmlStr;
}

/* Pretty-print XML */
function formatXml(xml) {
  let formatted = '';
  xml = xml.replace(/(>)(<)(\/*)/g, '$1\r\n$2$3');
  let pad = 0;
  xml.split('\r\n').forEach((node) => {
    let indent = 0;
    if (/.+<\/\w[^>]*>$/.test(node)) indent = 0;
    else if (/^<\/\w/.test(node)) { if (pad !== 0) pad -= 1; }
    else if (/^<\w[^>]*[^\/]?>.*$/.test(node)) indent = 1;
    let padding = ''; for (let i = 0; i < pad; i++) padding += '  ';
    formatted += padding + node + '\r\n'; pad += indent;
  });
  return formatted.trim();
}

/* Simple state persistence */
function saveState() {
  const state = {
    campaignId: campaignIdInput.value,
    subject: subjectInput.value,
    link: linkInput.value,
    xmlContent: editor.textContent,
    folderOpened: currentDirHandle !== null
  };
  localStorage.setItem('config_state', JSON.stringify(state));
}
function loadState() {
  const saved = localStorage.getItem('config_state');
  if (!saved) { gateSubjectButton(); decorateButtons(); return; }
  try {
    const state = JSON.parse(saved);
    if (state.xmlContent) loadXmlFromText(state.xmlContent, { suppressAlert: true });
    if (xmlDoc) {
      campaignIdInput.value = state.campaignId || '';
      subjectInput.value = state.subject || '';
      linkInput.value = state.link || '';
      updateCampaignCountIndicator(campaignIdInput.value);
    }
    if (state.folderOpened) markFileListNeedsReopen();
  } catch (e) {
    console.error('Error loading state:', e);
  } finally {
    gateSubjectButton();
    decorateButtons(); // ensure emojis added
  }
}
[campaignIdInput, subjectInput, linkInput].forEach(inp => inp.addEventListener('input', saveState));
window.addEventListener('load', () => { setFolderBtn('Open Folder'); loadState(); });
window.addEventListener('beforeunload', saveState);

/* ============================
   FILE PICKER + TREE (with overlay & opened-file bar)
   ============================ */

/* NEW: Loading overlay helpers */
function ensureOverlay() {
  let overlay = document.getElementById('loadingOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'loadingOverlay';
    overlay.innerHTML = `
      <div class="panel">
        <i class="fa-solid fa-spinner fa-spin"></i>
        <span>Loading folder...</span>
      </div>`;
    document.body.appendChild(overlay);
  }
  return overlay;
}
function showOverlay() { ensureOverlay().style.display = 'flex'; }
function hideOverlay() { const o = ensureOverlay(); o.style.display = 'none'; }

/* Build tree */
folderOpenBtn.addEventListener('click', async () => {
  try {
    showOverlay();
    folderOpenBtn.disabled = true;
    folderOpenBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Opening...`;

    const dirHandle = await window.showDirectoryPicker();
    currentDirHandle = dirHandle;
    fileListRoot.innerHTML = '';

    async function buildTree(dirHandle, parentUl) {
      const entries = [];
      for await (const entry of dirHandle.values()) entries.push(entry);

      const directories = entries
        .filter(e => e.kind === 'directory')
        .sort((a, b) => a.name.localeCompare(b.name));
      const files = entries
        .filter(e => e.kind === 'file')
        .sort((a, b) => a.name.localeCompare(b.name));

      // create UL if parent is #fileList (may be itself)
      const ul = parentUl.tagName === 'UL' ? parentUl : document.createElement('ul');

      for (const entry of directories) {
        const li = document.createElement('li');
        li.classList.add('folder');

        const arrowSpan = document.createElement('span');
        arrowSpan.classList.add('arrow');
        arrowSpan.innerHTML = '<i class="fa-solid fa-chevron-right"></i>';
        li.appendChild(arrowSpan);

        const folderIconSpan = document.createElement('span');
        folderIconSpan.classList.add('folder-icon');
        folderIconSpan.innerHTML = '<i class="fa-solid fa-folder"></i>';
        li.appendChild(folderIconSpan);

        const folderNameSpan = document.createElement('span');
        folderNameSpan.classList.add('folder-name');
        folderNameSpan.textContent = entry.name;
        folderNameSpan.title = entry.name;
        li.appendChild(folderNameSpan);

        const subUl = document.createElement('ul');
        subUl.style.display = 'none';
        li.appendChild(subUl);

        const toggle = async (e) => {
          e.stopPropagation();
          const open = subUl.style.display === 'none';
          subUl.style.display = open ? 'block' : 'none';
          li.classList.toggle('open', open);
          const fIcon = folderIconSpan.querySelector('i');
          if (fIcon) fIcon.className = open ? 'fa-solid fa-folder-open' : 'fa-solid fa-folder';
        };
        arrowSpan.addEventListener('click', toggle);
        folderNameSpan.addEventListener('click', toggle);

        await buildTree(entry, subUl);
        ul.appendChild(li);
      }

      for (const entry of files) {
        const li = document.createElement('li');
        li.classList.add('file');
        li.title = entry.name;

        const fileIconSpan = document.createElement('span');
        fileIconSpan.classList.add('file-icon');
        fileIconSpan.innerHTML = '<i class="fa-solid fa-file-lines"></i>';
        li.appendChild(fileIconSpan);

        const fileNameSpan = document.createElement('span');
        fileNameSpan.classList.add('file-name');
        fileNameSpan.textContent = entry.name;
        li.appendChild(fileNameSpan);

        li.addEventListener('click', async (e) => {
          e.stopPropagation();
          fileHandle = entry;
          const file = await entry.getFile();
          const text = await file.text();

          loadXmlFromText(text, { suppressAlert: true });

          /* Reset mismatch & error */
          const mismatchWarning = document.getElementById('mismatchWarning');
          if (mismatchWarning) mismatchWarning.style.display = 'none';
          campaignIdInput.style.borderColor = '';
          linkInput.style.borderColor = '';
          campaignIdInput.classList.remove('error');
          linkInput.classList.remove('error');
          subjectInput.classList.remove('error');

          ['campaignIdCheckmark','linkCheckmark','subjectCheckmark'].forEach(id => clearStatusIcon(id));

          saveFileBtn.style.borderColor = '';
          saveFileBtn.style.backgroundColor = '';

          // highlight
          fileListRoot.querySelectorAll('li').forEach(sib => sib.classList.remove('selected'));
          li.classList.add('selected');

          // NEW: tampilkan nama file dibawah sidebar
          openedFileBar.innerHTML = `<i class="fa-solid fa-file-lines"></i><span>Opened: ${entry.name}</span>`;

          gateSubjectButton();
          saveState();

          // NEW: auto-scroll editor into view (feel responsive)
          document.getElementById('editor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });

        ul.appendChild(li);
      }

      if (parentUl !== ul) parentUl.appendChild(ul);
    }

    await buildTree(dirHandle, fileListRoot);
    clearFileListDisabled();
  } catch (err) {
    if (err && err.name !== 'AbortError') alert('Error opening folder: ' + err.message);
  } finally {
    folderOpenBtn.disabled = false;
    setFolderBtn('Open Folder');
    hideOverlay();
    saveState();
  }
});

/* ============================
   DECORATION: emojis on buttons (keep FA too)
   ============================ */
function decorateButtons() {
  // Tambah emoji tanpa merusak icon FA jika ada
  const decorate = (btn, emoji) => {
    if (!btn) return;
    // jika belum ada emoji, prepend
    if (!btn.dataset.emojiAdded) {
      const hasIcon = btn.querySelector('i');
      const label = btn.textContent.trim();
      btn.innerHTML = `${hasIcon ? hasIcon.outerHTML + ' ' : ''}${emoji} ${label}`;
      btn.dataset.emojiAdded = '1';
    }
  };
  decorate(updateCampaignIdBtn, '🔢');
  decorate(updateSubjectBtn, '✉️');
  decorate(updateLinkBtn, '🔗');
}

// === Apply Update combo button ===
(function(){
  const applyUpdateBtn = document.getElementById('applyUpdateBtn');
  if (applyUpdateBtn) {
    applyUpdateBtn.addEventListener('click', () => {
      // Call the existing individual updaters to preserve logic
      const a = document.getElementById('updateCampaignIdBtn');
      const b = document.getElementById('updateSubjectBtn');
      const c = document.getElementById('updateLinkBtn');
      if (a) a.click();
      if (b) b.click();
      if (c) c.click();
    });
  }
})();
