
// ---- Extracted scripts from inline <script> blocks ----
const CHUNK_SIZE = 1024 * 1024; // 1MB chunks
const LINES_PER_PAGE = 1000;
const MAX_MEMORY_USAGE = 100 * 1024 * 1024; // 100MB threshold

class FileProcessor {
  constructor() {
    this.reset();
  }

  reset() {
    this.currentFile = null;
    this.fileContent = '';
    this.processedLines = [];
    this.currentOffset = 0;
    this.isProcessing = false;
    this.totalSize = 0;
    this.loadedSize = 0;
    this.currentLineCount = 0;
  }

  async processChunk(chunk) {
    const text = await chunk.text();
    const lines = text.split('\n');
    
    // Handle partial line from previous chunk
    if (this.partialLine) {
      lines[0] = this.partialLine + lines[0];
      this.partialLine = '';
    }

    // Save partial line for next chunk
    if (!chunk.done) {
      this.partialLine = lines.pop();
    }

    return lines;
  }

  updateProgress() {
    const percent = (this.loadedSize / this.totalSize) * 100;
    const loadingWrapper = document.getElementById('loadingWrapper');
    if (loadingWrapper) {
      loadingWrapper.style.visibility = 'visible';
      document.getElementById('progressText').textContent = `${Math.round(percent)}%`;
    }
  }

  async readFile(file, onProgress) {
    this.reset();
    this.currentFile = file;
    this.totalSize = file.size;
    
    const reader = new ReadableStreamDefaultReader(file.stream());
    const decoder = new TextDecoder();
    
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        this.loadedSize += value.length;
        const text = decoder.decode(value, { stream: !done });
        this.fileContent += text;
        
        this.updateProgress();
        if (onProgress) onProgress(this.loadedSize, this.totalSize);
        
        // Process in smaller chunks to avoid UI blocking
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    } finally {
      reader.releaseLock();
    }
    
    const loadingWrapper = document.getElementById('loadingWrapper');
    if (loadingWrapper) {
      loadingWrapper.style.visibility = 'hidden';
    }
    return this.fileContent;
  }
}

class VirtualScroller {
  constructor(container, itemHeight = 20) {
    this.container = container;
    this.content = container.querySelector('.virtual-scroll-content');
    this.itemHeight = itemHeight;
    this.items = [];
    this.visibleItems = new Set();
    this.lastScrollPosition = 0;
    
    this.container.addEventListener('scroll', this.onScroll.bind(this));
    this.resizeObserver = new ResizeObserver(() => this.updateVisibleItems());
    this.resizeObserver.observe(this.container);
  }

  setItems(items) {
    this.items = items;
    this.content.style.height = `${items.length * this.itemHeight}px`;
    this.updateVisibleItems();
  }

  updateVisibleItems() {
    const scrollTop = this.container.scrollTop;
    const viewportHeight = this.container.clientHeight;
    
    const startIndex = Math.floor(scrollTop / this.itemHeight);
    const endIndex = Math.min(
      Math.ceil((scrollTop + viewportHeight) / this.itemHeight),
      this.items.length
    );
    
    const fragment = document.createDocumentFragment();
    const newVisibleItems = new Set();
    
    for (let i = startIndex; i < endIndex; i++) {
      newVisibleItems.add(i);
      if (!this.visibleItems.has(i)) {
        const div = document.createElement('div');
        div.style.position = 'absolute';
        div.style.top = `${i * this.itemHeight}px`;
        div.style.width = '100%';
        div.style.height = `${this.itemHeight}px`;
        div.textContent = this.items[i];
        fragment.appendChild(div);
      }
    }
    
    // Remove items that are no longer visible
    this.content.querySelectorAll('div').forEach(div => {
      const index = Math.floor(parseInt(div.style.top) / this.itemHeight);
      if (!newVisibleItems.has(index)) {
        div.remove();
      }
    });
    
    this.content.appendChild(fragment);
    this.visibleItems = newVisibleItems;
  }

  onScroll() {
    if (Math.abs(this.container.scrollTop - this.lastScrollPosition) > this.itemHeight) {
      this.updateVisibleItems();
      this.lastScrollPosition = this.container.scrollTop;
    }
  }

  destroy() {
    this.resizeObserver.disconnect();
    this.container.removeEventListener('scroll', this.onScroll);
  }
}

