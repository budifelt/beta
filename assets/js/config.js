/** Ambil subject saat ini dari XML (kalau ada) */
function getXmlSubject() {
  if (!xmlDoc) return '';
  const mc = xmlDoc.querySelector('MessageContent');
  return mc ? (mc.getAttribute('subject') || '') : '';
}

function loadXmlFromText(xmlText, { suppressAlert = false } = {}) {
  const raw = (xmlText || '').trim();
  
  if (!raw) {
    xmlDoc = null; 
    initializeFields(); 
    updateEditor(); 
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
    if (elements.editor) elements.editor.setValue(''); 
    gateSubjectButton(); 
    return;
  }
  
  xmlDoc = parsed; 
  initializeFields(); 
  updateEditor(); 
  gateSubjectButton();

  // Reset indicator to default state when loading new file
  setCampaignIndicatorState('default');
}

/* Initialize form fields from XML */
function initializeFields() {
  if (!xmlDoc) {
    if (elements.campaignIdInput) elements.campaignIdInput.value = '';
    if (elements.subjectInput) elements.subjectInput.value = '';
    if (elements.linkInput) elements.linkInput.value = '';
    updateCampaignCountIndicator('');
    currentCampaignId = ''; // Reset current campaign ID
    return;
  }
  
  // Get current campaign ID from XML
  let xmlCampaignId = '';
  const audienceModel = xmlDoc.querySelector('AudienceModel');
  if (audienceModel) {
    const audienceName = audienceModel.getAttribute('name');
    xmlCampaignId = audienceName || '';
  }
  if (!xmlCampaignId) {
    const campaign = xmlDoc.querySelector('Campaign');
    if (campaign) {
      const campaignName = campaign.getAttribute('name');
      xmlCampaignId = campaignName || '';
    }
  }
  
  // Update input field and currentCampaignId variable
  if (elements.campaignIdInput) elements.campaignIdInput.value = xmlCampaignId;
  currentCampaignId = xmlCampaignId; // Set current campaign ID
  updateCampaignCountIndicator(xmlCampaignId);

  const messageContent = xmlDoc.querySelector('MessageContent');
  const subject = messageContent ? messageContent.getAttribute('subject') : '';
  if (elements.subjectInput) elements.subjectInput.value = subject;

  const messageBody = xmlDoc.querySelector('MessageBody');
  const link = messageBody ? messageBody.getAttribute('content') : '';
  if (elements.linkInput) elements.linkInput.value = link;
}

// ---- State & element refs ----
let fileHandle;
let xmlDoc;
let currentDirfileHandle = null;
let currentDirHandle = null;

// Performance: Cache DOM elements
const elements = {
  saveFileBtn: document.getElementById('saveFileBtn'),
  editor: null, // Will be initialized as CodeMirror
  campaignIdInput: document.getElementById('campaignId'),
  updateCampaignIdBtn: document.getElementById('updateCampaignIdBtn'),
  subjectInput: document.getElementById('subject'),
  updateSubjectBtn: document.getElementById('updateSubjectBtn'),
  linkInput: document.getElementById('link'),
  updateLinkBtn: document.getElementById('updateLinkBtn'),
  campaignCountIndicator: document.getElementById('campaignCountIndicator'),
  breadcrumb: document.getElementById('breadcrumb'),
  overlay: document.getElementById('overlay'),
  spinner: document.querySelector('.spinner')
};

// Initialize CodeMirror editor
let editor;
function initializeCodeMirror() {
  const textarea = document.getElementById('editor');
  if (textarea) {
    editor = CodeMirror.fromTextArea(textarea, {
      mode: 'xml',
      theme: 'monokai',
      lineNumbers: true,
      lineWrapping: true,
      foldGutter: true,
      gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
      autoCloseTags: true,
      matchTags: true,
      extraKeys: {
        'Ctrl-F': 'findPersistent',
        'Ctrl-H': 'replace',
        'F11': function(cm) {
          cm.setOption('fullScreen', !cm.getOption('fullScreen'));
        },
        'Esc': function(cm) {
          if (cm.getOption('fullScreen')) cm.setOption('fullScreen', false);
        }
      }
    });
    
    // Hide the original textarea
    textarea.style.display = 'none';
    
    // Update elements.editor to reference CodeMirror instance
    elements.editor = editor;
    
    // Add change event listener for save state
    editor.on('change', () => {
      debouncedSaveState();
    });
  }
}

// Util: label tombol dengan ikon FA - Optimized
function setStatusIcon(id, status) {
  const el = document.getElementById(id);
  if (!el) return;
  let icon = el.querySelector('i');
  if (!icon) {
    icon = document.createElement('i');
    icon.setAttribute('aria-hidden', 'true');
    el.appendChild(icon);
  }
  // Use requestAnimationFrame for smooth updates
  requestAnimationFrame(() => {
    icon.className = (status === 'error')
    ? 'fa-solid fa-circle-xmark'
    : 'fa-solid fa-circle-check';
    el.style.display = 'inline';
  });
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
  if (!cid || !lnk) return { ok: false, expected: cid || '(3â€“4 digit)', found: lnk || '(?)' };
  return { ok: cid === lnk, expected: cid, found: lnk };
}

