/* ========= Constants ========= */
const LINES_PER_PAGE   = 1000;
const MAX_MEMORY_USAGE = 100 * 1024 * 1024; // 100MB
const MAX_RENDER_ROWS  = 2000; // batas render agar modal tetap ringan

/* ========= Regex ========= */
const unitRegex  = /^KRHRED(?:_Unit)?_\d+$/i;

/* ========= File reader ========= */
class FileProcessor {
  constructor(){ this.reset(); }
  reset(){
    this.currentFile = null;
    this.fileContent = '';
    this.currentLines = [];
    this.totalSize = 0;
    this.loadedSize = 0;
  }
  updateProgress(){
    const percent = (this.loadedSize / this.totalSize) * 100;
    const wrap = document.getElementById('loadingWrapper');
    if (wrap){
      wrap.style.visibility = 'visible';
      document.getElementById('progressText').textContent = `${Math.round(percent)}%`;
    }
  }
  async readFile(file, onProgress){
    this.reset();
    this.currentFile = file;
    this.totalSize = file.size;

    const reader  = file.stream().getReader();
    const decoder = new TextDecoder();

    try{
      while(true){
        const {done, value} = await reader.read();
        if (done) break;
        this.loadedSize += value.length;
        const text = decoder.decode(value, {stream:true});
        this.fileContent += text;
        this.updateProgress();
        if (onProgress) onProgress(this.loadedSize, this.totalSize);
        await new Promise(r=>setTimeout(r,0));
      }
    } finally { reader.releaseLock(); }

    const wrap = document.getElementById('loadingWrapper');
    if (wrap) wrap.style.visibility = 'hidden';
    this.currentLines = this.fileContent.split('\n');
    return this.currentLines;
  }
}

/* ========= Virtual list ========= */
class VirtualScroller {
  constructor(container, itemHeight = 20){
    this.container = container;
    this.content   = container.querySelector('.virtual-scroll-content');
    this.itemHeight= itemHeight;
    this.items     = [];
    this.visible   = new Set();
    this.onScroll  = this.onScroll.bind(this);
    container.addEventListener('scroll', this.onScroll);
    this.observer = new ResizeObserver(()=>this.update());
    this.observer.observe(container);
  }
  setItems(items){
    this.items = items;
    this.content.style.height = `${items.length * this.itemHeight}px`;
    this.update();
  }
  update(){
    const top = this.container.scrollTop;
    const h   = this.container.clientHeight;
    const start = Math.floor(top / this.itemHeight);
    const end   = Math.min(Math.ceil((top + h)/this.itemHeight), this.items.length);

    const frag = document.createDocumentFragment();
    const newSet = new Set();

    for (let i=start;i<end;i++){
      newSet.add(i);
      if (!this.visible.has(i)){
        const div = document.createElement('div');
        div.style.position = 'absolute';
        div.style.top = `${i * this.itemHeight}px`;
        div.style.height = `${this.itemHeight}px`;
        div.style.width = '100%';
        div.textContent = this.items[i];
        frag.appendChild(div);
      }
    }

    this.content.querySelectorAll('div').forEach(div=>{
      const idx = Math.floor(parseInt(div.style.top)/this.itemHeight);
      if (!newSet.has(idx)) div.remove();
    });

    this.content.appendChild(frag);
    this.visible = newSet;
  }
  onScroll(){ this.update(); }
  destroy(){
    this.observer.disconnect();
    this.container.removeEventListener('scroll', this.onScroll);
  }
}

/* ========= Main App ========= */
class DatabaseChecker {
  constructor(){
    this.fp = new FileProcessor();
    this.vs = new VirtualScroller(document.getElementById('databaseContent'));
    this.currentLines = [];
    this.processedLinesCount = 0;
    this.isChecking = false;

    // Default schema (akan di-detect ulang saat file load)
    this.schema = { cmpgIdx:0, emailIdx:1, unitIdx:2, textIdx:3 };

    // Modal refs
    this.modal        = document.getElementById('searchModal');
    this.emailInput   = document.getElementById('emailQuery');
    this.emailInfoEl  = document.getElementById('emailMatchesInfo');
    this.rowsEl       = document.getElementById('krhredRows');
    this.schemaInfoEl = document.getElementById('schemaInfo');

    this.bindEvents();
  }