class DatabaseChecker {
  constructor() {
    this.fileProcessor = new FileProcessor();
    this.virtualScroller = new VirtualScroller(document.getElementById('databaseContent'));
    this.setupEventListeners();
    this.currentLines = [];
    this.processedLinesCount = 0;
  }

  setupEventListeners() {
    document.getElementById('folderOpenBtn').addEventListener('click', () => this.openFolder());
    this.checkBtn = document.getElementById('checkBtn');
    this.checkBtn.addEventListener('click', () => {
      if (this.isChecking) {
        this.stopChecking();
      } else {
        this.checkDatabase();
      }
    });
    document.getElementById('loadMoreBtn').addEventListener('click', () => this.loadMore());
  }

  async checkDatabase() {
    if (this.currentLines.length === 0) {
      alert('Please load a file first');
      return;
    }
    console.log('checkDatabase started');
    this.isChecking = true;
    this.updateCheckButton();
    this.showLoading(true);

    const unitsSet = new Set();
    const emptyDataUnits = new Set();
    const unitDetails = new Map();

    const chunkSize = 1000;
    this._stopRequested = false;

    for (let i = 0; i < this.currentLines.length; i += chunkSize) {
      if (this._stopRequested) {
        break;
      }
      const chunk = this.currentLines.slice(i, Math.min(i + chunkSize, this.currentLines.length));

      chunk.forEach((line, index) => {
        const parts = line.split('|');
        if (parts.length > 2) {
          const unit = parts[2].trim();
          const dataFieldRaw = parts[3] || '';
          const dataField = dataFieldRaw.trim();

          if (/^KRHRED_Unit_\d+$/i.test(unit)) {
            unitsSet.add(unit);
            if (dataField === '' || dataFieldRaw !== dataField) {
              emptyDataUnits.add(unit);
              if (!unitDetails.has(unit)) {
                unitDetails.set(unit, []);
              }
              unitDetails.get(unit).push({
                lineNumber: i + index + 1,
                lineText: line
              });
            }
          }
        }
      });

      this.updateProgress(Math.min(i + chunkSize, this.currentLines.length), this.currentLines.length);
      await new Promise(resolve => setTimeout(resolve, 0));
    }

    this.displayResults(unitsSet, emptyDataUnits, unitDetails);
    this.showLoading(false);
  }

  stopChecking() {
    this._stopRequested = true;
    this.isChecking = false;
    this.updateCheckButton();
    this.showLoading(false);
  }

  updateCheckButton() {
    console.log('updateCheckButton called, isChecking:', this.isChecking);
    if (this.isChecking) {
      this.checkBtn.textContent = 'Stop';
      // Hide processing indicator when button is Stop
      const loadingIndicator = document.getElementById('loadingIndicator');
      if (loadingIndicator) {
        loadingIndicator.style.display = 'none';
      }
    } else {
      this.checkBtn.textContent = 'Check';
      // Show processing indicator when button is Check
      const loadingIndicator = document.getElementById('loadingIndicator');
      if (loadingIndicator) {
        loadingIndicator.style.display = 'inline-block';
      }
    }
  }

  showLoading(show) {
    const loadingWrapper = document.getElementById('loadingWrapper');
    if (loadingWrapper !== null) {
      loadingWrapper.style.visibility = show ? 'visible' : 'hidden';
    }
  }

  updateProgress(current, total) {
    const percent = (current / total) * 100;
    const loadingWrapper = document.getElementById('loadingWrapper');
    if (loadingWrapper) {
      loadingWrapper.style.visibility = 'visible';
      document.getElementById('progressText').textContent = `${Math.round(percent)}%`;
    }
  }

  async openFolder() {
    try {
      const dirHandle = await window.showDirectoryPicker();
      await this.buildFileTree(dirHandle);
    } catch (err) {
      console.error('Error opening folder:', err);
      alert('Error opening folder: ' + err.message);
    }
  }