/* KRHRED normalizer (toleran)
   ============================

   - Mendeteksi:
     krhred_XX, krhred-unit-XX, <krhred_XX>, <%[KRHRED_Unit_XX]|>, dst.
   - Mengoreksi OCR-like: Oâ†’0, l/Iâ†’1
   - Melengkapi bagian yang kurang â†’ <%[KRHRED_Unit_XX]|%>
*/
const KRHRED_FAST_RE = /(\s*)<?%?\s*\[?\s*KRHRED(?:_Unit)?[_\s-]*([0-9oOlLiI]{1,2})\s*\]?\s*\|?\s*%?>?/gi;

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

  // Ganti semua variasi menjadi format final, preserve space before
  const replaced = text.replace(KRHRED_FAST_RE, (m, spaceBefore, num) => {
    const d2 = toDigits2(num) || '00';
    
    // Preserve the original spacing before the token
    return spaceBefore + `<%[KRHRED_Unit_${d2}]|%>`;
  });

  // Lengkapi jadi format persis <%[KRHRED_Unit_XX]|%>
  const completed = replaced
    .replace(/<\s*KRHRED_Unit_(\d{2})\s*>/gi, '<%[KRHRED_Unit_$1]|%>')       // <KRHRED_Unit_39>
    .replace(/<%\s*\[?\s*KRHRED_Unit_(\d{2})\]?\s*\|?\s*%?>?/gi, '<%[KRHRED_Unit_$1]|%>'); // variasi kurang/salah

  return { text: completed, missingDetected };
}

/* CLEAR / RESET - Optimized with cached elements */
function clearAllUI(opts = { clearStorage: false }) {
  xmlDoc = null; filefileHandle = null;
  
  // Batch DOM updates with requestAnimationFrame
  requestAnimationFrame(() => {
    const inputs = [elements.campaignIdInput, elements.subjectInput, elements.linkInput];
    inputs.forEach(inp => {
      if (inp) {
        inp.value = '';
        inp.classList.remove('error');
        inp.style.borderColor = '';
      }
    });
    
    updateCampaignCountIndicator('');
    
    const charCounts = ['campaignIdCharCount', 'subjectCharCount'];
    charCounts.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = '(0)';
    });
    
    ['campaignIdCheckmark','subjectCheckmark','linkCheckmark'].forEach(clearStatusIcon);
    
    if (elements.saveFileBtn) {
      elements.saveFileBtn.style.borderColor = '';
      elements.saveFileBtn.style.backgroundColor = '';
    }
    
    if (elements.updateSubjectBtn) {
      elements.updateSubjectBtn.disabled = true;
    }
    
    if (opts.clearStorage) {
      localStorage.removeItem('config_state');
    }
  });
}

/* Save / Load XML - Show modal first before saving */
elements.saveFileBtn.addEventListener('click', async () => {
  // Check if file is opened before showing modal
  if (!window.fileHandle) {
    showNotification("Belum ada file yang dibuka. Silakan buka file terlebih dahulu.", 'error');
    return;
  }
  
  // Show save confirmation modal instead of saving directly
  showSaveChangesModal();
});

// Actual save function called by modal
async function performSave() {
  // Use window.fileHandle instead of local fileHandle
  const currentFileHandle = window.fileHandle || fileHandle;
  
  if (!currentFileHandle) {
    showNotification("Belum ada file yang dibuka.", 'error');
    return;
  }
  
  if (!elements.editor || !elements.editor.getValue) {
    showNotification("Editor tidak tersedia.", 'error');
    return;
  }
  
  if (!elements.editor.getValue().trim()) {
    showNotification("Editor kosong, tidak bisa disimpan.", 'error');
    return;
  }

  // Performance: Disable button and show loading state
  elements.saveFileBtn.disabled = true;
  const originalText = elements.saveFileBtn.textContent;
  elements.saveFileBtn.textContent = 'Saving...';

  try {
    const parser = new DOMParser();
    const parsedDoc = parser.parseFromString(elements.editor.getValue(), "application/xml");
    const hasError = parsedDoc.getElementsByTagName('parsererror').length > 0;
    
    if (hasError) {
      throw new Error('Invalid XML format');
    }

    xmlDoc = parsedDoc;

    // Performance: Write file with timeout
    const writable = await currentFileHandle.createWritable();
    await writable.write(elements.editor.getValue());
    await writable.close();

    // Success feedback
    elements.saveFileBtn.style.borderColor = 'var(--success)';
    elements.saveFileBtn.style.backgroundColor = 'var(--success)';
    showNotification('File saved successfully!', 'success');

    // Reset unsaved changes tracking after successful save
    initializeOriginalValues();

    // Set indicator to saved state
    setCampaignIndicatorState('saved');

  } catch (err) {
    showNotification("Error saving file: " + err.message, 'error');
  } finally {
    // Always restore button state
    elements.saveFileBtn.disabled = false;
    elements.saveFileBtn.textContent = originalText;
  }
}

// Performance: Notification system with stacking (newest on top)
let activeToasts = [];
const MAX_TOASTS = 5;
const TOAST_HEIGHT = 60; // Approximate height per toast
const TOAST_SPACING = 10;

// Track current campaign ID for updates
let currentCampaignId = '';

function showNotification(message, type = 'info') {
  // Limit maximum stacked toasts
  if (activeToasts.length >= MAX_TOASTS) {
    const oldestToast = activeToasts.shift();
    if (oldestToast && oldestToast.parentNode) {
      oldestToast.parentNode.removeChild(oldestToast);
    }
  }

  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;

  // Insert at beginning of array so newest is on top
  activeToasts.unshift(notification);

  // Calculate position based on existing toasts (newest gets index 0)
  const toastIndex = 0; // Always position newest on top
  const topPosition = 80 + (toastIndex * (TOAST_HEIGHT + TOAST_SPACING));

  notification.style.cssText = `
    position: fixed !important;
    top: ${topPosition}px !important;
    right: 20px !important;
    left: auto !important;
    bottom: auto !important;
    z-index: ${10000 + toastIndex} !important;
    padding: 12px 20px;
    border-radius: 8px;
    color: white;
    font-weight: 500;
    max-width: 300px;
    word-wrap: break-word;
    box-shadow: 0 4px 20px rgba(0,0,0,0.15);
    transform: translateX(100%);
    transition: transform 0.3s ease;
    opacity: 1;
  `;

  const colors = {
    success: 'linear-gradient(135deg, #10b981, #059669)',
    error: 'linear-gradient(135deg, #ef4444, #dc2626)',
    info: 'linear-gradient(135deg, #3b82f6, #2563eb)'
  };

  notification.style.background = colors[type] || colors.info;
  document.body.appendChild(notification);

  // Reposition all existing toasts down
  repositionToasts();

  // Trigger animation
  requestAnimationFrame(() => {
    notification.style.transform = 'translateX(0)';
  });

  // Auto-remove after 3 seconds
  setTimeout(() => {
    // Animate out
    notification.style.transform = 'translateX(100%)';
    notification.style.opacity = '0';

    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
      // Remove from active toasts array
      const index = activeToasts.indexOf(notification);
      if (index > -1) {
        activeToasts.splice(index, 1);
        // Reposition remaining toasts
        repositionToasts();
      }
    }, 300);
  }, 3000);
}

