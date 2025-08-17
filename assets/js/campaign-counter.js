// ---- Robust counter logic: batched sync via EDIT (handles + / -) ----
const scriptUrl = 'https://script.google.com/macros/s/AKfycbwpXpkB9pEbSOr8NtvCmBd2H4KG-PMTLqTTynIJhmJRFQD9HX3DlC8wFap2vKWCk--cIQ/exec';

const CACHE_KEY = 'campaignCounter_lastValue';
const CACHE_TIMESTAMP = 'campaignCounter_lastUpdated';
const HISTORY_CACHE_KEY = 'campaignCounter_history';

// Pending operations queue: [{op:'inc'|'dec'}]
let pendingOps = [];

// --------- UI Helpers ----------
function showCachedValue() {
  const cachedValue = localStorage.getItem(CACHE_KEY);
  const cachedTime = localStorage.getItem(CACHE_TIMESTAMP);

  if (cachedValue) {
    document.getElementById('counter-number').textContent = cachedValue;
    if (cachedTime) {
      const date = new Date(parseInt(cachedTime));
      document.getElementById('last-updated').textContent = `Last updated: ${date.toLocaleString()}`;
    }
    document.getElementById('sync-status').textContent = '✓ Cached value';
  }
}

function updateCounterUI(newValue) {
  document.getElementById('counter-number').textContent = newValue;
  document.getElementById('last-updated').textContent = `Last updated: ${new Date().toLocaleString()}`;
  document.getElementById('sync-status').textContent = '✓ Synced';
  localStorage.setItem(CACHE_KEY, newValue);
  localStorage.setItem(CACHE_TIMESTAMP, Date.now());
}

function netDelta() {
  // inc = +1, dec = -1
  return pendingOps.reduce((sum, p) => sum + (p.op === 'inc' ? 1 : -1), 0);
}

// --------- Server Sync ----------
async function updateCounter() {
  const syncStatus = document.getElementById('sync-status');

  try {
    syncStatus.textContent = '↻ Syncing...';
    document.getElementById('counter').classList.add('loading');

    const response = await fetch(scriptUrl);
    const data = await response.json();

    let currentValue = parseInt(data.result);
    // tampilkan nilai server + delta lokal (sementara, sebelum commit)
    currentValue += netDelta();

    updateCounterUI(currentValue);
    document.getElementById('counter').classList.remove('loading');
    updateHistory();
  } catch (error) {
    console.error('Error fetching counter:', error);
    syncStatus.textContent = '⚠ Failed to sync';
    document.getElementById('counter').classList.remove('loading');
  }
}

async function updateHistory() {
  try {
    const response = await fetch(`${scriptUrl}?action=history`);
    const data = await response.json();

    localStorage.setItem(HISTORY_CACHE_KEY, JSON.stringify(data.result));

    const historyList = document.getElementById('history-list');
    historyList.innerHTML = data.result.map(entry =>
      `<div class="history-item">ID: ${entry.value} - ${entry.timestamp}</div>`
    ).join('');
  } catch (error) {
    console.error('Error fetching history:', error);
    const cachedHistory = localStorage.getItem(HISTORY_CACHE_KEY);
    if (cachedHistory) {
      const history = JSON.parse(cachedHistory);
      const historyList = document.getElementById('history-list');
      historyList.innerHTML = history.map(entry =>
        `<div class="history-item">ID: ${entry.value} - ${entry.timestamp}</div>`
      ).join('');
    }
  }
}

// --------- Actions (+ / -) ----------
function addCampaignID() {
  const el = document.getElementById('counter-number');
  let v = parseInt(el.textContent) || 0;
  v++;
  el.textContent = v;

  pendingOps.push({ op: 'inc' });

  const historyList = document.getElementById('history-list');
  const timestamp = new Date().toLocaleString();
  historyList.insertAdjacentHTML(
    'afterbegin',
    `<div class="history-item">ID: ${v} - ${timestamp} (pending +)</div>`
  );

  document.getElementById('sync-status').textContent = '⚡ Pending sync...';

  localStorage.setItem(CACHE_KEY, v);
  localStorage.setItem(CACHE_TIMESTAMP, Date.now());

  syncPendingOps();
}