  bindEvents(){
    document.getElementById('folderOpenBtn').addEventListener('click', ()=>this.openFolder());

    this.checkBtn = document.getElementById('checkBtn');
    this.checkBtn.addEventListener('click', ()=>{
      if (this.isChecking){ this.stopChecking(); } else { this.checkDatabase(); }
    });

    document.getElementById('loadMoreBtn').addEventListener('click', ()=>this.loadMore());

    // Modal & search
    document.getElementById('openSearchModalBtn').addEventListener('click', ()=>this.openSearchModal());
    document.getElementById('modalCloseBtn').addEventListener('click', ()=>this.closeSearchModal());
    document.getElementById('modalBackdrop').addEventListener('click', ()=>this.closeSearchModal());
    document.getElementById('searchEmailBtn').addEventListener('click', ()=>this.performEmailSearch());
    this.emailInput.addEventListener('keydown', (e)=>{ if (e.key === 'Enter') this.performEmailSearch(); });

    // Selection sync (fallback)
    document.addEventListener('click', (e)=>{
      const item = e.target.closest('#fileList li, #fileList button.file');
      if (!item) return;
      document.querySelectorAll('#fileList .selected,[aria-selected="true"]').forEach(x=>{
        x.classList.remove('selected'); x.removeAttribute('aria-selected');
      });
      item.classList.add('selected'); item.setAttribute('aria-selected','true');
    });

    // Esc to close modal
    window.addEventListener('keydown', (e)=>{
      if (e.key === 'Escape' && this.modalIsOpen()) this.closeSearchModal();
    });
  }

  /* ===== Modal ===== */
  modalIsOpen(){ return this.modal && (this.modal.hasAttribute('open') || this.modal.classList.contains('show')); }
  openSearchModal(){
    if (!this.currentLines.length){ alert('Please load a file first'); return; }
    this.detectSchema();
    this.updateSchemaInfo();
    this.rowsEl.innerHTML = '';
    this.emailInfoEl.textContent = 'Masukkan email lalu tekan Search.';
    this.modal.setAttribute('open','');
    this.modal.classList.add('show');
    setTimeout(()=>this.emailInput?.focus(),0);
  }
  closeSearchModal(){
    this.modal.classList.remove('show');
    this.modal.removeAttribute('open');
  }
  updateSchemaInfo(){
    const {cmpgIdx,emailIdx,unitIdx,textIdx} = this.schema;
    this.schemaInfoEl.textContent = `Schema: CMPGID[${cmpgIdx}] • EMAIL[${emailIdx}] • KRHRED[${unitIdx}] • TEXT[${textIdx}]`;
  }

  /* ===== Schema auto-detect ===== */
  detectSchema(){
    const sample = this.currentLines.slice(0, Math.min(600, this.currentLines.length));
    const votes = { email: new Map(), unit: new Map(), atSign: new Map() };
    let maxCols = 0;

    for (const line of sample){
      const parts = line.split('|');
      maxCols = Math.max(maxCols, parts.length);
      parts.forEach((f, idx)=>{
        const field = (f||'').trim();
        // email vote (strict)
        const isEmailStrict = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(field);
        if (isEmailStrict) votes.email.set(idx, (votes.email.get(idx)||0)+1);
        // fallback: contains '@'
        if (field.includes('@')) votes.atSign.set(idx, (votes.atSign.get(idx)||0)+1);
        // unit vote
        if (unitRegex.test(field)) votes.unit.set(idx, (votes.unit.get(idx)||0)+1);
      });
    }
    const maxKey = (m, def)=> m.size ? [...m.entries()].sort((a,b)=>b[1]-a[1])[0][0] : def;

    let emailIdx = maxKey(votes.email, undefined);
    if (emailIdx === undefined) emailIdx = maxKey(votes.atSign, 1); // fallback kalau email tidak valid
    const unitIdx  = maxKey(votes.unit, 2);

    let textIdx = unitIdx + 1;
    if (textIdx >= maxCols) textIdx = Math.max(3, maxCols - 1);
    const cmpgIdx = 0;

    this.schema = { cmpgIdx, emailIdx, unitIdx, textIdx };
  }