// Reposition all toasts (newest on top, oldest at bottom)
function repositionToasts() {
  activeToasts.forEach((toast, index) => {
    const newTop = 80 + (index * (TOAST_HEIGHT + TOAST_SPACING));
    toast.style.top = `${newTop}px`;
    toast.style.zIndex = 10000 + index;
  });
}

// Performance: Debounced input handlers
const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

// Track last shown past date warning to avoid spam
let lastShownPastDateWarning = null;

// Performance: Optimized input event listeners
const debouncedSaveState = debounce(saveState, 300);
const debouncedUpdateCampaignCount = debounce(updateCampaignCountIndicator, 100);
const debouncedPastDateWarning = debounce((campaignId, campaignDate) => {
  const pastDateWarning = `Peringatan: Tanggal campaign (${campaignDate.toLocaleDateString('id-ID')}) sudah lewat dari hari ini`;
  showNotification(pastDateWarning, 'info');
  lastShownPastDateWarning = campaignId;
}, 2000); // Show warning max once every 2 seconds

// Single event listener for campaignIdInput
if (elements.campaignIdInput) {
  elements.campaignIdInput.addEventListener('input', () => {
    const campaignId = elements.campaignIdInput.value.trim();
    
    // Update campaign count indicator
    debouncedUpdateCampaignCount(campaignId);
    
    // Live validation with link
    liveValidatePair();
    
    // Check for spaces and empty
    const raw = elements.campaignIdInput.value;
    const hasSpace = /\s/.test(raw);
    const isEmpty = raw.trim() === '';
    
    // Format validation
    const formatValidation = validateCampaignIdFormat(campaignId);
    
    if (hasSpace || isEmpty || (campaignId && !formatValidation.valid)) {
      elements.campaignIdInput.classList.add('error');
      // Show format error if applicable
      if (campaignId && !formatValidation.valid && formatValidation.error) {
        elements.campaignIdInput.title = formatValidation.error;
      }
    } else {
      elements.campaignIdInput.classList.remove('error');
      elements.campaignIdInput.title = '';
      
      // Show past date warning (but allow input)
      if (campaignId && formatValidation.valid && formatValidation.isPastDate) {
        const pastDateWarning = `Peringatan: Tanggal campaign (${formatValidation.campaignDate.toLocaleDateString('id-ID')}) sudah lewat dari hari ini`;
        elements.campaignIdInput.title = pastDateWarning;
        
        // Only show notification if this is a different campaign ID than last shown
        if (lastShownPastDateWarning !== campaignId) {
          debouncedPastDateWarning(campaignId, formatValidation.campaignDate);
        }
      }
    }
    
    clearStatusIcon('campaignIdCheckmark');
    saveState();
    
    // Show link checkmark when valid
    showLinkCheckmarkWhenValid();
  });
}

/* ============================
   SUBJECT gate (no icon by default) - Fixed with null checks
   ============================ */
function gateSubjectButton() {
  const raw = elements.subjectInput ? elements.subjectInput.value : '';
  const noXml = !xmlDoc;
  const empty = raw.trim() === '';

  // Jangan tampilkan ikon apapun saat mengetik
  clearStatusIcon('subjectCheckmark');

  // Disable button kalau belum ada XML atau kosong
  if (elements.updateSubjectBtn) {
    elements.updateSubjectBtn.disabled = noXml || empty;
  }
}

// Add saveState event listeners
if (elements.campaignIdInput) elements.campaignIdInput.addEventListener('input', saveState);
if (elements.subjectInput) elements.subjectInput.addEventListener('input', saveState);
if (elements.linkInput) elements.linkInput.addEventListener('input', saveState);
window.addEventListener('beforeunload', saveState);

// Show linkCheckmark when Campaign ID is valid and has content
function showLinkCheckmarkWhenValid() {
  const cid = elements.campaignIdInput ? elements.campaignIdInput.value.trim() : '';
  const lnk = elements.linkInput ? elements.linkInput.value.trim() : '';
  
  if (cid && lnk) {
    const res = validateCampaignLinkPair(cid, lnk);
    if (res.ok) {
      setStatusIcon('linkCheckmark', 'ok');
    } else {
      clearStatusIcon('linkCheckmark');
    }
  }
}

