// ---- State & element refs ----
let fileHandle;
let xmlDoc;
let currentDirHandle = null;

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
const fileList = fileListRoot.querySelector('ul');

/* =========================
   Font Awesome status icons
   ========================= */
function setStatusIcon(id, status /* 'ok' | 'error' */) {
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

/* =========================
   Helpers: Campaign vs Link
   ========================= */
function getFourDigitsFromCampaign(id) {
  if (!id) return null;
  const m = id.match(/_(\d{4})\s*$/);
  return m ? m[1] : null;
}
function getFourDigitsFromLink(urlStr) {
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
  const m = lastSeg.match(/^(\d{4})-/);
  return m ? m[1] : null;
}
function validateCampaignLinkPair(campaignId, link) {
  const cid4 = getFourDigitsFromCampaign(campaignId);
  const link4 = getFourDigitsFromLink(link);
  if (!campaignId || !link) return { ok: true, expected: cid4, found: link4 };
  if (!cid4 || !link4) return { ok: false, expected: cid4 || '(4-digit)', found: link4 || '(?)' };
  return { ok: cid4 === link4, expected: cid4, found: link4 };
}

/* ---- Sidebar state ---- */
function markFileListNeedsReopen() {
  fileListRoot.classList.add('needs-reopen');
  fileList.innerHTML = '';
  const placeholder = document.createElement('div');
  placeholder.className = 'filelist-placeholder';
  placeholder.textContent = 'Folder permission berakhir. Klik "Reopen Folder" untuk memuat ulang.';
  fileListRoot.appendChild(placeholder);
  folderOpenBtn.textContent = 'Reopen Folder';
  folderOpenBtn.style.backgroundColor = '#ff6b6b';
}
function clearFileListDisabled() {
  const ph = fileListRoot.querySelector('.filelist-placeholder');
  if (ph) ph.remove();
  fileListRoot.classList.remove('needs-reopen');
  folderOpenBtn.textContent = 'Open Folder';
  folderOpenBtn.style.backgroundColor = '';
}

/* ================================
   KRHRED helpers
   ================================ */
/**
 * Menormalisasi semua variasi KRHRED_XX menjadi <%[KRHRED_Unit_XX]|%>
 * dan mendeteksi KRHRED tanpa angka (invalid).
 * Return: { text, missingDetected }
 */
function normalizeKrhredTokens(text) {
  if (!text) return { text, missingDetected: false };

  const toDigits2 = (raw) => {
    if (raw == null || raw === '') return null;
    const s = String(raw);
    const d = s.replace(/[oO]/g,'0').replace(/[lI]/g,'1').replace(/\D/g,'');
    return d ? d.padStart(2,'0').slice(-2) : null;
  };

  let missingDetected = false;

  // Lindungi token yang sudah valid supaya tidak disentuh
  const placeholders = [];
  text = text.replace(
    /<%\s*\[\s*KRHRED(?:_Unit)?[_\s-]*([0-9oOlLiI]{1,2})\s*\]\s*\|\s*%>/gi,
    (m, num) => {
      const canon = `<%[KRHRED_Unit_${toDigits2(num) || '00'}]|%>`;
      const key = `__KRHRED_OK_${placeholders.length}__`;
      placeholders.push([key, canon]);
      return key;
    }
  );

  // Variasi umum → canonical
  text = text.replace(
    /<\s*\[\s*KRHRED(?:_Unit)?[_\s-]*([0-9oOlLiI]{1,2})\s*\]\s*\|\s*>/gi,
    (m, num) => `<%[KRHRED_Unit_${toDigits2(num) || '00'}]|%>`
  );
  text = text.replace(
    /<%\s*\[?\s*KRHRED(?:_Unit)?[_\s-]*([0-9oOlLiI]{1,2})\s*\]?\s*(?:\|\s*)?%>/gi,
    (m, num) => `<%[KRHRED_Unit_${toDigits2(num) || '00'}]|%>`
  );
  text = text.replace(
    /<\s*KRHRED(?:_Unit)?[_\s-]*([0-9oOlLiI]{1,2})\s*>/gi,
    (m, num) => `<%[KRHRED_Unit_${toDigits2(num) || '00'}]|%>`
  );
  text = text.replace(
    /(?<![<\[])\bKRHRED(?:_Unit)?(?:[_\s-]*([0-9oOlLiI]{1,2}))\b(?!\s*[%>\]])/gi,
    (m, num) => `<%[KRHRED_Unit_${toDigits2(num) || '00'}]|%>`
  );

  // KRHRED tanpa angka → tandai invalid (jangan diubah)
  if (/\bKRHRED\b(?![_\s-]*[0-9oOlLiI]{1,2})/i.test(text)) {
    missingDetected = true;
  }

  // Kembalikan placeholder
  for (const [key, canon] of placeholders) {
    text = text.replaceAll(key, canon);
  }

  return { text, missingDetected };
}

/* =========================
   CLEAR / RESET
   ========================= */
function clearAllUI(opts = { clearStorage: false }) {
  xmlDoc = null;
  fileHandle = null;

  [campaignIdInput, subjectInput, linkInput].forEach(inp => {
    inp.value = '';
    inp.classList.remove('error');
    inp.style.borderColor = '';
  });

  updateCampaignCountIndicator('');
  const cc1 = document.getElementById('campaignIdCharCount');
  if (cc1) cc1.textContent = '(0)';
  const cc2 = document.getElementById('subjectCharCount');
  if (cc2) cc2.textContent = '(0)';

  ['campaignIdCheckmark','subjectCheckmark','linkCheckmark'].forEach(clearStatusIcon);
  const mw = document.getElementById('mismatchWarning');
  if (mw) mw.style.display = 'none';

  editor.textContent = '';
  saveFileBtn.style.borderColor = '';
  saveFileBtn.style.backgroundColor = '';

  // pastikan tombol subject dinonaktifkan ketika tidak ada XML
  updateSubjectBtn.disabled = true;

  if (opts.clearStorage) localStorage.removeItem('config_state');
}

/* ---- Save / Load XML ---- */
saveFileBtn.addEventListener('click', async () => {
  if (!fileHandle) { alert("No file opened yet."); return; }
  if (!editor.textContent.trim()) { alert("Editor is empty, cannot save."); return; }

  saveFileBtn.disabled = true;
  const originalText = saveFileBtn.textContent;
  saveFileBtn.textContent = 'Saving...';

  const parser = new DOMParser();
  const parsedDoc = parser.parseFromString(editor.textContent, "application/xml");
  if (parsedDoc.getElementsByTagName('parsererror').length) {
    alert('Error parsing XML before saving');
    saveFileBtn.disabled = false;
    saveFileBtn.textContent = originalText;
    return;
  }
  xmlDoc = parsedDoc;

  try {
    const writable = await fileHandle.createWritable();
    await writable.write(editor.textContent);
    await writable.close();
    saveFileBtn.style.borderColor = 'green';
    saveFileBtn.style.backgroundColor = '#e6ffe6';
  } catch (err) {
    alert("Error saving file: " + err.message);
  } finally {
    saveFileBtn.disabled = false;
    saveFileBtn.textContent = originalText;
  }
});

[campaignIdInput, subjectInput, linkInput].forEach(inp => {
  inp.addEventListener('input', () => {
    saveFileBtn.style.borderColor = '';
    saveFileBtn.style.backgroundColor = '';
  });
});

/* ---- Live validation hubungan CampaignID ↔ Link ---- */
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

/* ---- SAFE loader (silent on empty/invalid) ---- */
function loadXmlFromText(xmlText, { suppressAlert = false } = {}) {
  const raw = (xmlText || '').trim();

  if (!raw) {
    xmlDoc = null;
    initializeFields();
    updateEditor();
    // subject button harus disable bila tidak ada XML
    gateSubjectButton();
    return;
  }

  const parser = new DOMParser();
  const parsed = parser.parseFromString(raw, "application/xml");
  const hasError = parsed.getElementsByTagName('parsererror').length > 0;

  if (hasError) {
    if (!suppressAlert) console.warn('XML parse error on load; UI cleared.');
    xmlDoc = null;
    initializeFields();
    editor.textContent = '';
    gateSubjectButton();
    return;
  }

  xmlDoc = parsed;
  initializeFields();
  updateEditor();
  gateSubjectButton();
}

function updateCampaignCountIndicator(campaignId) {
  if (!xmlDoc || !campaignId || campaignId.trim() === '') {
    campaignCountIndicator.textContent = "0/7";
    campaignCountIndicator.style.color = "red";
    return;
  }
  campaignId = campaignId.trim();
  let count = 0;
  xmlDoc.querySelectorAll('AudienceModel').forEach(el => { if (el.getAttribute('name') === campaignId) count++; });
  xmlDoc.querySelectorAll('Campaign').forEach(el => { if (el.getAttribute('name') === campaignId) count++; if (el.getAttribute('audience') === campaignId) count++; });
  xmlDoc.querySelectorAll('Interaction').forEach(el => { if (el.getAttribute('name') === campaignId) count++; if (el.getAttribute('message') === campaignId) count++; });
  xmlDoc.querySelectorAll('MessageContent').forEach(el => { if (el.getAttribute('name') === campaignId) count++; });
  xmlDoc.querySelectorAll('FilterValue').forEach(el => { if (el.getAttribute('value') === campaignId) count++; });

  campaignCountIndicator.textContent = count + "/7";
  campaignCountIndicator.style.color = (count === 7) ? "green" : "red";
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

/* ---- Live campaignId input ---- */
campaignIdInput.addEventListener('input', () => {
  updateCampaignCountIndicator(campaignIdInput.value);
  const raw = campaignIdInput.value;
  const hasSpace = /\s/.test(raw);
  const isEmpty  = raw.trim() === '';
  if (hasSpace || isEmpty) {
    campaignIdInput.classList.add('error');
  } else {
    campaignIdInput.classList.remove('error');
  }
  clearStatusIcon('campaignIdCheckmark');
});

/* =========================
   SUBJECT GATE (baru)
   ========================= */
/** Mengatur enable/disable tombol Update Subject sesuai aturan KRHRED */
function gateSubjectButton() {
  const raw = subjectInput.value || '';
  const { missingDetected } = normalizeKrhredTokens(raw);
  const noXml = !xmlDoc;
  const empty = raw.trim() === '';

  // Disable jika: tidak ada XML, atau kosong, atau ada KRHRED tanpa angka
  updateSubjectBtn.disabled = noXml || empty || missingDetected;

  // styling
  if (missingDetected) {
    subjectInput.classList.add('error');
    setStatusIcon('subjectCheckmark', 'error');
  } else {
    subjectInput.classList.remove('error');
    clearStatusIcon('subjectCheckmark');
  }
}

subjectInput.addEventListener('input', () => {
  // reset icon ketika user mengetik & evaluasi aturan
  clearStatusIcon('subjectCheckmark');
  gateSubjectButton();
});

/* =========================
   UPDATE CAMPAIGN ID
   ========================= */
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
  if (campaign) {
    campaign.setAttribute('name', val);
    campaign.setAttribute('audience', val);
  }

  const interaction = xmlDoc.querySelector('Interaction');
  if (interaction) {
    interaction.setAttribute('name', val);
    interaction.setAttribute('message', val);
  }

  const messageContent = xmlDoc.querySelector('MessageContent');
  if (messageContent) messageContent.setAttribute('name', val);

  updateEditor();

  const campaignIdCharCountSpan = document.getElementById('campaignIdCharCount');
  if (campaignIdCharCountSpan) campaignIdCharCountSpan.textContent = `(${val.length})`;

  updateCampaignCountIndicator(val);
  setStatusIcon('campaignIdCheckmark', 'ok');
});