  /* ===== Search & render per-entry list ===== */
  performEmailSearch(){
    if (!this.currentLines.length){ alert('Please load a file first'); return; }
    const q = (this.emailInput.value || '').trim().toLowerCase();
    const { emailIdx, unitIdx, textIdx } = this.schema;

    const entries = []; // {unit, text, chars}
    let totalMatches = 0;

    for (let i=0;i<this.currentLines.length;i++){
      const parts = this.currentLines[i].split('|');
      const email = (parts[emailIdx]||'').trim().toLowerCase();
      const unit  = (parts[unitIdx]  ||'').trim();
      const text  = (parts[textIdx]  ||'').trim();

      if (q && !email.includes(q)) continue; // filter email jika ada
      if (!unitRegex.test(unit)) continue;

      totalMatches++;
      const normalizedUnit = unit.replace(/^krhred(?:_unit)?_/i, 'KRHRED_Unit_');
      entries.push({ unit: normalizedUnit, text, chars: text.length });
    }

    // Info
    this.emailInfoEl.textContent = q
      ? `Email match: ${totalMatches.toLocaleString()} baris`
      : `Semua baris: ${this.currentLines.length.toLocaleString()} (berisi KRHRED: ${entries.length.toLocaleString()})`;

    // Render (batasi agar ringan)
    this.rowsEl.innerHTML = '';
    if (!entries.length){
      this.rowsEl.innerHTML = `<div class="muted">Tidak ada KRHRED untuk filter ini.</div>`;
      return;
    }

    const toRender = entries.slice(0, MAX_RENDER_ROWS);
    const frag = document.createDocumentFragment();
    for (const e of toRender){
      const row = document.createElement('div');
      row.className = 'krhred-row';
      row.innerHTML = `<code>attr:${e.unit}</code><span class="input value${e.text.length > 60 ? ' value-long' : ''}">${escapeHtml(e.text)}</span>`;
      frag.appendChild(row);
    }
    this.rowsEl.appendChild(frag);

    if (entries.length > toRender.length){
      const more = document.createElement('div');
      more.className = 'muted';
      more.style.marginTop = '8px';
      more.textContent = `Showing ${toRender.length.toLocaleString()} of ${entries.length.toLocaleString()} entries. Refine email filter to narrow results.`;
      this.rowsEl.appendChild(more);
    }
  }

  /* ===== Check database (existing) ===== */
  async checkDatabase(){
    if (!this.currentLines.length){ alert('Please load a file first'); return; }
    this.isChecking = true; this.updateCheckButton(); this.showLoading(true);

    const unitsSet = new Set();
    const emptyDataUnits = new Set();
    const unitDetails = new Map();
    const chunkSize = 1000;
    this._stopRequested = false;

    for (let i=0;i<this.currentLines.length;i+=chunkSize){
      if (this._stopRequested) break;
      const chunk = this.currentLines.slice(i, Math.min(i+chunkSize, this.currentLines.length));

      chunk.forEach((line, index)=>{
        const parts = line.split('|');
        if (parts.length > 2){
          const unit = (parts[2] || '').trim();
          const dataRaw = parts[3] || '';
          const data = dataRaw.trim();

          if (unitRegex.test(unit)){
            unitsSet.add(unit);
            if (data === '' || dataRaw !== data){
              emptyDataUnits.add(unit);
              if (!unitDetails.has(unit)) unitDetails.set(unit, []);
              unitDetails.get(unit).push({ lineNumber: i+index+1, lineText: line });
            }
          }
        }
      });

      this.updatePercent(Math.min(i+chunkSize, this.currentLines.length), this.currentLines.length);
      await new Promise(r=>setTimeout(r,0));
    }

    this.renderResults(unitsSet, emptyDataUnits, unitDetails);
    this.showLoading(false); this.isChecking = false; this.updateCheckButton();
  }

  stopChecking(){
    this._stopRequested = true;
    this.isChecking = false;
    this.updateCheckButton();
    this.showLoading(false);
  }

  updateCheckButton(){
    if (this.isChecking){
      this.checkBtn.innerHTML = `<i class="fa-solid fa-stop"></i><span>Stop</span>`;
      document.getElementById('loadingIndicator').style.display = 'none';
    } else {
      this.checkBtn.innerHTML = `<i class="fa-solid fa-list-check"></i><span>Check</span>`;
      document.getElementById('loadingIndicator').style.display = 'inline-block';
    }
  }
  showLoading(show){
    const wrap = document.getElementById('loadingWrapper');
    if (wrap) wrap.style.visibility = show ? 'visible' : 'hidden';
  }
  updatePercent(current, total){
    const percent = (current/total)*100;
    const wrap = document.getElementById('loadingWrapper');
    if (wrap){
      wrap.style.visibility = 'visible';
      document.getElementById('progressText').textContent = `${Math.round(percent)}%`;
    }
  }

  /* ===== Folder & file ===== */
  async openFolder(){
    try{
      const dirHandle = await window.showDirectoryPicker();
      await this.buildFileTree(dirHandle);
    } catch(err){
      console.error('Error opening folder:', err);
      alert('Error opening folder: ' + err.message);
    }
  }

  async buildFileTree(dirHandle, parentUl = document.querySelector('#fileList ul')){
    parentUl.innerHTML = '';
    const entries = [];
    for await (const entry of dirHandle.values()) entries.push(entry);
    entries.sort((a,b)=>a.name.localeCompare(b.name));

    const frag = document.createDocumentFragment();
    for (const entry of entries){
      if (entry.kind === 'file' && entry.name.includes('CustAttr.txt')){
        const li = document.createElement('li');
        li.className = 'file';
        li.textContent = entry.name;
        li.title = entry.name;
        li.addEventListener('click', async (e)=>{
          e.stopPropagation();
          await this.loadFile(entry);
          document.querySelectorAll('#fileList li').forEach(el=>el.classList.remove('selected'));
          li.classList.add('selected');
        });
        frag.appendChild(li);
      }
    }
    parentUl.appendChild(frag);
  }