/* Campaign ID Format Validation */
function validateCampaignIdFormat(campaignId) {
  if (!campaignId || campaignId.trim() === '') return { valid: false, error: '' };
  
  // Regex for YYYYMMDD_nama-campaign_XXXX format
  // YYYYMMDD_ = 8 digits + underscore
  // nama-campaign = anything (non-empty)
  // _XXXX = underscore + 4 digits
  const formatRegex = /^\d{8}_.+_\d{4}$/;
  
  if (!formatRegex.test(campaignId)) {
    return { 
      valid: false, 
      error: 'Format harus: YYYYMMDD_nama-campaign_XXXX' 
    };
  }
  
  // Extract and validate date part (YYYYMMDD)
  const datePart = campaignId.substring(0, 8);
  const year = parseInt(datePart.substring(0, 4));
  const month = parseInt(datePart.substring(4, 6));
  const day = parseInt(datePart.substring(6, 8));
  
  if (year < 2020 || year > 2030 || month < 1 || month > 12 || day < 1 || day > 31) {
    return { 
      valid: false, 
      error: 'Tanggal tidak valid (YYYYMMDD)' 
    };
  }
  
  // Check if date is in the past
  const campaignDate = new Date(year, month - 1, day);
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Set to start of day for comparison
  
  const isPastDate = campaignDate < today;
  
  return { 
    valid: true, 
    error: '',
    isPastDate: isPastDate,
    campaignDate: campaignDate
  };
}

/* Live validation CampaignID â†" Link - Optimized */
function extractCountByCampaignId(campaignId) {
  if (!xmlDoc || !campaignId || campaignId.trim() === '') return 0;
  let count = 0;
  
  xmlDoc.querySelectorAll('AudienceModel').forEach((el) => {
    const name = el.getAttribute('name');
    if (name === campaignId) count++;
  });
  
  xmlDoc.querySelectorAll('Campaign').forEach((el) => {
    const name = el.getAttribute('name');
    const audience = el.getAttribute('audience');
    if (name === campaignId) count++;
    if (audience === campaignId) count++;
  });
  
  xmlDoc.querySelectorAll('Interaction').forEach((el) => {
    const name = el.getAttribute('name');
    const message = el.getAttribute('message');
    if (name === campaignId) count++;
    if (message === campaignId) count++;
  });
  
  xmlDoc.querySelectorAll('MessageContent').forEach((el) => {
    const name = el.getAttribute('name');
    if (name === campaignId) count++;
  });
  
  xmlDoc.querySelectorAll('FilterValue').forEach((el) => {
    const value = el.getAttribute('value');
    if (value === campaignId) count++;
  });
  
  return count;
}

function updateCampaignCountIndicator(campaignId) {
  const n = extractCountByCampaignId(campaignId);
  let color;

  // Determine color based on state and count
  if (!campaignId || !xmlDoc) {
    // No campaign loaded - show default state color
    color = '#ef4444'; // red
  } else {
    // Campaign loaded - use state-based colors
    switch (campaignIndicatorState) {
      case 'saved':
        color = '#22c55e'; // green - saved
        break;
      case 'applied':
        color = '#eab308'; // yellow - applied but not saved
        break;
      case 'default':
      default:
        color = '#ef4444'; // red - default state
        break;
    }
  }

  if (elements.campaignCountIndicator) {
    elements.campaignCountIndicator.style.backgroundColor = color;
    // Show the actual count (n/7)
    elements.campaignCountIndicator.textContent = `${n}/7`;
    elements.campaignCountIndicator.title = `${n}/7 - State: ${campaignIndicatorState}`;
  }
}

function liveValidatePair() {
  const cid = elements.campaignIdInput ? elements.campaignIdInput.value.trim() : '';
  const lnk = elements.linkInput ? elements.linkInput.value.trim() : '';
  const res = validateCampaignLinkPair(cid, lnk);
  const mismatchWarning = document.getElementById('mismatchWarning');

  if (elements.campaignIdInput) {
    elements.campaignIdInput.classList.remove('error');
    elements.campaignIdInput.style.borderColor = '';
  }
  if (elements.linkInput) {
    elements.linkInput.classList.remove('error');
    elements.linkInput.style.borderColor = '';
  }
  if (mismatchWarning) mismatchWarning.style.display = 'none';

  if (cid && lnk && !res.ok) {
    if (mismatchWarning) mismatchWarning.style.display = 'inline';
    if (elements.campaignIdInput) elements.campaignIdInput.classList.add('error');
    if (elements.linkInput) elements.linkInput.classList.add('error');
  }
}

if (elements.subjectInput) {
  elements.subjectInput.addEventListener('input', () => {
    // Sembunyikan ikon ketika user mengubah input
    clearStatusIcon('subjectCheckmark');
    const cc = document.getElementById('subjectCharCount');
    if (cc) cc.textContent = `(${(elements.subjectInput.value || '').length})`;
    gateSubjectButton();
  });
}

if (elements.linkInput) {
  elements.linkInput.addEventListener('input', () => {
    liveValidatePair();
    clearStatusIcon('linkCheckmark');
  });
  
  // Show link checkmark when valid
  elements.linkInput.addEventListener('input', showLinkCheckmarkWhenValid);
}

// Add saveState event listeners
if (elements.campaignIdInput) elements.campaignIdInput.addEventListener('input', saveState);
if (elements.subjectInput) elements.subjectInput.addEventListener('input', saveState);
if (elements.linkInput) elements.linkInput.addEventListener('input', saveState);
window.addEventListener('beforeunload', saveState);

// Show linkCheckmark when Campaign ID is valid and has content
function showLinkCheckmarkWhenValid() {
  const cid = elements.campaignIdInput ? elements.campaignIdInput.value.trim() : '';
  const lnk = elements.linkInput ? elements.linkInput.value.trim() : '';
  
  if (cid && lnk) {
    const res = validateCampaignLinkPair(cid, lnk);
    if (res.ok) {
      setStatusIcon('linkCheckmark', 'ok');
    } else {
      clearStatusIcon('linkCheckmark');
    }
  }
}

