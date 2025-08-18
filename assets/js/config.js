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

/* ---- Helpers to control sidebar state (disabled / enabled) ---- */
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
   KRHRED helpers (no notice modal)
   ================================ */
/**
 * Normalize ALL tokens that contain KRHRED + digits into canonical:
 *    <%[KRHRED_Unit_XX]|%>
 * IMPORTANT: Bare "KRHRED" (without digits) is NOT converted.
 * Returns: { text: string, missingDetected: boolean }
 *   - missingDetected = true if any bare "KRHRED" without digits is found.
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
  text = text.replace(
    /(?<![<\[])\bKRHRED\b(?![_\s-]*[0-9oOlLiI]{1,2})(?!\s*[%>\]])/gi,
    (m) => {
      missingDetected = true;
      return m;
    }
  );
  for (const [key, canon] of placeholders) {
    text = text.replaceAll(key, canon);
  }
  return { text, missingDetected };
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

/* ---- Link vs CampaignID live mismatch check ---- */
linkInput.addEventListener('input', () => {
  saveFileBtn.style.borderColor = '';
  saveFileBtn.style.backgroundColor = '';

  const campaignId = campaignIdInput.value.trim();
  const linkValue = linkInput.value.trim();
  const mismatchWarning = document.getElementById('mismatchWarning');
  const saveBtn = saveFileBtn;

  let matchDigits = '';
  let matchDigitsLength = 0;
  const underscoreIndex = campaignId.lastIndexOf('_');
  if (underscoreIndex !== -1) {
    const digitsPart = campaignId.substring(underscoreIndex + 1);
    if (digitsPart.length === 4 || digitsPart.length === 3) {
      matchDigits = digitsPart;
      matchDigitsLength = digitsPart.length;
    }
  }
  if (!matchDigits) { matchDigits = campaignId.slice(-4); matchDigitsLength = 4; }

  let mismatch = false;
  if (campaignId && linkValue) {
    const urlParts = linkValue.split('/');
    const lastPart = urlParts[urlParts.length - 1] || '';
    const regex = new RegExp('^' + matchDigits + '(-|\\.|_|$)');
    if (!regex.test(lastPart)) mismatch = true;
  }

  if (mismatch) {
    campaignIdInput.style.borderColor = 'red';
    linkInput.style.borderColor = 'red';
    mismatchWarning.style.display = 'inline';
    saveBtn.disabled = true;
  } else {
    campaignIdInput.style.borderColor = '';
    linkInput.style.borderColor = '';
    mismatchWarning.style.display = 'none';
    saveBtn.disabled = false;
  }
});

function loadXmlFromText(xmlText) {
  const parser = new DOMParser();
  xmlDoc = parser.parseFromString(xmlText, "application/xml");
  if (xmlDoc.getElementsByTagName('parsererror').length) {
    alert('Error parsing XML');
    xmlDoc = null;
    return;
  }
  initializeFields();
  updateEditor();
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
  // Campaign ID
  let currentCampaignId = '';
  const audienceModel = xmlDoc.querySelector('AudienceModel');
  if (audienceModel) currentCampaignId = audienceModel.getAttribute('name') || '';
  if (!currentCampaignId) {
    const campaign = xmlDoc.querySelector('Campaign');
    if (campaign) currentCampaignId = campaign.getAttribute('name') || '';
  }
  campaignIdInput.value = currentCampaignId;
  updateCampaignCountIndicator(currentCampaignId);

  // Subject
  const messageContent = xmlDoc.querySelector('MessageContent');
  const subject = messageContent ? messageContent.getAttribute('subject') : '';
  subjectInput.value = subject;

  // Link
  const messageBody = xmlDoc.querySelector('MessageBody');
  const link = messageBody ? messageBody.getAttribute('content') : '';
  linkInput.value = link;
}

/* Live validation campaignId (no spaces) + mismatch toggle */
campaignIdInput.addEventListener('input', () => {
  updateCampaignCountIndicator(campaignIdInput.value);
  campaignIdInput.style.borderColor = /\s/.test(campaignIdInput.value) ? 'red' : '';

  const campaignId = campaignIdInput.value.trim();
  const linkValue = linkInput.value.trim();
  const mismatchWarning = document.getElementById('mismatchWarning');
  const saveBtn = saveFileBtn;

  const last4 = campaignId.slice(-4);
  const last3 = campaignId.slice(-3);
  let mismatch = false;
  if (campaignId && linkValue) {
    if (!(linkValue.includes(last4) || linkValue.includes(last3))) mismatch = true;
  }
  if (mismatch) {
    campaignIdInput.style.borderColor = 'red';
    linkInput.style.borderColor = 'red';
    mismatchWarning.style.display = 'inline';
    saveBtn.disabled = true;
  } else {
    mismatchWarning.style.display = 'none';
    saveBtn.disabled = false;
    campaignIdInput.style.borderColor = '';
    linkInput.style.borderColor = '';
  }
  clearStatusIcon('campaignIdCheckmark');
});

/* =========================
   UPDATE CAMPAIGN ID
   ========================= */