/* ---- Clear icons saat mengetik ---- */
campaignIdInput.addEventListener('input', () => clearStatusIcon('campaignIdCheckmark'));
linkInput.addEventListener('input', () => clearStatusIcon('linkCheckmark'));

/* =========================
   UPDATE SUBJECT (KRHRED rules)
   ========================= */
updateSubjectBtn.addEventListener('click', () => {
  if (!xmlDoc) { alert("No XML loaded."); return; }

  const messageContent = xmlDoc.querySelector('MessageContent');
  if (!messageContent) { alert("MessageContent not found in XML."); return; }

  // 1) Normalisasi semua KRHRED_XX → <%[KRHRED_Unit_XX]|%>
  // 2) Jika ada KRHRED tanpa angka → TOLAK (tidak tulis ke XML)
  let s = subjectInput.value.replace(/\s{2,}/g, ' ').trim();
  const { text: normalized, missingDetected } = normalizeKrhredTokens(s);

  // gate: jika ada KRHRED tanpa angka, tombol seharusnya sudah disabled
  if (missingDetected || normalized.trim() === '') {
    subjectInput.classList.add('error');
    setStatusIcon('subjectCheckmark', 'error');
    // Jangan tulis ke XML
    gateSubjectButton(); // pastikan state tombol konsisten
    return;
  }

  // tulis ke input + XML
  s = normalized;
  subjectInput.value = s;

  const charCountSpan = document.getElementById('subjectCharCount');
  if (charCountSpan) charCountSpan.textContent = `(${s.length})`;

  messageContent.setAttribute('subject', s);
  setStatusIcon('subjectCheckmark', 'ok');
  updateEditor();
  gateSubjectButton();
});