/* UPDATE CAMPAIGN ID */
if (elements.updateCampaignIdBtn) {
  elements.updateCampaignIdBtn.addEventListener('click', () => {
    if (!xmlDoc) { showNotification("Tidak ada XML yang dimuat. Silakan buka file terlebih dahulu.", 'error'); return; }
    
    const campaignIdValue = elements.campaignIdInput ? elements.campaignIdInput.value.trim() : '';
    if (!campaignIdValue) {
      showNotification("Campaign ID cannot be empty.", 'error');
      if (elements.campaignIdInput) elements.campaignIdInput.classList.add('error');
      clearStatusIcon('campaignIdCheckmark');
      return;
    }
    
    // Check for spaces
    const hasSpace = /\s/.test(campaignIdValue);
    if (hasSpace) {
      showNotification("Campaign ID cannot contain spaces.", 'error');
      if (elements.campaignIdInput) elements.campaignIdInput.classList.add('error');
      clearStatusIcon('campaignIdCheckmark');
      return;
    }
    
    // Validate format
    const formatValidation = validateCampaignIdFormat(campaignIdValue);
    if (!formatValidation.valid) {
      showNotification(formatValidation.error, 'error');
      if (elements.campaignIdInput) elements.campaignIdInput.classList.add('error');
      clearStatusIcon('campaignIdCheckmark');
      return;
    }
    
    // Show past date warning (but allow update)
    if (formatValidation.isPastDate) {
      const pastDateWarning = `Peringatan: Tanggal campaign (${formatValidation.campaignDate.toLocaleDateString('id-ID')}) sudah lewat dari hari ini`;
      showNotification(pastDateWarning, 'info');
    }
    
    // Update AudienceModel
    const audienceModel = xmlDoc.querySelector('AudienceModel');
    if (audienceModel) {
      audienceModel.setAttribute('name', campaignIdValue);
    }
    
    // Update Campaign
    const campaign = xmlDoc.querySelector('Campaign');
    if (campaign) {
      campaign.setAttribute('name', campaignIdValue);
      campaign.setAttribute('audience', campaignIdValue);
    }
    
    // Update Interaction elements
    xmlDoc.querySelectorAll('Interaction').forEach(el => {
      if (el.getAttribute('name') === currentCampaignId) {
        el.setAttribute('name', campaignIdValue);
      }
      if (el.getAttribute('message') === currentCampaignId) {
        el.setAttribute('message', campaignIdValue);
      }
    });
    
    // Update MessageContent elements
    xmlDoc.querySelectorAll('MessageContent').forEach(el => {
      if (el.getAttribute('name') === currentCampaignId) {
        el.setAttribute('name', campaignIdValue);
      }
    });
    
    // Update FilterValue elements
    xmlDoc.querySelectorAll('FilterValue').forEach(el => {
      if (el.getAttribute('value') === currentCampaignId) {
        el.setAttribute('value', campaignIdValue);
      }
    });
    
    // Update currentCampaignId variable
    currentCampaignId = campaignIdValue;
    
    // Show success feedback
    if (elements.campaignIdInput) {
      elements.campaignIdInput.classList.remove('error');
      setStatusIcon('campaignIdCheckmark', 'ok');
    }
    
    updateEditor();
    showNotification('Campaign ID updated successfully!', 'success');
    
    // Set indicator to applied state
    setCampaignIndicatorState('applied');
  });
}

/* UPDATE SUBJECT (ikon muncul saat ditekan) */
if (elements.updateSubjectBtn) {
  elements.updateSubjectBtn.addEventListener('click', () => {
    if (!xmlDoc) { showNotification("Tidak ada XML yang dimuat. Silakan buka file terlebih dahulu.", 'error'); return; }
    const messageContent = xmlDoc.querySelector('MessageContent');
    if (!messageContent) { showNotification("MessageContent not found in XML.", 'error'); return; }

    // Ambil & rapikan input
    let s = (elements.subjectInput ? elements.subjectInput.value : '').replace(/\s{2,}/g, ' ').trim();

    // Normalisasi KRHRED
    const result = normalizeKrhredTokens(s);
    const normalized = (result.text || '').trim();
    const missingDetected = result.missingDetected;

    if (missingDetected || normalized === '') {
      // Invalid â†’ X merah, tidak masuk ke XML
      if (elements.subjectInput) elements.subjectInput.classList.add('error');
      setStatusIcon('subjectCheckmark', 'error');
      elements.updateSubjectBtn.disabled = false; // tetap bisa coba lagi
      return;
    }

    // Valid â†’ commit ke XML & centang hijau
    s = normalized;
    if (elements.subjectInput) elements.subjectInput.value = s;

    const charCountSpan = document.getElementById('subjectCharCount'); 
    if (charCountSpan) charCountSpan.textContent = `(${s.length})`;

    if (messageContent) messageContent.setAttribute('subject', s);

    if (elements.subjectInput) elements.subjectInput.classList.remove('error');
    setStatusIcon('subjectCheckmark', 'ok');
    elements.updateSubjectBtn.disabled = true; // disable setelah sukses
  });
}

/* UPDATE LINK - Fixed with null checks and proper scoping */
if (elements.updateLinkBtn) {
  elements.updateLinkBtn.addEventListener('click', () => {
    if (!xmlDoc) { showNotification("Tidak ada XML yang dimuat. Silakan buka file terlebih dahulu.", 'error'); return; }
    const messageBody = xmlDoc.querySelector('MessageBody');
    if (!messageBody) return;

    let linkValue = elements.linkInput ? elements.linkInput.value.trim() : '';
    const urlPattern = /^(http:\/\/|https:\/\/).+/i;
    if (!urlPattern.test(linkValue)) {
      showNotification('Please enter a valid link starting with http:// or https://', 'error');
      if (elements.linkInput) elements.linkInput.classList.add('error');
      clearStatusIcon('linkCheckmark');
      return;
    }
    if (linkValue.startsWith('https://')) linkValue = 'http://' + linkValue.substring(8);

    const cid = elements.campaignIdInput ? elements.campaignIdInput.value.trim() : '';
    if (cid) {
      const res = validateCampaignLinkPair(cid, linkValue);
      const mismatchWarning = document.getElementById('mismatchWarning');
      if (!res.ok) {
        if (mismatchWarning) mismatchWarning.style.display = 'inline';
        if (elements.campaignIdInput) elements.campaignIdInput.classList.add('error');
        if (elements.linkInput) elements.linkInput.classList.add('error');
      } else {
        if (mismatchWarning) mismatchWarning.style.display = 'none';
        if (elements.campaignIdInput) elements.campaignIdInput.classList.remove('error');
        if (elements.linkInput) elements.linkInput.classList.remove('error');
      }
    }

    if (messageBody) messageBody.setAttribute('content', linkValue);
    setStatusIcon('linkCheckmark', 'ok');
    updateEditor();
  });
}

