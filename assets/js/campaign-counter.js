
// ---- Extracted scripts from inline <script> blocks ----
const scriptUrl = 'https://script.google.com/macros/s/AKfycbyDT--aJ_-nrpkhqeuTFPQkQk07XDOCQVaLs14cOGuIfEx9uH0es3j1pHrk7j6NRheYJQ/exec';

  const CACHE_KEY = 'campaignCounter_lastValue';
  const CACHE_TIMESTAMP = 'campaignCounter_lastUpdated';
  const HISTORY_CACHE_KEY = 'campaignCounter_history';

  // Queue lokal untuk campaign ID yang belum di-sync
  let pendingCampaigns = [];

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

  async function updateCounter() {
    const counterElement = document.getElementById('counter-number');
    const syncStatus = document.getElementById('sync-status');

    try {
      syncStatus.textContent = '↻ Syncing...';
      document.getElementById('counter').classList.add('loading');

      const response = await fetch(scriptUrl);
      const data = await response.json();

      let currentValue = parseInt(data.result);
      // Tambahkan semua pending campaigns lokal
      currentValue += pendingCampaigns.length;

      updateCounterUI(currentValue);
      pendingCampaigns = []; // kosongkan queue setelah update

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
      // Tampilkan cached history
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

  function addCampaignID() {
    // Tambah cepat ke counter lokal
    const counterElement = document.getElementById('counter-number');
    let currentValue = parseInt(counterElement.textContent) || 0;
    currentValue++;
    counterElement.textContent = currentValue;

    // Tambahkan ke pending queue
    pendingCampaigns.push(currentValue);

    // Tambahkan ke history lokal
    const historyList = document.getElementById('history-list');
    const timestamp = new Date().toLocaleString();
    historyList.insertAdjacentHTML('afterbegin', `<div class="history-item">ID: ${currentValue} - ${timestamp} (pending)</div>`);

    document.getElementById('sync-status').textContent = '⚡ Pending sync...';

    // Simpan cache lokal sementara
    localStorage.setItem(CACHE_KEY, currentValue);
    localStorage.setItem(CACHE_TIMESTAMP, Date.now());

    // Async sync ke server, tapi jangan block UI
    syncPendingCampaigns();
  }

  async function syncPendingCampaigns() {
    if (pendingCampaigns.length === 0) return;

    try {
      // Kirim semua pending campaigns satu per satu atau batched
      for (const _id of pendingCampaigns) {
        await fetch(`${scriptUrl}?action=increment`);
      }
      pendingCampaigns = [];
      document.getElementById('sync-status').textContent = '✓ Synced';
    } catch (err) {
      console.error('Failed to sync pending campaigns:', err);
      document.getElementById('sync-status').textContent = '⚠ Pending sync failed';
    }
  }

  async function resetCounter() {
    if (confirm('Are you sure you want to reset the Campaign ID?')) {
      disableButtons(true);
      try {
        await fetch(`${scriptUrl}?action=reset`);
        pendingCampaigns = [];
        await updateCounter();
      } catch (error) {
        console.error('Error resetting counter:', error);
        alert('Failed to reset campaign ID. Please try again.');
      } finally {
        disableButtons(false);
      }
    }
  }

  async function editCampaignID() {
    const newID = prompt('Enter the new Campaign ID:');
    if (newID !== null && !isNaN(newID)) {
      disableButtons(true);
      try {
        await fetch(`${scriptUrl}?action=edit&value=${newID}`);
        pendingCampaigns = [];
        await updateCounter();
      } catch (error) {
        console.error('Error editing campaign ID:', error);
        alert('Failed to edit campaign ID. Please try again.');
      } finally {
        disableButtons(false);
      }
    } else if (newID !== null) {
      alert('Please enter a valid number.');
    }
  }

  function disableButtons(disabled) {
    document.getElementById('add-btn').disabled = disabled;
    document.getElementById('reset-btn').disabled = disabled;
    document.getElementById('refresh-btn').disabled = disabled;
  }

  function refreshData() {
    updateCounter();
  }

  // Initialize
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