  async buildFileTree(dirHandle, parentUl = document.getElementById('fileList').querySelector('ul')) {
    parentUl.innerHTML = '';
    const entries = [];
    for await (const entry of dirHandle.values()) {
      entries.push(entry);
    }
    
    entries.sort((a, b) => a.name.localeCompare(b.name));
    
    const fragment = document.createDocumentFragment();
    for (const entry of entries) {
      const li = document.createElement('li');
      li.textContent = entry.name;
      li.title = entry.name;
      
      if (entry.kind === 'directory') {
        // Skip folders entirely - do not add to sidebar
        continue;
      } else if (entry.kind === 'file' && entry.name.includes('CustAttr.txt')) {
        li.classList.add('file');
        li.addEventListener('click', async (e) => {
          e.stopPropagation();
          await this.loadFile(entry);
          document.querySelectorAll('#fileList li').forEach(el => el.classList.remove('selected'));
          li.classList.add('selected');
        });
      } else {
        continue;
      }
      
      fragment.appendChild(li);
    }
    
    parentUl.appendChild(fragment);
  }

  clearResults() {
    // Clear previous results
    document.getElementById('krhredResults').innerHTML = '';
    document.getElementById('krhredDetails').innerHTML = '';
    document.getElementById('loadMoreBtn').style.display = 'none';
  }

  async loadFile(fileHandle) {
    try {
      // Clear previous results first
      this.clearResults();
      
      this.showLoading(true);
      const file = await fileHandle.getFile();
      
      if (file.size > MAX_MEMORY_USAGE) {
        if (!confirm(`This file is large (${(file.size / 1024 / 1024).toFixed(1)}MB). Loading it may affect performance. Continue?`)) {
          this.showLoading(false);
          return;
        }
      }
      
      const content = await this.fileProcessor.readFile(file, (loaded, total) => {
        this.updateProgress(loaded, total);
      });
      
      this.currentLines = content.split('\n');
      this.processedLinesCount = Math.min(this.currentLines.length, LINES_PER_PAGE);
      this.virtualScroller.setItems([]); // Clear previous items first
      this.virtualScroller.setItems(this.currentLines.slice(0, this.processedLinesCount));
      
      document.getElementById('loadMoreBtn').style.display = 
        this.currentLines.length > LINES_PER_PAGE ? 'block' : 'none';
      
    } catch (err) {
      console.error('Error loading file:', err);
      alert('Error loading file: ' + err.message);
    } finally {
      this.showLoading(false);
    }
  }

  loadMore() {
    const nextBatch = this.currentLines.slice(
      this.processedLinesCount,
      this.processedLinesCount + LINES_PER_PAGE
    );
    
    if (nextBatch.length > 0) {
      this.processedLinesCount += nextBatch.length;
      this.virtualScroller.setItems(this.currentLines.slice(0, this.processedLinesCount));
      
      document.getElementById('loadMoreBtn').style.display =
        this.processedLinesCount < this.currentLines.length ? 'block' : 'none';
    }
  }