/* Editor helper */
function updateEditor() {
  if (!xmlDoc) { 
    if (elements.editor) elements.editor.setValue(''); 
    return; 
  }
  const serializer = new XMLSerializer();
  let updatedXmlStr = serializer.serializeToString(xmlDoc);
  updatedXmlStr = formatXml(updatedXmlStr);
  if (elements.editor) elements.editor.setValue(updatedXmlStr);
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

// Enhanced save/load state with search persistence
function saveState() {
  const state = {
    campaignId: elements.campaignIdInput ? elements.campaignIdInput.value : '',
    subject: elements.subjectInput ? elements.subjectInput.value : '',
    link: elements.linkInput ? elements.linkInput.value : '',
    xmlContent: elements.editor ? elements.editor.getValue() : '',
    folderOpened: typeof currentDirHandle !== 'undefined' && currentDirHandle !== null
  };
  localStorage.setItem('config_state', JSON.stringify(state));
}

function loadState() {
  const saved = localStorage.getItem('config_state');
  if (!saved) { 
    if (elements.updateSubjectBtn) gateSubjectButton(); 
    if (typeof decorateButtons === 'function') decorateButtons(); 
    return; 
  }
  try {
    const state = JSON.parse(saved);
    if (state.xmlContent) loadXmlFromText(state.xmlContent, { suppressAlert: true });
    if (xmlDoc && elements.campaignIdInput) {
      elements.campaignIdInput.value = state.campaignId || '';
      elements.subjectInput.value = state.subject || '';
      elements.linkInput.value = state.link || '';
      updateCampaignCountIndicator(elements.campaignIdInput.value);
    }
    // Remove folder state persistence to always start fresh
    // if (state.folderOpened) markFileListNeedsReopen();
  } catch (e) {
    showNotification('Error loading state', 'error');
  } finally {
    if (elements.updateSubjectBtn) gateSubjectButton();
    if (typeof decorateButtons === 'function') decorateButtons(); // ensure emojis added
  }
}
if (elements.campaignIdInput) elements.campaignIdInput.addEventListener('input', saveState);
if (elements.subjectInput) elements.subjectInput.addEventListener('input', saveState);
if (elements.linkInput) elements.linkInput.addEventListener('input', saveState);
window.addEventListener('beforeunload', saveState);

// === Apply Update combo button ===
(function(){
  const applyUpdateBtn = document.getElementById('applyUpdateBtn');
  if (applyUpdateBtn) {
    applyUpdateBtn.addEventListener('click', () => {
      // Check if XML is loaded before applying updates
      if (!xmlDoc) {
        showNotification("Tidak ada XML yang dimuat. Silakan buka file terlebih dahulu.", 'error');
        return;
      }
      
      // Call the existing individual updaters to preserve logic
      const a = document.getElementById('updateCampaignIdBtn');
      const b = document.getElementById('updateSubjectBtn');
      const c = document.getElementById('updateLinkBtn');
      if (a) a.click();
      if (b) b.click();
      if (c) c.click();

      // Set indicator to applied state
      setCampaignIndicatorState('applied');
    });
  }
})();

// === Save Changes Modal ===
// Track unsaved changes
let hasUnsavedChanges = false;
let originalValues = {};

// Track campaign count indicator state
let campaignIndicatorState = 'default'; // 'default' | 'applied' | 'saved'

function setCampaignIndicatorState(state) {
  campaignIndicatorState = state;
  // Update indicator immediately if we have a campaign ID
  if (elements.campaignIdInput && elements.campaignIdInput.value) {
    updateCampaignCountIndicator(elements.campaignIdInput.value);
  }
}

// Initialize original values on page load
function initializeOriginalValues() {
  originalValues = {
    campaignId: elements.campaignIdInput ? elements.campaignIdInput.value : '',
    subject: elements.subjectInput ? elements.subjectInput.value : '',
    link: elements.linkInput ? elements.linkInput.value : '',
    editorContent: elements.editor ? elements.editor.getValue() : ''
  };
  hasUnsavedChanges = false;
}

// Check if there are unsaved changes
function checkUnsavedChanges() {
  if (!originalValues.campaignId && !originalValues.subject && !originalValues.link && !originalValues.editorContent) return false; // Not initialized yet

  const currentValues = {
    campaignId: elements.campaignIdInput ? elements.campaignIdInput.value : '',
    subject: elements.subjectInput ? elements.subjectInput.value : '',
    link: elements.linkInput ? elements.linkInput.value : '',
    editorContent: elements.editor ? elements.editor.getValue() : ''
  };

  const hasChanges = 
    currentValues.campaignId !== originalValues.campaignId ||
    currentValues.subject !== originalValues.subject ||
    currentValues.link !== originalValues.link ||
    currentValues.editorContent !== originalValues.editorContent;

  hasUnsavedChanges = hasChanges;
  return hasChanges;
}

// Show save changes modal
function showSaveChangesModal() {
  const modal = document.getElementById('saveChangesModal');
  if (modal) {
    modal.hidden = false;
    modal.style.display = 'flex !important';
    modal.style.zIndex = '9999';
  }
}

// Hide save changes modal
function hideSaveChangesModal() {
  const modal = document.getElementById('saveChangesModal');
  if (modal) {
    modal.hidden = true;
    modal.style.display = 'none !important';
    modal.style.zIndex = '-1';
  }
}

// Modal event handlers
function initializeModalHandlers() {
  const modal = document.getElementById('saveChangesModal');
  const closeBtn = document.getElementById('modalCloseBtn');
  const cancelBtn = document.getElementById('cancelModalBtn');
  const saveBtn = document.getElementById('saveChangesBtn');

  // Close modal when clicking outside
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        hideSaveChangesModal();
      }
    });
  }

  // Close button
  if (closeBtn) {
    closeBtn.addEventListener('click', hideSaveChangesModal);
  }

  // Cancel button - just close modal
  if (cancelBtn) {
    cancelBtn.addEventListener('click', hideSaveChangesModal);
  }

  // Save button - save changes and close
  if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
      // Check if file is opened before proceeding
      if (!window.fileHandle) {
        showNotification("Belum ada file yang dibuka. Silakan buka file terlebih dahulu.", 'error');
        hideSaveChangesModal();
        return;
      }
      
      hideSaveChangesModal(); // Hide modal immediately

      // Trigger save
      try {
        await performSave();
      } catch (error) {
        showNotification("Error saving file: " + error.message, 'error');
      }

      // Mark as saved after a short delay to ensure save completes
      setTimeout(() => {
        initializeOriginalValues();
      }, 100);
    });
  }
}