updateCampaignIdBtn.addEventListener('click', () => {
  if (!xmlDoc) return alert("No XML loaded.");

  if (/\s/.test(campaignIdInput.value)) {
    campaignIdInput.classList.add('error');
    alert('Campaign ID must not contain spaces.');
    clearStatusIcon('campaignIdCheckmark');
    return;
  }

  saveFileBtn.disabled = false;

  const audienceModel = xmlDoc.querySelector('AudienceModel');
  if (audienceModel) audienceModel.setAttribute('name', campaignIdInput.value);

  const filterValue = xmlDoc.querySelector('AudienceModel > Filter > FilterValue');
  if (filterValue) filterValue.setAttribute('value', campaignIdInput.value);

  const campaign = xmlDoc.querySelector('Campaign');
  if (campaign) {
    campaign.setAttribute('name', campaignIdInput.value);
    campaign.setAttribute('audience', campaignIdInput.value);
  }

  const interaction = xmlDoc.querySelector('Interaction');
  if (interaction) {
    interaction.setAttribute('name', campaignIdInput.value);
    interaction.setAttribute('message', campaignIdInput.value);
  }

  const messageContent = xmlDoc.querySelector('MessageContent');
  if (messageContent) messageContent.setAttribute('name', campaignIdInput.value);

  updateEditor();

  // Char count & status icon
  const campaignIdCharCountSpan = document.getElementById('campaignIdCharCount');
  if (campaignIdCharCountSpan) campaignIdCharCountSpan.textContent = `(${campaignIdInput.value.length})`;

  campaignIdInput.classList.remove('error');
  setStatusIcon('campaignIdCheckmark', 'ok');

  // Clear mismatch styles
  document.getElementById('mismatchWarning').style.display = 'none';
  campaignIdInput.style.borderColor = '';
  linkInput.style.borderColor = '';
});

/* ---- Clear icons saat mengetik ---- */
campaignIdInput.addEventListener('input', () => clearStatusIcon('campaignIdCheckmark'));
subjectInput.addEventListener('input',   () => clearStatusIcon('subjectCheckmark'));
linkInput.addEventListener('input',      () => clearStatusIcon('linkCheckmark'));

/* =========================
   UPDATE SUBJECT (KRHRED)
   ========================= */
updateSubjectBtn.addEventListener('click', () => {
  if (!xmlDoc) return alert("No XML loaded.");

  const messageContent = xmlDoc.querySelector('MessageContent');
  if (!messageContent) return;

  let s = subjectInput.value.replace(/\s{2,}/g, ' ').trim();
  const { text: normalized, missingDetected } = normalizeKrhredTokens(s);
  s = normalized;
  subjectInput.value = s;

  const charCountSpan = document.getElementById('subjectCharCount');
  if (charCountSpan) charCountSpan.textContent = `(${s.length})`;

  if (missingDetected) {
    subjectInput.classList.add('error');
    setStatusIcon('subjectCheckmark', 'error'); // X merah saat invalid
    saveFileBtn.disabled = true;
    return;
  }

  messageContent.setAttribute('subject', s);
  subjectInput.classList.remove('error');
  saveFileBtn.disabled = false;
  updateEditor();
  setStatusIcon('subjectCheckmark', 'ok');      // ceklis saat valid
});

/* =========================
   UPDATE LINK
   ========================= */
updateLinkBtn.addEventListener('click', () => {
  if (!xmlDoc) return alert("No XML loaded.");

  const messageBody = xmlDoc.querySelector('MessageBody');
  if (messageBody) {
    let linkValue = linkInput.value.trim();
    const urlPattern = /^(http:\/\/|https:\/\/).+/i;

    if (!urlPattern.test(linkValue)) {
      alert('Please enter a valid link starting with http:// or https://');
      linkInput.classList.add('error');
      clearStatusIcon('linkCheckmark');
      saveFileBtn.disabled = true;
      return;
    }

    if (linkValue.startsWith('https://')) {
      linkValue = 'http://' + linkValue.substring(8);
    }

    messageBody.setAttribute('content', linkValue);
    linkInput.classList.remove('error');
  }

  updateEditor();
  saveFileBtn.disabled = false;

  setStatusIcon('linkCheckmark', 'ok');
});

/* ---- Editor helper ---- */
function updateEditor() {
  if (!xmlDoc) return;
  const serializer = new XMLSerializer();
  let updatedXmlStr = serializer.serializeToString(xmlDoc);
  updatedXmlStr = formatXml(updatedXmlStr);
  editor.textContent = updatedXmlStr;
}

/* ---- Open / Reopen Folder ---- */
folderOpenBtn.addEventListener('click', async () => {
  try {
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
          editor.textContent = text;
          loadXmlFromText(text);

          // Reset icons + warning
          ['campaignIdCheckmark','subjectCheckmark','linkCheckmark'].forEach(id => clearStatusIcon(id));
          const mismatchWarning = document.getElementById('mismatchWarning');
          if (mismatchWarning) mismatchWarning.style.display = 'none';
          campaignIdInput.style.borderColor = '';
          linkInput.style.borderColor = '';

          saveFileBtn.style.borderColor = '';
          saveFileBtn.style.backgroundColor = '';

          fileList.querySelectorAll('li').forEach(sib => sib.classList.remove('selected'));
          li.classList.add('selected');
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
  if (!saved) return;
  try {
    const state = JSON.parse(saved);
    campaignIdInput.value = state.campaignId || '';
    subjectInput.value = state.subject || '';
    linkInput.value = state.link || '';

    if (state.xmlContent) {
      editor.textContent = state.xmlContent;
      loadXmlFromText(state.xmlContent);
    }
    if (state.folderOpened) { markFileListNeedsReopen(); }
  } catch (e) { console.error('Error loading state:', e); }
}
[campaignIdInput, subjectInput, linkInput].forEach(inp => inp.addEventListener('input', saveState));
window.addEventListener('load', loadState);
window.addEventListener('beforeunload', saveState);