  async checkDatabase() {
    if (this.currentLines.length === 0) {
      alert('Please load a file first');
      return;
    }
    
    this.showLoading(true);
    const unitsSet = new Set();
    const emptyDataUnits = new Set();
    const unitDetails = new Map();
    
    // Process in chunks to avoid UI blocking
    const chunkSize = 1000;
    for (let i = 0; i < this.currentLines.length; i += chunkSize) {
      const chunk = this.currentLines.slice(i, Math.min(i + chunkSize, this.currentLines.length));
      
      chunk.forEach((line, index) => {
        const parts = line.split('|');
        if (parts.length > 2) {
          const unit = parts[2].trim();
          const dataFieldRaw = parts[3] || '';
          const dataField = dataFieldRaw.trim();
          
          if (/^KRHRED_Unit_\d+$/i.test(unit)) {
            unitsSet.add(unit);
            if (dataField === '' || dataFieldRaw !== dataField) {
              emptyDataUnits.add(unit);
              if (!unitDetails.has(unit)) {
                unitDetails.set(unit, []);
              }
              unitDetails.get(unit).push({
                lineNumber: i + index + 1,
                lineText: line
              });
            }
          }
        }
      });
      
      this.updateProgress(Math.min(i + chunkSize, this.currentLines.length), this.currentLines.length);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    
    this.displayResults(unitsSet, emptyDataUnits, unitDetails);
    this.showLoading(false);
  }

  displayResults(unitsSet, emptyDataUnits, unitDetails) {
    const matches = Array.from(unitsSet).sort((a, b) => {
      const numA = parseInt(a.match(/\d+/)[0], 10);
      const numB = parseInt(b.match(/\d+/)[0], 10);
      return numA - numB;
    });
    
    const resultsDiv = document.getElementById('krhredResults');
    const detailsDiv = document.getElementById('krhredDetails');
    
    const totalDatabaseCount = this.countUniqueCMPGIDs(this.currentLines);
    
    if (matches.length > 0) {
      const fragment = document.createDocumentFragment();
      const container = document.createElement('div');
      container.style.cssText = 'display: flex; flex-wrap: wrap; max-height: 10em; overflow-y: auto; gap: 8px; margin-top: 8px;';
      
      matches.forEach(unit => {
        const span = document.createElement('span');
        span.style.cssText = `
          color: ${emptyDataUnits.has(unit) ? 'red' : 'green'};
          padding: 2px 6px;
          border-radius: 4px;
          background-color: ${emptyDataUnits.has(unit) ? '#ffe0e0' : '#e0ffe0'};
        `;
        span.textContent = unit;
        container.appendChild(span);
      });
      
      fragment.appendChild(container);
      resultsDiv.innerHTML = '';
      resultsDiv.appendChild(fragment);

      // Add total database info below KRHRED units
      const totalDatabaseDiv = document.createElement('div');
      totalDatabaseDiv.style.cssText = 'margin-top: 10px; font-weight: normal;';
      totalDatabaseDiv.textContent = `Total database: ${totalDatabaseCount}`;
      resultsDiv.appendChild(totalDatabaseDiv);
      
      // Display details for empty units
      const detailsFragment = document.createDocumentFragment();
      const header = document.createElement('h3');
      header.textContent = 'KRHRED Unit Details';
      detailsFragment.appendChild(header);
      
      Array.from(emptyDataUnits)
        .sort((a, b) => {
          const numA = parseInt(a.match(/\d+/)[0], 10);
          const numB = parseInt(b.match(/\d+/)[0], 10);
          return numA - numB;
        })
        .forEach(unit => {
          const details = unitDetails.get(unit);
          const unitDiv = document.createElement('div');
          unitDiv.innerHTML = `<strong>${unit}</strong>:`;
          detailsFragment.appendChild(unitDiv);
          
          details.forEach(d => {
            const lineDiv = document.createElement('div');
            lineDiv.style.cssText = 'font-family: monospace; white-space: pre-wrap;';
            lineDiv.textContent = `Line ${d.lineNumber}: ${d.lineText}`;
            detailsFragment.appendChild(lineDiv);
          });
        });
      
      detailsDiv.innerHTML = '';
      detailsDiv.appendChild(detailsFragment);
    } else {
      // Show total database count even if no KRHRED units found
      resultsDiv.textContent = `Total database: ${totalDatabaseCount}`;
      detailsDiv.textContent = '';
    }
  }

  countUniqueCMPGIDs(lines) {
    const cmpgIDs = new Set();
    lines.forEach(line => {
      const parts = line.split('|');
      if (parts.length > 0) {
        const cmpgID = parts[0].trim();
        if (cmpgID) {
          cmpgIDs.add(cmpgID);
        }
      }
    });
    return cmpgIDs.size;
  }

}

// Initialize the application
const app = new DatabaseChecker();

// Clean up on page unload
window.addEventListener('beforeunload', () => {
  app.virtualScroller.destroy();
});

// State persistence - simple approach
function saveState() {
  const state = {
    hasLoadedFile: app.currentLines.length > 0,
    resultsHTML: document.getElementById('krhredResults').innerHTML,
    detailsHTML: document.getElementById('krhredDetails').innerHTML
  };
  localStorage.setItem('databaseChecker_state', JSON.stringify(state));
}

function loadState() {
  const saved = localStorage.getItem('databaseChecker_state');
  if (saved) {
    try {
      const state = JSON.parse(saved);
      
      // Restore results if available
      if (state.resultsHTML) {
        document.getElementById('krhredResults').innerHTML = state.resultsHTML;
      }
      if (state.detailsHTML) {
        document.getElementById('krhredDetails').innerHTML = state.detailsHTML;
      }
      
      // Show message if file was loaded before
      if (state.hasLoadedFile) {
        const folderBtn = document.getElementById('folderOpenBtn');
        folderBtn.textContent = 'Reopen Folder';
        folderBtn.style.backgroundColor = '#ff6b6b';
      }
    } catch (e) {
      console.error('Error loading state:', e);
    }
  }
}

// Load state when page loads
window.addEventListener('load', loadState);

// Save state before leaving page
window.addEventListener('beforeunload', () => {
  saveState();
  app.virtualScroller.destroy();
});