// Prevent page unload with unsaved changes
window.addEventListener('beforeunload', (e) => {
  if (checkUnsavedChanges()) {
    // Only show modal if file is actually opened AND not in applied state
    if (window.fileHandle && campaignIndicatorState !== 'applied') {
      e.preventDefault();
      e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
      showSaveChangesModal();
      return e.returnValue;
    }
  }
});

// Track changes on input
[elements.campaignIdInput, elements.subjectInput, elements.linkInput].forEach(inp => {
  if (inp) {
    inp.addEventListener('input', () => {
      // Performance: Batch DOM updates
      requestAnimationFrame(() => {
        if (elements.saveFileBtn) {
          elements.saveFileBtn.style.borderColor = '';
          elements.saveFileBtn.style.backgroundColor = '';
        }
        checkUnsavedChanges();
        debouncedSaveState();
      });
    });
  }
});

// Track editor changes - handled in CodeMirror initialization

// Initialize modal on page load
window.addEventListener('load', () => {
  // Initialize CodeMirror first
  initializeCodeMirror();
  
  loadState();
  initializeOriginalValues();
  initializeModalHandlers();
  initializeFileTree();

  // Clear content if no folder is active
  if (typeof currentDirHandle === 'undefined' || currentDirHandle === null) {
    clearContentWhenNoFolder();
  }
});

// Clear content section when no folder/file is active
function clearContentWhenNoFolder() {
  // Clear form inputs
  if (elements.campaignIdInput) elements.campaignIdInput.value = '';
  if (elements.subjectInput) elements.subjectInput.value = '';
  if (elements.linkInput) elements.linkInput.value = '';
  if (elements.editor) elements.editor.setValue('');
  
  // Clear XML document
  xmlDoc = null;
  
  // Update breadcrumb
  updateBreadcrumb('No folder');
  
  // Reset indicator
  setCampaignIndicatorState('default');
}

// === File Tree Functionality ===
let selectedFileItem = null;

// Initialize file tree
function initializeFileTree() {
  const openFolderBtn = document.getElementById('openFolderBtn');
  const refreshTreeBtn = document.getElementById('refreshTreeBtn');
  const resizeHandle = document.getElementById('resizeHandle');
  const fileTree = document.getElementById('fileTree');
  
  if (openFolderBtn) {
    openFolderBtn.addEventListener('click', openFolder);
  }
  
  if (refreshTreeBtn) {
    refreshTreeBtn.addEventListener('click', refreshFileTree);
  }
  
  // Initialize resizable sidebar
  if (resizeHandle) {
    initializeResizableSidebar();
  }

  // Simple event delegation that should work
  if (fileTree) {
    fileTree.addEventListener('click', function(e) {
      // Find the closest li element (could be nested)
      const li = e.target.closest('li');
      if (!li) {
        return;
      }
      
      if (li.classList.contains('folder')) {
        e.stopPropagation();
        e.preventDefault();
        toggleFolder(li);
      } else if (li.classList.contains('file')) {
        e.stopPropagation();
        e.preventDefault();
        selectFile(li, li._fileHandle);
      }
    });
  }
}

// Handle tree click events using event delegation
function handleTreeClick(e) {
  const target = e.target;
  const li = target.closest('li');
  
  if (!li) return;
  
  e.stopPropagation();
  
  if (li.classList.contains('folder')) {
    toggleFolder(li);
  } else if (li.classList.contains('file')) {
    selectFile(li, li._fileHandle);
  }
}

// Initialize resizable sidebar functionality
function initializeResizableSidebar() {
  const sidebar = document.querySelector('.sidebar');
  const resizeHandle = document.getElementById('resizeHandle');
  let isResizing = false;
  let startX = 0;
  let startWidth = 0;

  resizeHandle.addEventListener('mousedown', (e) => {
    isResizing = true;
    startX = e.clientX;
    startWidth = sidebar.offsetWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    
    const deltaX = e.clientX - startX;
    const newWidth = startWidth + deltaX;
    
    // Apply min and max width constraints
    if (newWidth >= 200 && newWidth <= 500) {
      sidebar.style.width = newWidth + 'px';
    }
  });

  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  });
}

