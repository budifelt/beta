// Absensi v2.3 - radio WFO/WFH + per-date lock + calendar edit
(() => {
  const idDays = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'];
  const idMonths = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];

  const calendarEl = document.getElementById('calendar');
  const monthLabel = document.getElementById('monthLabel');
  const yearLabel = document.getElementById('yearLabel');
  const prevMonthBtn = document.getElementById('prevMonthBtn');
  const nextMonthBtn = document.getElementById('nextMonthBtn');
  const todayBtn = document.getElementById('todayBtn');

  const tanggalField = document.getElementById('tanggalField');
  const startTime = document.getElementById('startTime');
  const endTime = document.getElementById('endTime');
  const notes = document.getElementById('notes');
  const formMsg = document.getElementById('formMsg');
  const clearBtn = document.getElementById('clearBtn');
  const absenForm = document.getElementById('absenForm');
  const lockBadge = document.getElementById('lockBadge');

  const monthPicker = document.getElementById('monthPicker');
  const rekapTableBody = document.querySelector('#rekapTable tbody');
  const totalHari = document.getElementById('totalHari');
  const totalWFO = document.getElementById('totalWFO');
  const totalWFH = document.getElementById('totalWFH');
  const totalJam = document.getElementById('totalJam');
  const avgJam = document.getElementById('avgJam');
  const exportCsvBtn = document.getElementById('exportCsvBtn');

  let view = today();
  let selectedDate = today();
  let entries = load('attendanceEntries', {});
  let locks = load('attendanceLocks', {});

  
  // ===== Google Apps Script / Google Sheets Sync =====
  // Set your Web App URL here (Deploy > Test deployments / Manage deployments)
  // Example: const GAS_URL = 'https://script.google.com/macros/s/AKfycbx.../exec';
  const GAS_URL = 'https://script.google.com/macros/s/AKfycbwN0eduVYeoVSJfwIO9ZLFQGY1aEDlvF1MGSY7DRURhgwi-JTTcf--991BtV9koej_zVw/exec'; // TODO: paste your Web App URL (leave empty to disable remote sync)

  function queueLoad(){ try{ return JSON.parse(localStorage.getItem('attendanceSyncQueue')||'[]'); }catch(_){ return []; } }
  function queueSave(arr){ localStorage.setItem('attendanceSyncQueue', JSON.stringify(arr)); }
  function enqueueForSync(record){
    const q = queueLoad();
    // Ensure minimal fields and idempotency (replace if same date exists in queue)
    const idx = q.findIndex(x => x.date === record.date);
    if(idx>=0) q[idx] = record; else q.push(record);
    queueSave(q);
  }
  async function syncQueue(){
    const q = queueLoad();
    if(!GAS_URL || !q.length) return {sent:0, left:q.length};
    const next=[]; let sent=0;
    for(const rec of q){
      try{
        await postToGAS(rec);
        sent++;
      }catch(err){
        next.push(rec);
      }
    }
    queueSave(next);
    return {sent, left: next.length};
  }
  async function postToGAS(data){
    // Use application/x-www-form-urlencoded to avoid CORS preflight on Apps Script
    const payload = new URLSearchParams({ payload: JSON.stringify(data) }).toString();
    const res = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: payload,
      // do not use no-cors so we can read status when allowed
    });
    if(!res.ok){ throw new Error('HTTP ' + res.status); }
    // Response may be opaque if your deployment doesn't allow cross-origin reads; ignore body
    return true;
  }
  // Try syncing any pending records at startup (best-effort)
  (async()=>{ try{ await syncQueue(); }catch(_){ /* ignore */ } })();
  // ===== End GAS helpers =====

  renderCalendar();
  selectDate(selectedDate);
  initTabs();
  initMonthPicker();
  refreshRekap();

  prevMonthBtn.addEventListener('click', () => changeMonth(-1));
  nextMonthBtn.addEventListener('click', () => changeMonth(1));
  todayBtn.addEventListener('click', () => { view = today(); selectedDate = today(); renderCalendar(); selectDate(selectedDate); });

  clearBtn.addEventListener('click', () => { setFormForDate(selectedDate, true); formMsg.textContent = 'Isian dibersihkan (belum tersimpan).'; });

  absenForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if(isLocked(selectedDate)) { formMsg.textContent = 'Form terkunci. Klik Edit dari kalender/rekap untuk mengubah.'; return; }
    const st = startTime.value, et = endTime.value;
    if(!st || !et){ formMsg.textContent = 'Jam mulai & selesai harus diisi.'; return; }
    if(et <= st){ formMsg.textContent = 'Jam selesai harus lebih besar dari jam mulai.'; return; }
    const dateKey = isoDate(selectedDate);
    const minutes = diffMinutes(st, et);
    const mode = (document.querySelector('input[name="mode"]:checked')?.value || 'WFO');
    entries[dateKey] = {date:dateKey,start:st,end:et,minutes,mode,notes:notes.value||''};
    save('attendanceEntries', entries);
    locks[dateKey] = true; save('attendanceLocks', locks);
    applyLockState();
    renderCalendar(); refreshRekap();
    formMsg.textContent = 'Tersimpan & dikunci ✅ (lokal)'; 
    try{
      const rec = entries[dateKey];
      // Add metadata for the sheet
      rec.client_tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Jakarta';
      rec.saved_at = new Date().toISOString();
      enqueueForSync(rec);
      syncQueue().then(res=>{
        if(res && res.sent>0) formMsg.textContent = 'Tersimpan lokal + terkirim ke Sheet ✅';
        else if(res && res.left>=0) formMsg.textContent = 'Tersimpan lokal. Antrian ' + res.left + ' belum terkirim.';
      }).catch(()=>{/* ignore */});
    }catch(_){/* ignore */};
  });

  exportCsvBtn.addEventListener('click', () => {
    const {y,m} = readMonthPicker();
    const list = listEntriesForMonth(entries,y,m);
    const csv = toCSV(list);
    downloadText(csv, `absensi_${y}-${String(m+1).padStart(2,'0')}.csv`);
  });

  document.addEventListener('click', (e) => {
    const editBtn = e.target.closest('.editBtn');
    const delBtn = e.target.closest('.delBtn');
    const calEdit = e.target.closest('.calEditBtn');
    if(editBtn || calEdit){
      const date = (editBtn||calEdit).dataset.date;
      startEdit(date);
    }
    if(delBtn){
      const date = delBtn.dataset.date;
      if(confirm('Hapus absen tanggal ' + date + '?')){
        delete entries[date];
        delete locks[date];
        save('attendanceEntries', entries);
        save('attendanceLocks', locks);
        renderCalendar(); refreshRekap();
        if(isoDate(selectedDate)===date){ setFormForDate(selectedDate,true); applyLockState(); formMsg.textContent='Entri dihapus.'; }
      }
    }
  });

  function startEdit(date){
    selectedDate = new Date(date + 'T00:00:00');
    renderCalendar();
    selectDate(selectedDate);
    setFormForDate(selectedDate,false);
    locks[date] = false; save('attendanceLocks', locks);
    applyLockState();
    formMsg.textContent = 'Mode edit: ' + date;
    window.scrollTo({top:0, behavior:'smooth'});
  }

  function today(){ const n=new Date(); return new Date(n.getFullYear(),n.getMonth(),n.getDate()); }
  function isoDate(d){ const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,'0'); const day=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${day}`; }
  function toIdDate(d){ return `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`; }
  function diffMinutes(st,et){ const [sh,sm]=st.split(':').map(Number); const [eh,em]=et.split(':').map(Number); return (eh*60+em)-(sh*60+sm); }
  function fmtDuration(min){ const h=Math.floor(min/60), m=min%60; return `${h}j ${String(m).padStart(2,'0')}m`; }
  function load(key, fallback){ try{ return JSON.parse(localStorage.getItem(key)||'null') ?? fallback; }catch(_){ return fallback; } }
  function save(key, obj){ localStorage.setItem(key, JSON.stringify(obj)); }
  function isLocked(d){ return !!locks[isoDate(d)]; }

  function changeMonth(delta){ view = new Date(view.getFullYear(), view.getMonth()+delta, 1); renderCalendar(); }

  function renderCalendar(){
    calendarEl.innerHTML='';
    const y=view.getFullYear(), m=view.getMonth();
    monthLabel.textContent=idMonths[m]; yearLabel.textContent=y;
    const weekdays=['Min','Sen','Sel','Rab','Kam','Jum','Sab'];
    weekdays.forEach(w=>{ const el=document.createElement('div'); el.className='weekday'; el.textContent=w; calendarEl.appendChild(el); });
    const firstDay=new Date(y,m,1);
    let startOffset = firstDay.getDay(); // 0=Sunday (no shift)
    const daysInMonth=new Date(y,m+1,0).getDate();
    const todayKey=isoDate(today());
    for(let i=0;i<startOffset;i++) calendarEl.appendChild(document.createElement('div'));
    for(let d=1; d<=daysInMonth; d++){
      const dateObj=new Date(y,m,d); const key=isoDate(dateObj);
      const cell=document.createElement('div'); cell.className='cell';
      const dow=dateObj.getDay();
      if(dow===0||dow===6){ cell.classList.add('weekend'); if(dow===0) cell.classList.add('sun'); else cell.classList.add('sat'); }
      if(key===todayKey) cell.classList.add('today');
      if(entries[key]){ const dot=document.createElement('span'); dot.className='dot'; cell.appendChild(dot); }
      if(entries[key] && entries[key].mode){
        const m = entries[key].mode;
        if(m==='WFO') cell.classList.add('mode-wfo');
        else if(m==='WFH') cell.classList.add('mode-wfh');
        else if(m==='Cuti/Sakit') cell.classList.add('mode-cuti');
      }
      const dateSpan=document.createElement('div'); dateSpan.className='date'; dateSpan.textContent=d; cell.appendChild(dateSpan);
      const badge=document.createElement('span'); badge.className='badge'; badge.textContent=idDays[dateObj.getDay()]; cell.appendChild(badge);
      cell.addEventListener('click', (ev)=>{ if(ev.target.closest('.calEditBtn')) return; selectDate(dateObj); });
      if(entries[key]){ const eb=document.createElement('button'); eb.className='edit-cell calEditBtn'; eb.dataset.date=key; eb.title='Edit data ini'; eb.innerHTML='<i class="fa-solid fa-pen-to-square"></i>'; cell.appendChild(eb); }
      if(key===isoDate(selectedDate)) cell.classList.add('selected');
      calendarEl.appendChild(cell);
    }
  }

  function selectDate(d){
    selectedDate=new Date(d.getFullYear(),d.getMonth(),d.getDate());
    tanggalField.value=`${idDays[selectedDate.getDay()]}, ${toIdDate(selectedDate)}`;
    setFormForDate(selectedDate,false);
    applyLockState();
    [...calendarEl.querySelectorAll('.cell')].forEach(c=>c.classList.remove('selected'));
    const cell=[...calendarEl.querySelectorAll('.cell')].find(c=>c.querySelector&&c.querySelector('.date')&&c.querySelector('.date').textContent==String(selectedDate.getDate()));
    if(cell) cell.classList.add('selected');
  }

  function setFormForDate(d, clearOnly){
    const key=isoDate(d); const ex=entries[key];
    // set radios
    const wfo = document.getElementById('modeWFO');
    const wfh = document.getElementById('modeWFH');
    const cuti = document.getElementById('modeCuti');
    const mode = ex? ex.mode : 'WFO';
    if(wfo && wfh){ wfo.checked = mode==='WFO'; wfh.checked = mode==='WFH'; if(cuti) cuti.checked = mode==='Cuti/Sakit'; }
    if(clearOnly||!ex){ startTime.value='08:00'; endTime.value=''; notes.value=''; lockBadge.classList.remove('show'); enableInputs(true); }
    else{ startTime.value=ex.start; endTime.value=ex.end; notes.value=ex.notes||''; enableInputs(!isLocked(d)); lockBadge.classList.toggle('show', isLocked(d)); }
  }

  function enableInputs(enabled){
    [startTime,endTime,notes].forEach(el=>el.disabled=!enabled);
    document.querySelectorAll('input[name="mode"]').forEach(r=>r.disabled=!enabled);
  }

  function applyLockState(){ enableInputs(!isLocked(selectedDate)); lockBadge.classList.toggle('show', isLocked(selectedDate)); }

  function initTabs(){
    const tabs=document.querySelectorAll('.tab'); const contents=document.querySelectorAll('.tab-content');
    tabs.forEach(t=>t.addEventListener('click',()=>{ tabs.forEach(x=>x.classList.remove('active')); contents.forEach(c=>c.classList.remove('active')); t.classList.add('active'); document.getElementById(t.dataset.tab).classList.add('active'); }));
  }

  function initMonthPicker(){
    const now=new Date(); const y=now.getFullYear(); const m=now.getMonth()+1; monthPicker.value = `${y}-${String(m).padStart(2,'0')}`;
    monthPicker.addEventListener('change', refreshRekap);
  }
  function readMonthPicker(){ const [yy,mm]=monthPicker.value.split('-').map(Number); return {y:yy,m:mm-1}; }

  function listEntriesForMonth(store,year,month){
    const arr=[]; Object.values(store).forEach(e=>{ const d=new Date(e.date+'T00:00:00'); if(d.getFullYear()===year&&d.getMonth()===month) arr.push({...e}); });
    arr.sort((a,b)=>a.date.localeCompare(b.date)); return arr;
  }

  function refreshRekap(){
    const {y,m}=readMonthPicker(); const list=listEntriesForMonth(entries,y,m);
    rekapTableBody.innerHTML=''; let totalMin=0,wfo=0,wfh=0;
    list.forEach(e=>{ totalMin+=e.minutes||0; if(e.mode==='WFO') wfo++; else if(e.mode==='WFH') wfh++;
      const d=new Date(e.date+'T00:00:00'); const tr=document.createElement('tr');
      tr.innerHTML = `
        <td>${e.date}</td>
        <td>${idDays[d.getDay()]}</td>
        <td>${e.start}</td>
        <td>${e.end}</td>
        <td>${fmtDuration(e.minutes)}</td>
        <td>${e.mode}</td>
        <td>${escapeHtml(e.notes||'')}</td>
        <td class="actions-cell">
          <button class="editBtn" data-date="${e.date}" title="Edit data ini"><i class="fa-solid fa-pen-to-square"></i></button>
          <button class="delBtn" data-date="${e.date}" title="Hapus data ini"><i class="fa-solid fa-trash"></i></button>
        </td>
      `;
      rekapTableBody.appendChild(tr);
    });
    const hari=list.length; totalHari.textContent=`Total Hari: ${hari}`; totalWFO.textContent=`WFO: ${wfo}`; totalWFH.textContent=`WFH: ${wfh}`;
    totalJam.textContent=`Total Jam: ${fmtDuration(totalMin)}`; avgJam.textContent=`Rata-rata Jam/Hari: ${hari?fmtDuration(Math.round(totalMin/hari)):0}`;
  }

  function toCSV(list){
    const header=['Tanggal','Hari','Mulai','Selesai','Durasi (menit)','Mode','Catatan'];
    const rows=list.map(e=>{ const d=new Date(e.date+'T00:00:00'); return [e.date,idDays[d.getDay()],e.start,e.end,e.minutes,e.mode,(e.notes||'').replaceAll('"','""')]; });
    const lines=[header.join(','), ...rows.map(r=>r.map(v=>`"${v}"`).join(','))]; return lines.join('\n');
  }
  function downloadText(text, filename){ const blob=new Blob([text],{type:'text/csv;charset=utf-8;'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=filename; a.click(); URL.revokeObjectURL(url); }
  function escapeHtml(str){ return str.replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s])); }
})();