/* =========================
   UPDATE LINK
   ========================= */
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

  if (linkValue.startsWith('https://')) {
    linkValue = 'http://' + linkValue.substring(8);
  }

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

/* ---- Editor helper ---- */
function updateEditor() {
  if (!xmlDoc) {
    editor.textContent = '';
    return;
  }
  const serializer = new XMLSerializer();
  let updatedXmlStr = serializer.serializeToString(xmlDoc);
  updatedXmlStr = formatXml(updatedXmlStr);
  editor.textContent = updatedXmlStr;
}

/* ---- Open / Reopen Folder ---- */
folderOpenBtn.addEventListener('click', async () => {
  try {
    clearAllUI({ clearStorage: true });

    const dirHandle = await window.showDirectoryPicker();
    currentDirHandle = dirHandle;
    fileList.innerHTML = '';

    async function buildTree(dirHandle, parentUl) {
      const entries = [];
      for await (const entry of dirHandle.values()) entries.push(entry);

      const directories = entries.filter(e => e.kind === 'directory').sort((a, b) => a.name.localeCompare(b.name));
      const files = entries.filter(e => e.kind === 'file').sort((a, b) => a.name.localeCompare(b.name));

      for (const entry of directories) {
        const li = document.createElement('li');
        li.classList.add('folder');
        li.style.fontWeight = 'normal';

        const arrowSpan = document.createElement('span'); arrowSpan.classList.add('arrow'); li.appendChild(arrowSpan);
        const folderIconSpan = document.createElement('span'); folderIconSpan.classList.add('folder-icon'); li.appendChild(folderIconSpan);
        const folderNameSpan = document.createElement('span'); folderNameSpan.classList.add('folder-name'); folderNameSpan.textContent = entry.name; folderNameSpan.title = entry.name; li.appendChild(folderNameSpan);

        const subUl = document.createElement('ul'); subUl.style.display = 'none'; li.appendChild(subUl);

        const toggle = (e) => { e.stopPropagation(); const open = subUl.style.display === 'none'; subUl.style.display = open ? 'block' : 'none'; li.classList.toggle('open', open); };
        arrowSpan.addEventListener('click', toggle);
        folderNameSpan.addEventListener('click', toggle);

        await buildTree(entry, subUl);
        parentUl.appendChild(li);
      }

      for (const entry of files) {
        const li = document.createElement('li');
        li.classList.add('file');
        li.title = entry.name;

        const fileIconSpan = document.createElement('span'); fileIconSpan.classList.add('file-icon'); fileIconSpan.textContent = "📄"; li.appendChild(fileIconSpan);
        const fileNameSpan = document.createElement('span'); fileNameSpan.classList.add('file-name'); fileNameSpan.textContent = entry.name; li.appendChild(fileNameSpan);

        li.addEventListener('click', async (e) => {
          e.stopPropagation();
          fileHandle = entry;
          const file = await entry.getFile();
          const text = await file.text();

          loadXmlFromText(text, { suppressAlert: true });

          ['campaignIdCheckmark','subjectCheckmark','linkCheckmark'].forEach(id => clearStatusIcon(id));
          const mismatchWarning = document.getElementById('mismatchWarning');
          if (mismatchWarning) mismatchWarning.style.display = 'none';
          campaignIdInput.style.borderColor = '';
          linkInput.style.borderColor = '';
          campaignIdInput.classList.remove('error');
          linkInput.classList.remove('error');
          subjectInput.classList.remove('error');

          saveFileBtn.style.borderColor = '';
          saveFileBtn.style.backgroundColor = '';

          fileList.querySelectorAll('li').forEach(sib => sib.classList.remove('selected'));
          li.classList.add('selected');

          // evaluasi lagi tombol subject setelah file dibuka
          gateSubjectButton();

          saveState();
        });

        parentUl.appendChild(li);
      }
    }

    await buildTree(dirHandle, fileList);
    clearFileListDisabled();
    saveState();
  } catch (err) {
    alert('Error opening folder: ' + err.message);
  }
});