  clearResults(){
    document.getElementById('krhredResults').innerHTML = '';
    document.getElementById('krhredDetails').innerHTML = '';
    document.getElementById('loadMoreBtn').style.display = 'none';
  }

  async loadFile(fileHandle){
    try{
      this.clearResults();
      this.showLoading(true);
      const file = await fileHandle.getFile();

      if (file.size > MAX_MEMORY_USAGE){
        const ok = confirm(`This file is large (${(file.size/1024/1024).toFixed(1)}MB). Continue?`);
        if (!ok){ this.showLoading(false); return; }
      }

      this.currentLines = await this.fp.readFile(file, (loaded,total)=>this.updatePercent(loaded,total));
      this.processedLinesCount = Math.min(this.currentLines.length, LINES_PER_PAGE);
      this.vs.setItems([]); // clear
      this.vs.setItems(this.currentLines.slice(0, this.processedLinesCount));

      document.getElementById('loadMoreBtn').style.display =
        this.currentLines.length > LINES_PER_PAGE ? 'inline-flex' : 'none';

      // detect schema once file loaded
      this.detectSchema();

    } catch(err){
      console.error('Error loading file:', err);
      alert('Error loading file: ' + err.message);
    } finally {
      this.showLoading(false);
    }
  }

  loadMore(){
    const next = this.currentLines.slice(this.processedLinesCount, this.processedLinesCount + LINES_PER_PAGE);
    if (next.length){
      this.processedLinesCount += next.length;
      this.vs.setItems(this.currentLines.slice(0, this.processedLinesCount));
      document.getElementById('loadMoreBtn').style.display =
        this.processedLinesCount < this.currentLines.length ? 'inline-flex' : 'none';
    }
  }

  renderResults(unitsSet, emptyDataUnits, unitDetails){
    const resultsDiv = document.getElementById('krhredResults');
    const detailsDiv = document.getElementById('krhredDetails');

    const matches = Array.from(unitsSet).sort((a,b)=>{
      const na = parseInt(a.match(/\d+/)[0],10);
      const nb = parseInt(b.match(/\d+/)[0],10);
      return na - nb;
    });

    const totalDB = this.countUniqueCMPGIDs(this.currentLines);
    resultsDiv.innerHTML = '';
    detailsDiv.innerHTML = '';

    if (matches.length){
      const container = document.createElement('div');
      container.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;max-height:10em;overflow:auto;margin-top:8px;';
      matches.forEach(unit=>{
        const span = document.createElement('span');
        const isEmpty = emptyDataUnits.has(unit);
        span.style.cssText = `
          color:${isEmpty ? 'red':'#22c55e'};
          padding:2px 6px;border-radius:4px;
          background:${isEmpty ? '#3b0f0f':'#0f2d17'};
        `;
        span.textContent = unit;
        container.appendChild(span);
      });
      resultsDiv.append(container);

      const totalDiv = document.createElement('div');
      totalDiv.style.cssText = 'margin-top:10px;';
      totalDiv.textContent = `Total database: ${totalDB}`;
      resultsDiv.append(totalDiv);

      const header = document.createElement('h3'); header.textContent = 'KRHRED Unit Details';
      detailsDiv.append(header);

      Array.from(emptyDataUnits).sort((a,b)=>{
        const na = parseInt(a.match(/\d+/)[0],10);
        const nb = parseInt(b.match(/\d+/)[0],10);
        return na - nb;
      }).forEach(unit=>{
        const block = document.createElement('div');
        block.innerHTML = `<strong>${unit}</strong>:`;
        detailsDiv.append(block);

        unitDetails.get(unit).forEach(d=>{
          const lineDiv = document.createElement('div');
          lineDiv.style.cssText = 'font-family:monospace;white-space:pre-wrap;';
          lineDiv.textContent = `Line ${d.lineNumber}: ${d.lineText}`;
          detailsDiv.append(lineDiv);
        });
      });
    } else {
      resultsDiv.textContent = `Total database: ${totalDB}`;
    }
  }

  countUniqueCMPGIDs(lines){
    const s = new Set();
    for (const line of lines){
      const cmpg = (line.split('|')[0] || '').trim();
      if (cmpg) s.add(cmpg);
    }
    return s.size;
  }
}

/* ========= Utils ========= */
function escapeHtml(str){
  return (str ?? '').replace(/[&<>"']/g, s => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[s]));
}

/* ========= Boot ========= */
const app = new DatabaseChecker();
window.addEventListener('beforeunload', ()=>app.vs.destroy());
