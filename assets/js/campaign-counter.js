// Campaign Counter with Performance Optimizations
const SUPABASE_URL = 'https://neuyjcotcmjnndjyzbcq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_BGon7fPsvXNe59meFE9F4Q_SbjCa-Dp';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Edge Function URL for caching
const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/cache-proxy`;

// Performance optimization: Cache management
const CACHE_TTL = 300000; // 5 menit dalam milliseconds
const CACHE_VERSION = '1.0'; // Untuk cache invalidation

// Cache keys
const CACHE_KEY = 'campaignCounter_lastValue';
const CACHE_TIMESTAMP = 'campaignCounter_lastUpdated';
const HISTORY_CACHE_KEY = 'campaignCounter_history';
const HISTORY_LIMIT = 50;

let pendingOps = [];

// Performance: Request batching
let requestQueue = [];
let isProcessingQueue = false;

// Performance: Throttled operations
const throttle = (func, limit) => {
  let inThrottle;
  return function() {
    const args = arguments;
    const context = this;
    if (!inThrottle) {
      func.apply(context, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
};

// Performance: Debounced operations
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

// --------- Advanced Browser Caching ----------
class BrowserCache {
  constructor() {
    this.cache = new Map();
    this.timestamps = new Map();
  }

  set(key, data) {
    this.cache.set(key, data);
    this.timestamps.set(key, Date.now());
  }

  get(key) {
    const timestamp = this.timestamps.get(key);
    if (!timestamp) return null;
    
    if (Date.now() - timestamp > CACHE_TTL) {
      this.cache.delete(key);
      this.timestamps.delete(key);
      return null;
    }
    
    return this.cache.get(key);
  }

  clear() {
    this.cache.clear();
    this.timestamps.clear();
  }

  size() {
    return this.cache.size;
  }

  // Cleanup expired entries
  cleanup() {
    const now = Date.now();
    for (const [key, timestamp] of this.timestamps.entries()) {
      if (now - timestamp > CACHE_TTL) {
        this.cache.delete(key);
        this.timestamps.delete(key);
      }
    }
  }
}

const browserCache = new BrowserCache();

// Auto cleanup setiap 2 menit
setInterval(() => browserCache.cleanup(), 120000);

// Performance: Optimized cache display
const updateCacheDisplay = debounce(() => {
  const cacheSizeElement = document.getElementById('cache-size');
  if (cacheSizeElement) {
    requestAnimationFrame(() => {
      cacheSizeElement.textContent = browserCache.size();
    });
  }
}, 100);

// --------- Progress Bar Helpers ----------
function showProgress() {
  document.getElementById('progress-bar').classList.add('active');
  document.getElementById('sync-status').textContent = 'Syncing...';
  updateCacheDisplay();
}

function hideProgress() {
  document.getElementById('progress-bar').classList.remove('active');
}

// --------- UI Helpers ----------
function formatCampaignID(value) {
  return String(value).padStart(4, '0');
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  const timeFormat = localStorage.getItem('time-format-select') || '24h';
  
  if (timeFormat === '24h') {
    return date.toLocaleString('id-ID', { 
      hour12: false,
      hour: '2-digit',
      minute: '2-digit'
    });
  } else if (timeFormat === '12h') {
    return date.toLocaleString('id-ID', { 
      hour12: true,
      hour: 'numeric',
      minute: '2-digit'
    });
  } else {
    // Auto - use system preference
    return date.toLocaleString('id-ID');
  }
}

function showCachedValue() {
  const cachedValue = localStorage.getItem(CACHE_KEY);
  const cachedTime = localStorage.getItem(CACHE_TIMESTAMP);

  if (cachedValue) {
    document.getElementById('counter-number').textContent = formatCampaignID(cachedValue);
    if (cachedTime) {
      const date = new Date(parseInt(cachedTime));
      document.getElementById('last-updated').textContent = `Last updated: ${date.toLocaleString()}`;
    }
    document.getElementById('sync-status').textContent = '✓ Cached value';
  }
}

function updateCounterUI(newValue) {
  document.getElementById('counter-number').textContent = formatCampaignID(newValue);
  document.getElementById('last-updated').textContent = `Last updated: ${formatTime(Date.now())}`;
  document.getElementById('sync-status').textContent = '✓ Synced';
  localStorage.setItem(CACHE_KEY, newValue);
  localStorage.setItem(CACHE_TIMESTAMP, Date.now());
}

function netDelta() {
  return pendingOps.reduce((sum, p) => sum + (p.op === 'inc' ? 1 : -1), 0);
}

// --------- Supabase Operations ----------
async function getCounter() {
  // Check browser cache first
  const cacheKey = `counter_${CACHE_VERSION}`;
  const cached = browserCache.get(cacheKey);
  if (cached) {
    console.log('📦 Counter from browser cache');
    return cached;
  }

  console.log('🌐 Fetching counter from Supabase');
  const { data, error } = await supabaseClient
    .from('campaign_counter')
    .select('*')
    .single();

  if (error) {
    console.error('Error fetching counter:', error);
    throw error;
  }

  // Cache the result
  browserCache.set(cacheKey, data);
  return data;
}

async function setCounter(value) {
  const { data, error } = await supabaseClient
    .from('campaign_counter')
    .upsert({ id: 1, value: value, updated_at: new Date().toISOString() });

  if (error) {
    console.error('Error setting counter:', error);
    throw error;
  }

  // Invalidate counter cache
  browserCache.clear();
  console.log('🗑️ Cache invalidated after counter update');
  
  return data;
}

async function addHistory(value) {
  const { error } = await supabaseClient
    .from('campaign_history')
    .insert({
      campaign_id: value,
      timestamp: new Date().toISOString()
    });

  if (error) {
    console.error('Error adding history:', error);
  }

  // Invalidate history cache
  browserCache.clear();
  console.log('🗑️ Cache invalidated after history update');
}

// --------- Intersection Observer for Auto Load More ----------
let observer = null;
let isLoadingMore = false;

function setupIntersectionObserver() {
  const loadMoreBtn = document.getElementById('load-more-btn');
  if (!loadMoreBtn) return;

  observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && !isLoadingMore) {
        loadMoreHistory();
      }
    });
  }, {
    root: null,
    rootMargin: '100px',
    threshold: 0.1
  });

  observer.observe(loadMoreBtn);
}

// --------- History Pagination ----------
let historyOffset = 0;

async function getHistory(offset = 0) {
  const cacheKey = `history_${offset}_${CACHE_VERSION}`;
  const cached = browserCache.get(cacheKey);
  if (cached) {
    console.log(`📦 History page ${Math.floor(offset/HISTORY_LIMIT)+1} from browser cache`);
    return cached;
  }

  console.log(`🌐 Fetching history page ${Math.floor(offset/HISTORY_LIMIT)+1} from Supabase`);
  const { data, error } = await supabaseClient
    .from('campaign_history')
    .select('*')
    .order('timestamp', { ascending: false })
    .range(offset, offset + HISTORY_LIMIT - 1);

  if (error) {
    console.error('Error fetching history:', error);
    throw error;
  }

  // Cache the result
  browserCache.set(cacheKey, data);
  return data;
}

async function loadMoreHistory() {
  if (isLoadingMore) return;
  
  isLoadingMore = true;
  historyOffset += HISTORY_LIMIT;
  const loadMoreBtn = document.getElementById('load-more-btn');
  loadMoreBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Loading...';
  
  try {
    const moreHistory = await getHistory(historyOffset);
    const historyList = document.getElementById('history-list');
    
    moreHistory.forEach(entry => {
      const historyItem = document.createElement('div');
      historyItem.className = 'history-item';
      historyItem.innerHTML = `
        <i class="fa-solid fa-check" style="color: #10b981;"></i>
        <div>
          <strong>Campaign ID: ${formatCampaignID(entry.campaign_id)}</strong>
          <time>${formatTime(new Date(entry.timestamp))}</time>
        </div>
      `;
      historyList.appendChild(historyItem);
    });
    
    if (moreHistory.length < HISTORY_LIMIT) {
      loadMoreBtn.style.display = 'none';
      if (observer) observer.disconnect();
    } else {
      loadMoreBtn.innerHTML = 'Load More';
    }
  } catch (error) {
    console.error('Error loading more history:', error);
    loadMoreBtn.innerHTML = 'Load More';
  } finally {
    isLoadingMore = false;
  }
}

// --------- Server Sync with Performance Optimizations ----------
async function updateCounter() {
  // Check authentication for viewing (guest can view)
  if (!auth.hasPermission('view')) {
    auth.showNotification('Access denied', 'error');
    return;
  }

  // Performance: Throttle UI updates
  const updateUI = throttle(() => {
    showProgress();
  }, 100);

  updateUI();

  try {
    // Performance: Batch operations with faster timeout
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Timeout')), 3000)
    );
    
    const [counterData, historyData] = await Promise.race([
      Promise.all([getCounter(), getHistory(0)]),
      timeoutPromise
    ]);

    let currentValue = counterData?.value || 0;
    
    // Apply pending operations to maintain sequence
    if (pendingOps.length > 0) {
      pendingOps.forEach(op => {
        if (op.op === 'inc') currentValue++;
        else if (op.op === 'dec') currentValue--;
        else if (op.op === 'set' && op.value !== undefined) currentValue = Math.max(0, op.value);
      });
      currentValue = Math.max(0, currentValue);
    }

    // Performance: Batch DOM updates with requestAnimationFrame
    requestAnimationFrame(() => {
      updateCounterUI(currentValue);
      updateHistoryDisplay(historyData);
      document.getElementById('sync-status').textContent = '✓ Synced';
    });
  } catch (error) {
    console.error('Error fetching counter:', error);
    document.getElementById('sync-status').textContent = '⚠ Failed to sync';
    // Fallback to cached value
    const cachedValue = localStorage.getItem(CACHE_KEY);
    if (cachedValue) {
      updateCounterUI(parseInt(cachedValue));
    }
  } finally {
    hideProgress();
  }
}

// Performance: Optimized history display
function updateHistoryDisplay(historyData) {
  const historyList = document.getElementById('history-list');
  if (!historyList) return;
  
  // Performance: Use DocumentFragment for batch DOM updates
  const fragment = document.createDocumentFragment();
  
  historyData.forEach(entry => {
    const historyItem = document.createElement('div');
    historyItem.className = 'history-item';
    historyItem.innerHTML = `
      <i class="fa-solid fa-check" style="color: #10b981;"></i>
      <div>
        <strong>Campaign ID: ${formatCampaignID(entry.campaign_id)}</strong>
        <time>${new Date(entry.timestamp).toLocaleString()}</time>
      </div>
    `;
    fragment.appendChild(historyItem);
  });
  
  // Performance: Single DOM operation
  historyList.innerHTML = '';
  historyList.appendChild(fragment);
  
  // Show/hide load more button
  const loadMoreBtn = document.getElementById('load-more-btn');
  if (historyData.length < HISTORY_LIMIT) {
    loadMoreBtn.style.display = 'none';
  } else {
    loadMoreBtn.style.display = 'block';
  }
}

async function updateHistory(append = false) {
  try {
    // Reset offset for full sync
    const offset = append ? historyOffset : 0;
    const history = await getHistory(offset);
    
    if (!append) {
      localStorage.setItem(HISTORY_CACHE_KEY, JSON.stringify(history));
      const historyList = document.getElementById('history-list');
      historyList.innerHTML = history.map(entry =>
        `<div class="history-item">
          <i class="fa-solid fa-check" style="color: #10b981;"></i>
          <div>
            <strong>Campaign ID: ${formatCampaignID(entry.campaign_id)}</strong>
            <time>${new Date(entry.timestamp).toLocaleString()}</time>
          </div>
        </div>`
      ).join('');
    }
    
    // Show/hide load more button
    const loadMoreBtn = document.getElementById('load-more-btn');
    if (history.length < HISTORY_LIMIT) {
      loadMoreBtn.style.display = 'none';
    } else {
      loadMoreBtn.style.display = 'block';
    }
  } catch (error) {
    console.error('Error fetching history:', error);
    const cachedHistory = localStorage.getItem(HISTORY_CACHE_KEY);
    if (cachedHistory) {
      const history = JSON.parse(cachedHistory);
      const historyList = document.getElementById('history-list');
      historyList.innerHTML = history.map(entry =>
        `<div class="history-item">
          <i class="fa-solid fa-check" style="color: #10b981;"></i>
          <div>
            <strong>Campaign ID: ${formatCampaignID(entry.campaign_id)}</strong>
            <time>${new Date(entry.timestamp).toLocaleString()}</time>
          </div>
        </div>`
      ).join('');
    }
  }
}

// --------- Actions (+ / -) with Performance Optimizations ----------
function addCampaignID() {
  // Check authentication and permissions
  if (!auth.hasPermission('generate')) {
    auth.showNotification('Please login to generate Campaign ID', 'warning');
    return;
  }

  // Prevent double clicks
  const addBtn = document.getElementById('add-btn');
  if (addBtn.disabled) return;
  
  // Get current value and increment immediately for better UX
  const el = document.getElementById('counter-number');
  let currentVal = parseInt(el.textContent) || 0;
  let newVal = currentVal + 1;
  const newCampaignId = formatCampaignID(newVal);
  
  // Performance: Immediate UI update
  requestAnimationFrame(() => {
    el.textContent = newCampaignId;
    document.getElementById('sync-status').textContent = '⚡ Syncing...';
  });

  // Add to pending operations
  pendingOps.push({ op: 'inc', timestamp: Date.now() });

  // Performance: Optimized history insertion
  const historyList = document.getElementById('history-list');
  const timestamp = new Date().toLocaleString('en-GB', { hour12: false });
  const historyItem = document.createElement('div');
  historyItem.className = 'history-item';
  historyItem.innerHTML = `
    <i class="fa-solid fa-spinner fa-spin"></i>
    <div>
      <strong>Campaign ID: ${newCampaignId}</strong>
      <time>${timestamp}</time>
    </div>
  `;
  
  // Performance: Insert at beginning with single operation
  historyList.insertBefore(historyItem, historyList.firstChild);

  // Update cache immediately for better performance
  localStorage.setItem(CACHE_KEY, newVal);
  localStorage.setItem(CACHE_TIMESTAMP, Date.now());

  // Performance: Fast sync with debouncing
  throttledSyncPendingOps();
}

function decrementCampaignID() {
  // Check authentication and permissions
  if (!auth.hasPermission('edit')) {
    auth.showNotification('Please login to revert Campaign ID', 'warning');
    return;
  }

  // Prevent double clicks
  const decrementBtn = document.getElementById('decrement-btn');
  if (decrementBtn.disabled) return;
  
  const el = document.getElementById('counter-number');
  let currentVal = parseInt(el.textContent) || 0;
  if (currentVal <= 0) return;
  
  let newVal = currentVal - 1;
  const newCampaignId = formatCampaignID(newVal);
  
  // Performance: Immediate UI update
  requestAnimationFrame(() => {
    el.textContent = newCampaignId;
    document.getElementById('sync-status').textContent = '⚡ Syncing...';
  });

  pendingOps.push({ op: 'dec', timestamp: Date.now() });

  // Performance: Optimized history insertion
  const historyList = document.getElementById('history-list');
  const timestamp = new Date().toLocaleString('en-GB', { hour12: false });
  const historyItem = document.createElement('div');
  historyItem.className = 'history-item';
  historyItem.innerHTML = `
    <i class="fa-solid fa-spinner fa-spin"></i>
    <div>
      <strong>Campaign ID: ${newCampaignId}</strong>
      <time>${timestamp}</time>
    </div>
  `;
  
  // Performance: Insert at beginning with single operation
  historyList.insertBefore(historyItem, historyList.firstChild);

  // Update cache immediately for better performance
  localStorage.setItem(CACHE_KEY, newVal);
  localStorage.setItem(CACHE_TIMESTAMP, Date.now());

  // Performance: Fast sync with debouncing
  throttledSyncPendingOps();
}

async function editCampaignID() {
  // Check authentication and permissions
  if (!auth.hasPermission('edit')) {
    auth.showNotification('Please login to edit Campaign ID', 'warning');
    return;
  }
  
  openEditModal();
}

function openEditModal() {
  document.getElementById('modal-input').value = '';
  document.getElementById('edit-modal').classList.add('active');
  document.getElementById('modal-input').focus();
}

function closeEditModal() {
  document.getElementById('edit-modal').classList.remove('active');
}

async function confirmEditCampaignID() {
  const input = document.getElementById('modal-input').value.trim();
  
  if (!input || !/^\d+$/.test(input)) {
    alert('Please enter a valid non-negative integer.');
    return;
  }

  const newVal = parseInt(input, 10);
  const el = document.getElementById('counter-number');
  const prevVal = parseInt(el.textContent) || 0;

  closeEditModal();
  
  el.textContent = formatCampaignID(newVal);
  document.getElementById('sync-status').textContent = '↻ Saving...';
  localStorage.setItem(CACHE_KEY, newVal);
  localStorage.setItem(CACHE_TIMESTAMP, Date.now());

  const historyList = document.getElementById('history-list');
  const timestamp = new Date().toLocaleString('en-GB', { hour12: false });
  historyList.insertAdjacentHTML(
    'afterbegin',
    `<div class="history-item">
      <i class="fa-solid fa-spinner fa-spin"></i>
      <div>
        <strong>Campaign ID: ${formatCampaignID(newVal)}</strong>
        <time>${timestamp}</time>
      </div>
    </div>`
  );

  pendingOps = [];

  try {
    showProgress();
    await setCounter(newVal);
    await addHistory(newVal);
    document.getElementById('sync-status').textContent = '✓ Synced';
    hideProgress();
    await updateCounter();
  } catch (err) {
    console.error('Edit failed:', err);
    document.getElementById('sync-status').textContent = '⚠ Edit failed';
    hideProgress();
    el.textContent = formatCampaignID(prevVal);
  }
}

// Close modal on escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeEditModal();
  if (e.key === 'Enter' && document.getElementById('edit-modal').classList.contains('active')) {
    confirmEditCampaignID();
  }
});

// Close modal on overlay click
document.getElementById('edit-modal').addEventListener('click', (e) => {
  if (e.target.id === 'edit-modal') closeEditModal();
});

// Performance: Optimized sync with real-time updates
const throttledSyncPendingOps = throttle(async () => {
  if (pendingOps.length === 0) return;
  
  // Performance: Disable buttons during sync
  disableButtons(true);
  
  try {
    showProgress();
    
    // Performance: Get latest server value first
    const data = await getCounter();
    let serverVal = data?.value || 0;
    
    // Calculate target value with proper sequence
    let target = serverVal;
    
    // Process operations in order to maintain sequence
    pendingOps.forEach(op => {
      if (op.op === 'inc') {
        target++;
      } else if (op.op === 'dec') {
        target--;
      } else if (op.op === 'set' && op.value !== undefined) {
        target = Math.max(0, op.value);
      }
    });
    
    // Ensure target is not negative
    target = Math.max(0, target);
    
    // Performance: Batch operations
    const [counterResult, historyResult] = await Promise.all([
      setCounter(target),
      addHistory(target)
    ]);
    
    // Clear pending operations
    pendingOps = [];
    
    // Performance: Update UI immediately
    requestAnimationFrame(() => {
      updateCounterUI(target);
      document.getElementById('sync-status').textContent = '✓ Synced';
    });
    
    // Update cache
    localStorage.setItem(CACHE_KEY, target);
    localStorage.setItem(CACHE_TIMESTAMP, Date.now());
    
    // Refresh history to show latest
    await updateHistory();
    
  } catch (err) {
    console.error('Failed to sync pending ops:', err);
    document.getElementById('sync-status').textContent = '⚠ Pending sync failed';
  } finally {
    hideProgress();
    // Re-enable buttons after sync
    disableButtons(false);
  }
}, 500); // Faster sync - 500ms instead of 1000ms

// --------- Batched sync ----------
async function syncPendingOps() {
  if (pendingOps.length === 0) return;

  // Disable buttons during sync
  disableButtons(true);

  try {
    showProgress();
    const data = await getCounter();
    let serverVal = data?.value || 0;

    let target = serverVal + netDelta();
    if (target < 0) target = 0;

    await setCounter(target);
    await addHistory(target);

    pendingOps = [];
    document.getElementById('sync-status').textContent = '✓ Synced';
    hideProgress();
    await updateCounter();
  } catch (err) {
    console.error('Failed to sync pending ops:', err);
    document.getElementById('sync-status').textContent = '⚠ Pending sync failed';
    hideProgress();
  } finally {
    // Re-enable buttons after sync
    disableButtons(false);
  }
}

async function resetCounter() {
  if (confirm('Are you sure you want to reset the Campaign ID?')) {
    disableButtons(true);
    try {
      await setCounter(0);
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
    if (el) {
      el.disabled = disabled;
      // Only override visual state if user is not logged in
      if (!auth.getCurrentUser()) {
        el.style.opacity = disabled ? '0.5' : '1';
        el.style.cursor = disabled ? 'not-allowed' : 'pointer';
      }
    }
  });
  
  // Add visual feedback for disabled state
  const addBtn = document.getElementById('add-btn');
  const decrementBtn = document.getElementById('decrement-btn');
  if (addBtn && auth.getCurrentUser()) {
    addBtn.style.opacity = disabled ? '0.5' : '1';
    addBtn.style.cursor = disabled ? 'not-allowed' : 'pointer';
  }
  if (decrementBtn && auth.getCurrentUser()) {
    decrementBtn.style.opacity = disabled ? '0.5' : '1';
    decrementBtn.style.cursor = disabled ? 'not-allowed' : 'pointer';
  }
}

function refreshData() {
  updateCounter();
}

// Check settings access
function checkSettingsAccess() {
  if (!auth.getCurrentUser()) {
    auth.showNotification('Anda harus login untuk mengakses pengaturan', 'warning');
    return false;
  }
  
  // User is logged in, check if they have settings permission
  if (auth.hasPermission('settings')) {
    window.location.href = 'settings.html';
    return true;
  }
  
  auth.showNotification('Anda tidak memiliki akses ke pengaturan', 'warning');
  return false;
}

// --------- Performance Optimized Init ----------
showCachedValue();

// Performance: Lazy initialization with Intersection Observer
const initWhenVisible = () => {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        observer.disconnect();
        initializeApp();
      }
    });
  }, { threshold: 0.1 });
  
  observer.observe(document.body);
};

// Performance: Optimized initialization
function initializeApp() {
  // Performance: Batch initialization
  requestAnimationFrame(() => {
    updateCounter();
    setupIntersectionObserver();
    updateCacheDisplay();
  });
}

// Performance: Use requestIdleCallback for non-critical tasks
const setupNonCriticalTasks = () => {
  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => {
      // Auto-refresh setiap 30 detik
      setInterval(() => {
        updateCounter();
      }, 30000);
    });
  } else {
    // Fallback for older browsers
    setTimeout(() => {
      setInterval(() => {
        updateCounter();
      }, 30000);
    }, 1000);
  }
};

// Start initialization
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initWhenVisible);
} else {
  initWhenVisible();
}

// Setup non-critical tasks
setupNonCriticalTasks();