/* ---- Pretty print XML ---- */
function formatXml(xml) {
  let formatted = '';
  xml = xml.replace(/(>)(<)(\/*)/g, '$1\r\n$2$3');
  let pad = 0;
  xml.split('\r\n').forEach((node) => {
    let indent = 0;
    if (/.+<\/\w[^>]*>$/.test(node)) {
      indent = 0;
    } else if (/^<\/\w/.test(node)) {
      if (pad !== 0) pad -= 1;
    } else if (/^<\w[^>]*[^\/]>.*$/.test(node)) {
      indent = 1;
    }
    let padding = '';
    for (let i = 0; i < pad; i++) { padding += '  '; }
    formatted += padding + node + '\r\n';
    pad += indent;
  });
  return formatted.trim();
}

/* ---- Simple state persistence ---- */
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
  if (!saved) { gateSubjectButton(); return; }
  try {
    const state = JSON.parse(saved);

    clearAllUI();

    if (state.xmlContent) {
      loadXmlFromText(state.xmlContent, { suppressAlert: true });
    }

    if (xmlDoc) {
      campaignIdInput.value = state.campaignId || '';
      subjectInput.value = state.subject || '';
      linkInput.value = state.link || '';
      updateCampaignCountIndicator(campaignIdInput.value);
    }

    if (state.folderOpened) { markFileListNeedsReopen(); }
  } catch (e) {
    console.error('Error loading state:', e);
  } finally {
    gateSubjectButton();
  }
}
[campaignIdInput, subjectInput, linkInput].forEach(inp => inp.addEventListener('input', saveState));
window.addEventListener('load', loadState);
window.addEventListener('beforeunload', saveState);