// Open folder using File System Access API
async function openFolder() {
  try {
    if ('showDirectoryPicker' in window) {
      const dirHandle = await window.showDirectoryPicker();
      currentDirHandle = dirHandle;
      updateBreadcrumb(dirHandle.name);
      await loadFileTree(dirHandle);
      showNotification(`Folder "${dirHandle.name}" opened successfully`, 'success');
    } else {
      showNotification('File System Access API not supported in this browser', 'error');
    }
  } catch (error) {
    if (error.name !== 'AbortError') {
      showNotification('Failed to open folder', 'error');
    }
  }
}

// Refresh file tree
async function refreshFileTree() {
  if (currentDirHandle) {
    await loadFileTree(currentDirHandle);
    showNotification('File tree refreshed', 'info');
  } else {
    showNotification('No folder opened', 'error');
  }
}

// Update breadcrumb
function updateBreadcrumb(folderName) {
  if (elements.breadcrumb) {
    elements.breadcrumb.textContent = folderName || 'No folder';
    elements.breadcrumb.title = folderName || 'No folder';
  }
}

// Load file tree from directory handle
async function loadFileTree(dirHandle) {
  const fileTree = document.getElementById('fileTree');
  if (!fileTree) return;
  
  fileTree.innerHTML = '';
  
  try {
    // Check if this is folder 'X' - if so, show its contents directly
    if (dirHandle.name.toLowerCase() === 'x') {
      const treeContainer = document.createElement('ul');
      treeContainer.className = 'tree';
      await loadDirectoryChildren(dirHandle, treeContainer);
      fileTree.appendChild(treeContainer);
      
      // Update breadcrumb to show 'X' instead of the actual folder name
      updateBreadcrumb('X');
      showNotification(`Showing contents of folder "X"`, 'info');
    } else {
      // Normal folder - show folder and its contents
      const treeContainer = document.createElement('ul');
      treeContainer.className = 'tree';
      
      const rootItem = createTreeItem(dirHandle.name, 'folder', dirHandle, true);
      treeContainer.appendChild(rootItem);
      
      // Load children
      const childrenContainer = document.createElement('ul');
      await loadDirectoryChildren(dirHandle, childrenContainer);
      rootItem.appendChild(childrenContainer);
      
      // Auto-expand root folder
      rootItem.classList.add('open');
      
      fileTree.appendChild(treeContainer);
      
      // Update breadcrumb normally
      updateBreadcrumb(dirHandle.name);
    }

    // Removed event delegation setup since we're using direct onclick handlers

  } catch (error) {
    showNotification('Failed to load file tree', 'error');
  }
}

// Setup event listeners for the tree after it's built
function setupTreeEventListeners() {
  // Add click handlers for folders
  document.querySelectorAll('.tree li.folder').forEach(li => {
    li.addEventListener('click', function(e) {
      e.stopPropagation();
      toggleFolder(this);
    });
  });
  
  // Add click handlers for files
  document.querySelectorAll('.tree li.file').forEach(li => {
    li.addEventListener('click', function(e) {
      e.stopPropagation();
      selectFile(this, this._fileHandle);
    });
  });
}

// Load directory children recursively
async function loadDirectoryChildren(dirHandle, container) {
  try {
    const entries = [];
    for await (const [name, handle] of dirHandle.entries()) {
      entries.push({ name, handle });
    }

    // Sort: folders first, then files, both alphabetically
    entries.sort((a, b) => {
      const aIsDir = a.handle.kind === 'directory';
      const bIsDir = b.handle.kind === 'directory';
      if (aIsDir !== bIsDir) return aIsDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    for (const entry of entries) {
      const item = createTreeItem(entry.name, entry.handle.kind, entry.handle, false);
      container.appendChild(item);

      if (entry.handle.kind === 'directory') {
        const childrenContainer = document.createElement('ul');
        await loadDirectoryChildren(entry.handle, childrenContainer);
        item.appendChild(childrenContainer);
      }
    }
  } catch (error) {
    console.error('Error loading directory children:', error);
  }
}

// Create tree item element
function createTreeItem(name, type, handle, isRoot = false) {
  const item = document.createElement('li');
  // Fix class name - use 'folder' instead of 'directory' for consistency
  item.className = type === 'directory' ? 'folder' : type;

  const label = document.createElement('span');
  label.className = 'label';
  label.textContent = name;

  item.appendChild(label);

  // Only root folder gets expanded by default
  if (type === 'directory' && isRoot) {
    item.classList.add('open');
  }

  // Store handle for files (used by event delegation)
  if (type === 'file') {
    item._fileHandle = handle;
  }

  return item;
}

// Toggle folder expansion
function toggleFolder(folderItem) {
  folderItem.classList.toggle('open');
}

// Select and load file
async function selectFile(fileItem, fileHandle) {
  const sidebar = document.querySelector('.sidebar');

  // Remove previous selection
  if (selectedFileItem) {
    selectedFileItem.classList.remove('selected');
  }

  // Add selection to current file
  fileItem.classList.add('selected');
  selectedFileItem = fileItem;

  // Load file content
  try {
    const file = await fileHandle.getFile();
    const content = await file.text();

    // Update global file handle
    window.fileHandle = fileHandle;

    // Load XML content
    loadXmlFromText(content);

    // Update breadcrumb with file name - reset to folder + file instead of concatenating
    const folderName = elements.breadcrumb ? elements.breadcrumb.textContent.split('\\')[0] : 'No folder';
    updateBreadcrumb(`${folderName}\\${file.name}`);

    showNotification(`File "${file.name}" loaded`, 'success');

  } catch (error) {
    console.error('Error loading file:', error);
    showNotification('Failed to load file: ' + error.message, 'error');
  }
}
