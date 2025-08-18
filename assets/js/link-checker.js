/* ===== DOM refs ===== */
const btn = document.getElementById('checkBtn');
const input = document.getElementById('urlInput');
const result = document.getElementById('result');
const modeDirect = document.getElementById('mode-direct');
const modeProxy  = document.getElementById('mode-proxy');

const historyList = document.getElementById('historyList');
const clearListBtn = document.getElementById('clearList');
const recheckAllBtn = document.getElementById('recheckAll');
const exportCsvBtn = document.getElementById('exportCsv');
const filterInput = document.getElementById('filterInput');
const countIndicator = document.getElementById('countIndicator');

/* ===== state + storage ===== */
const LS_KEY = 'linkChecker.history.v1';
let historyData = []; // {id,url,title,status,code,ts,mode}

function saveLS(){ try{ localStorage.setItem(LS_KEY, JSON.stringify(historyData)); }catch{} }
function loadLS(){ try{ historyData = JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch{ historyData = []; } }

/* ===== helpers ===== */
function setStatus(state, msg){
  result.className = 'status ' + state;
  const icons = {wait:'circle-question', live:'circle-check', err:'circle-xmark'};
  result.innerHTML = `<i class="fa-solid fa-${icons[state]}"></i> ${msg}`;
}
function normalizeURL(u){
  let url = (u || '').trim();
  if(!url) return '';
  if(!/^https?:\/\//i.test(url)) url = 'https://' + url;
  return url;
}
function toProxy(u){ return 'https://r.jina.ai/' + u; }
function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }
function decodeEntities(s){ const t=document.createElement('textarea'); t.innerHTML=s; return t.value; }

/* ===== Title fetch ===== */
async function fetchTitle(url){
  try{
    const res = await fetch(toProxy(url), { method:'GET' });
    if(!res.ok) throw new Error('proxy '+res.status);
    const text = await res.text();

    const mTitle = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (mTitle && mTitle[1]) return decodeEntities(mTitle[1]).replace(/\s+/g,' ').trim();

    const mOg = text.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["'][^>]*>/i);
    if (mOg && mOg[1]) return decodeEntities(mOg[1]).replace(/\s+/g,' ').trim();

    const mdH1 = text.match(/^\s*#\s+(.+)\s*$/m);
    if (mdH1 && mdH1[1]) return mdH1[1].replace(/\s+/g,' ').trim();

    const firstLine = (text.split(/\r?\n/).map(s=>s.trim()).find(s => s && s.length<=120)) || '';
    if (firstLine) return firstLine;
  }catch{}

  try{ return new URL(url).hostname; }catch{ return url; }
}

/* ===== history UI ===== */
function makeItemEl(rec){
  const li = document.createElement('li');
  li.className = 'history-item';
  li.dataset.id = rec.id;
  li.dataset.url = rec.url;

  const main = document.createElement('div');
  main.className = 'item-main copyable';
  main.setAttribute('data-tip', 'Click to copy URL');
  const titleEl = document.createElement('div');
  titleEl.className = 'history-title-text';
  titleEl.textContent = rec.title || 'Loading title…';
  const urlEl = document.createElement('div');
  urlEl.className = 'history-url';
  urlEl.textContent = rec.url;
  main.append(titleEl, urlEl);

  const badge = document.createElement('span');
  badge.className = 'badge ' + (
    rec.status==='live' ? 'badge-live' :
    rec.status==='err'  ? 'badge-err'  : 'badge-wait'
  );
  badge.textContent = (rec.status==='live'?'✅ ':'❌ ') + (rec.status?.toUpperCase() || 'WAIT') +
                      (rec.code ? ` (${rec.code})` : '');

  const open = document.createElement('a');
  open.className = 'btn';
  open.href = rec.url;
  open.target = '_blank';
  open.rel = 'noopener';
  open.title = 'Buka di tab baru';
  open.innerHTML = `<i class="fa-solid fa-arrow-up-right-from-square"></i> Open`;

  const actions = document.createElement('div');
  actions.className = 'item-actions';
  actions.innerHTML = `
    <button class="btn recheck" title="Re-check"><i class="fa-solid fa-rotate"></i></button>
    <button class="btn remove"  title="Hapus"><i class="fa-solid fa-xmark"></i></button>
  `;

  li.append(main, badge, open, actions);
  return li;
}

function renderAll(){
  historyList.innerHTML = '';
  const q = (filterInput?.value || '').toLowerCase().trim();
  let visible = 0;
  for(const rec of historyData.slice().reverse()){
    const hay = `${rec.title} ${rec.url} ${rec.status} ${rec.code}`.toLowerCase();
    if(q && !hay.includes(q)) continue;
    historyList.append(makeItemEl(rec));
    visible++;
  }
  if (countIndicator) countIndicator.textContent = `${visible} / ${historyData.length} items`;
  reevaluateAuto(); // update auto-check setelah render
}

function upsertRecord(rec){
  const idx = historyData.findIndex(r => r.id === rec.id);
  if(idx >= 0) historyData[idx] = rec; else historyData.push(rec);
  saveLS(); renderAll(); // renderAll memanggil reevaluateAuto()
}

function updateBadge(id, state, code){
  const rec = historyData.find(r=>r.id===id);
  if(!rec) return;
  rec.status = state;
  rec.code = code || rec.code;
  rec.ts = Date.now();
  upsertRecord(rec);
}

async function ensureTitle(id){
  const rec = historyData.find(r=>r.id===id);
  if(!rec) return;
  const isPlaceholder = !rec.title || /loading title/i.test(rec.title);

  let need = isPlaceholder;
  if(!need){
    try{
      const host = new URL(rec.url).hostname;
      if(rec.title === host) need = true;
    }catch{}
  }
  if(!need) return;

  const ttl = await fetchTitle(rec.url);
  rec.title = ttl || rec.title || rec.url;
  upsertRecord(rec);
}

/* ===== core check ===== */
async function checkOnce(url, mode, onUpdate){
  setStatus('wait','Sedang mengecek...');
  const direct = (mode === 'direct');

  try{
    if(direct){
      let res;
      try { res = await fetch(url, {method:'HEAD'}); }
      catch { res = await fetch(url, {method:'GET'}); }
      if (res.ok){
        setStatus('live','Link Live');
        onUpdate?.('live', res.status);
        return {ok:true,status:res.status};
      } else {
        setStatus('err',`Error: ${res.status || 'Unknown'}`);
        onUpdate?.('err', res.status || 'ERR');
        return {ok:false,status:res.status};
      }
    } else {
      const res = await fetch(toProxy(url), {method:'GET'});
      if(res.ok){
        const text = await res.text();
        if(text && text.length>0){
          setStatus('live','Link Live (via Proxy)');
          onUpdate?.('live', 200);
          return {ok:true,status:200};
        }else{
          setStatus('err','Tidak bisa diakses (empty)');
          onUpdate?.('err', 'EMPTY');
          return {ok:false,status:0};
        }
      }else{
        setStatus('err',`Error Proxy: ${res.status}`);
        onUpdate?.('err', res.status);
        return {ok:false,status:res.status};
      }
    }
  }catch{
    setStatus('err','Tidak bisa diakses');
    onUpdate?.('err', 'ERR');
    return {ok:false,status:0};
  }
}

/* ===== actions ===== */
btn.addEventListener('click', async () => {
  const url = normalizeURL(input.value);
  if(!url) return alert('Masukkan link terlebih dahulu');

  const rec = {
    id: uid(), url, title: 'Loading title…',
    status: 'wait', code: '', ts: Date.now(),
    mode: modeDirect.checked ? 'direct' : 'proxy'
  };
  upsertRecord(rec);

  await checkOnce(url, rec.mode, (state, code)=> updateBadge(rec.id, state, code));
  ensureTitle(rec.id);
  input.value = '';
});

/* klik item untuk copy (kiri/area judul-URL) + tombol lainnya */
historyList.addEventListener('click', async (e)=>{
  const li = e.target.closest('.history-item');
  if(!li) return;
  const id = li.dataset.id;
  const rec = historyData.find(r=>r.id===id);
  if(!rec) return;

  if(e.target.closest('.remove')){
    historyData = historyData.filter(r=>r.id!==id);
    saveLS(); renderAll();
    return;
  }
  if(e.target.closest('.recheck')){
    const mode = modeDirect.checked ? 'direct' : 'proxy';
    rec.mode = mode; upsertRecord(rec);
    await checkOnce(rec.url, mode, (state, code)=> updateBadge(id, state, code));
    ensureTitle(id);
    return;
  }
  if(e.target.closest('a')) return; // klik tombol Open -> default

  // klik di area main => copy URL
  const main = e.target.closest('.item-main');
  if(main){
    try{
      await navigator.clipboard.writeText(rec.url);
      const oldTip = main.getAttribute('data-tip') || 'Click to copy URL';
      main.setAttribute('data-tip','Copied!');
      setTimeout(()=> main.setAttribute('data-tip', oldTip), 900);
    }catch{}
  }
});

// clear & recheck all
clearListBtn.addEventListener('click', ()=>{
  if(!confirm('Hapus semua item?')) return;
  historyData = []; saveLS(); renderAll();
});
recheckAllBtn.addEventListener('click', async ()=>{
  const mode = modeDirect.checked ? 'direct' : 'proxy';
  const ids = Array.from(historyList.children).map(li => li.dataset.id); // hanya yang tampil
  for(const id of ids){
    const rec = historyData.find(r=>r.id===id); if(!rec) continue;
    rec.mode = mode; upsertRecord(rec);
    await checkOnce(rec.url, rec.mode, (state, code)=> updateBadge(rec.id, state, code));
    ensureTitle(rec.id);
  }
});

filterInput?.addEventListener('input', renderAll);

/* ===== bulk ===== */
const bulk = document.getElementById('bulk');
const runBulk = document.getElementById('runBulk');
const clearBulk = document.getElementById('clearBulk');
const tbody = document.querySelector('#tbl tbody');

function rowTpl(u, status){
  const icon = status==='LIVE' ? '✅' : status==='WAIT' ? '⏳' : '❌';
  return `<tr><td style="word-break:break-all">${u}</td><td>${icon} ${status}</td></tr>`;
}
runBulk?.addEventListener('click', async()=>{
  const urls = bulk.value.split(/\n+/).map(x=>normalizeURL(x)).filter(Boolean);
  if(!urls.length) return alert('Tempelkan minimal 1 URL');
  tbody.innerHTML = urls.map(u=>rowTpl(u,'WAIT')).join('');
  const mode = modeDirect.checked ? 'direct' : 'proxy';

  for(let i=0;i<urls.length;i++){
    const u = urls[i];
    const rec = { id: uid(), url: u, title:'Loading title…', status:'wait', code:'', ts:Date.now(), mode };
    upsertRecord(rec);
    try{
      const out = await checkOnce(u, mode, (state, code)=> updateBadge(rec.id, state, code));
      tbody.rows[i].cells[1].innerText = out.ok ? '✅ LIVE' : `❌ ${out.status||'ERR'}`;
      ensureTitle(rec.id);
    }catch{
      tbody.rows[i].cells[1].innerText = '❌ ERR';
      updateBadge(rec.id, 'err', 'ERR');
      ensureTitle(rec.id);
    }
  }
});
clearBulk?.addEventListener('click',()=>{ bulk.value=''; tbody.innerHTML=''; });

/* ===== Export CSV (sesuai filter yang tampil) ===== */
exportCsvBtn?.addEventListener('click', ()=>{
  const q = (filterInput?.value || '').toLowerCase().trim();
  const rows = [['title','url','status','code','checked_at','mode']];
  for(const rec of historyData){
    const hay = `${rec.title} ${rec.url} ${rec.status} ${rec.code}`.toLowerCase();
    if(q && !hay.includes(q)) continue;
    rows.push([
      rec.title || '', rec.url, rec.status || '',
      String(rec.code || ''), new Date(rec.ts||Date.now()).toISOString(),
      rec.mode || ''
    ]);
  }
  const csv = rows.map(r => r.map(v=>{
    const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
  }).join(',')).join('\n');

  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const ts = new Date().toISOString().replace(/[:T]/g,'-').slice(0,16);
  a.download = `link-history-${ts}.csv`; document.body.appendChild(a); a.click(); a.remove();
});

/* ===== Auto-check hanya item merah; stop jika semua hijau; start lagi jika ada merah ===== */
const AUTO_MS = 30000;
let autoTimer = null;
let autoIdx = 0;

function visibleIds(){
  return Array.from(historyList.children).map(li => li.dataset.id);
}
function visibleRedIds(){
  const ids = visibleIds();
  return ids.filter(id => {
    const rec = historyData.find(r=>r.id===id);
    return rec && rec.status === 'err';
  });
}
function stopAuto(){
  if(autoTimer){ clearInterval(autoTimer); autoTimer = null; }
}
function startAuto(){
  if(autoTimer) return;
  const reds = visibleRedIds();
  if(!reds.length) return;
  autoTimer = setInterval(runAutoTick, AUTO_MS);
}
function reevaluateAuto(){
  const reds = visibleRedIds();
  if(reds.length){ startAuto(); }
  else{ stopAuto(); }
}
async function runAutoTick(){
  const reds = visibleRedIds();
  if(!reds.length){ stopAuto(); return; } // semua hijau → berhenti

  const id = reds[autoIdx % reds.length]; autoIdx++;
  const rec = historyData.find(r=>r.id===id); if(!rec) return;

  const mode = modeDirect.checked ? 'direct' : 'proxy';
  rec.mode = mode; upsertRecord(rec);
  await checkOnce(rec.url, mode, (state, code)=> updateBadge(rec.id, state, code));
  ensureTitle(rec.id);

  // setelah cek, evaluasi lagi (bisa jadi hijau semua)
  reevaluateAuto();
}

/* ===== boot ===== */
(function init(){
  loadLS();
  renderAll();
  // lengkapi title untuk item lama
  for (const rec of historyData) ensureTitle(rec.id);
})();