function decrementCampaignID() {
  const el = document.getElementById('counter-number');
  let v = parseInt(el.textContent) || 0;
  if (v <= 0) return; // jangan < 0
  v--;
  el.textContent = v;

  pendingOps.push({ op: 'dec' });

  const historyList = document.getElementById('history-list');
  const timestamp = new Date().toLocaleString();
  historyList.insertAdjacentHTML(
    'afterbegin',
    `<div class="history-item">ID: ${v} - ${timestamp} (pending -)</div>`
  );

  document.getElementById('sync-status').textContent = '⚡ Pending sync...';

  localStorage.setItem(CACHE_KEY, v);
  localStorage.setItem(CACHE_TIMESTAMP, Date.now());

  syncPendingOps();
}

// Edit counter ke nilai tertentu (langsung commit ke server)
async function editCampaignID() {
  let input = prompt('Enter new Campaign ID (number ≥ 0):');
  if (input === null) return; // user cancel

  input = String(input).trim();
  if (!/^\d+$/.test(input)) {
    alert('Please enter a valid non-negative integer.');
    return;
  }

  const newVal = parseInt(input, 10);
  const el = document.getElementById('counter-number');
  const prevVal = parseInt(el.textContent) || 0;

  // Optimistic UI + cache + history
  el.textContent = newVal;
  document.getElementById('sync-status').textContent = '↻ Updating...';
  localStorage.setItem(CACHE_KEY, newVal);
  localStorage.setItem(CACHE_TIMESTAMP, Date.now());

  const historyList = document.getElementById('history-list');
  const timestamp = new Date().toLocaleString();
  historyList.insertAdjacentHTML(
    'afterbegin',
    `<div class="history-item">ID: ${newVal} - ${timestamp} (edited)</div>`
  );

  // Clear pending ops supaya tidak menimpa hasil edit
  pendingOps = [];

  try {
    await fetch(`${scriptUrl}?action=edit&value=${encodeURIComponent(newVal)}`);
    document.getElementById('sync-status').textContent = '✓ Synced';
    await updateCounter(); // refresh dari server
  } catch (err) {
    console.error('Edit failed:', err);
    document.getElementById('sync-status').textContent = '⚠ Edit failed';
    el.textContent = prevVal; // revert UI jika gagal
  }
}


// --------- Batched sync via EDIT ----------
async function syncPendingOps() {
  if (pendingOps.length === 0) return;

  try {
    // Ambil nilai server sekarang
    const res = await fetch(scriptUrl);
    const data = await res.json();
    let serverVal = parseInt(data.result) || 0;

    // Hitung target akhir dari delta lokal
    let target = serverVal + netDelta();
    if (target < 0) target = 0;

    // Set langsung pakai EDIT sekali saja (menghindari race)
    await fetch(`${scriptUrl}?action=edit&value=${encodeURIComponent(target)}`);

    // Selesai: kosongkan queue & refresh
    pendingOps = [];
    document.getElementById('sync-status').textContent = '✓ Synced';
    await updateCounter();
  } catch (err) {
    console.error('Failed to sync pending ops:', err);
    document.getElementById('sync-status').textContent = '⚠ Pending sync failed';
  }
}

// (Opsional) reset lama untuk kompatibilitas (tidak ada tombolnya)
async function resetCounter() {
  if (confirm('Are you sure you want to reset the Campaign ID?')) {
    disableButtons(true);
    try {
      await fetch(`${scriptUrl}?action=reset`);
      pendingOps = [];
      await updateCounter();
    } catch (error) {
      console.error('Error resetting counter:', error);
      alert('Failed to reset campaign ID. Please try again.');
    } finally {
      disableButtons(false);
    }
  }
}

function disableButtons(disabled) {
  ['add-btn', 'decrement-btn', 'refresh-btn'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = disabled;
  });
}

function refreshData() {
  updateCounter();
}

// --------- Init ----------
showCachedValue();
window.addEventListener('load', () => {
  setTimeout(() => {
    updateCounter();
  }, 100);
});

// Auto-refresh setiap 30 detik
setInterval(() => {
  updateCounter();
}, 30000);
