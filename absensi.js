// Absensi v2.3F — fix double confirm & 'undefined' date on form delete; keep all features
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
  const clearBtn = document.getElementById('clearBtn');   // "Edit"
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

  // Disable native required popup; we'll validate in JS so auto-fill can run
  if (startTime) { try { startTime.required = false; startTime.removeAttribute('required'); } catch(e){} }
  if (endTime)   { try { endTime.required   = false; endTime.removeAttribute('required'); } catch(e){} }
  if (absenForm) { absenForm.setAttribute('novalidate', 'novalidate'); }

  // Sort state (default A→Z)
  let rekapSortAsc = true;

  let view = today();
  let selectedDate = today();
  let entries = load('attendanceEntries', {});
  let locks = load('attendanceLocks', {});

  renderCalendar();
  selectDate(selectedDate);
  initTabs();
  initMonthPicker();
  initRekapSortHeader(); // klik header "Tanggal" untuk toggle sort
  ensureFormDeleteButton(); // tambahkan tombol Delete di area form
  refreshRekap();

  prevMonthBtn.addEventListener('click', () => changeMonth(-1));
  nextMonthBtn.addEventListener('click', () => changeMonth(1));
  todayBtn.addEventListener('click', () => { view = today(); selectedDate = today(); renderCalendar(); selectDate(selectedDate); });

  // Klik "Edit"
  clearBtn.addEventListener('click', () => {
    const dateKey = isoDate(selectedDate);
    if (entries[dateKey]) {
      startEdit(dateKey);
    } else {
      setFormForDate(selectedDate, false);
      locks[dateKey] = false; save('attendanceLocks', locks);
      applyLockState();
      formMsg.textContent = 'Mode edit: ' + dateKey;
    }
  });

  function nowHm(dateObj = new Date()){
    const h = String(dateObj.getHours()).padStart(2,'0');
    const m = String(dateObj.getMinutes()).padStart(2,'0');
    return `${h}:${m}`;
  }
  function addMinutes(hm, plus = 1){
    const [h,m] = hm.split(':').map(Number);
    let total = h*60 + m + plus;
    if (total < 0) total = 0;
    const hh = String(Math.floor(total/60) % 24).padStart(2,'0');
    const mm = String(total % 60).padStart(2,'0');
    return `${hh}:${mm}`;
  }

  // SUBMIT
  absenForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (isLocked(selectedDate)) { formMsg.textContent = 'Form terkunci. Klik Edit dari kalender/rekap untuk mengubah.'; return; }

    const dateKey = isoDate(selectedDate);
    const mode = (document.querySelector('input[name="mode"]:checked')?.value) || 'WFO';

    // Cuti/Sakit — simpan menit 0, kosongkan jam
    if (mode === 'Cuti/Sakit'){
      entries[dateKey] = {date: dateKey, start: '', end: '', minutes: 0, mode, notes: notes.value || ''};
      save('attendanceEntries', entries);
      locks[dateKey] = true; save('attendanceLocks', locks);
      applyLockState();
      renderCalendar(); refreshRekap();
      formMsg.textContent = 'Tersimpan (Cuti/Sakit) & dikunci ✅';
      renderFormDeleteButtonVisibility();
      return;
    }

    // NON-CUTI: auto isi jam
    let st = startTime.value;
    let et = endTime.value;

    if (!st && !et){
      st = nowHm();
      et = addMinutes(st, 1);
      startTime.value = st;
      endTime.value = et;
    } else if (!st && et){
      st = nowHm();
      startTime.value = st;
      if (et <= st) { et = addMinutes(st, 1); endTime.value = et; }
    } else if (st && !et){
      et = nowHm();
      if (et <= st) { et = addMinutes(st, 1); }
      endTime.value = et;
    }

    if(!st || !et){ formMsg.textContent = 'Jam mulai & selesai harus diisi.'; return; }
    if(et <= st){ formMsg.textContent = 'Jam selesai harus lebih besar dari jam mulai.'; return; }

    const minutes = diffMinutes(st, et);
    entries[dateKey] = {date:dateKey, start:st, end:et, minutes, mode, notes:notes.value||''};
    save('attendanceEntries', entries);
    locks[dateKey] = true; save('attendanceLocks', locks);
    applyLockState();
    renderCalendar(); refreshRekap();
    formMsg.textContent = 'Tersimpan & dikunci ✅';
    renderFormDeleteButtonVisibility();
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
        renderFormDeleteButtonVisibility();
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
    renderFormDeleteButtonVisibility();
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
    let startOffset = firstDay.getDay(); // 0=Sunday
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
        const mm = entries[key].mode;
        if(mm==='WFO') cell.classList.add('mode-wfo');
        else if(mm==='WFH') cell.classList.add('mode-wfh');
        else if(mm==='Cuti/Sakit') cell.classList.add('mode-cuti');
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
    renderFormDeleteButtonVisibility();
    [...calendarEl.querySelectorAll('.cell')].forEach(c=>c.classList.remove('selected'));
    const cell=[...calendarEl.querySelectorAll('.cell')].find(c=>c.querySelector&&c.querySelector('.date')&&c.querySelector('.date').textContent==String(selectedDate.getDate()));
    if(cell) cell.classList.add('selected');
  }

  function setFormForDate(d, clearOnly){
    const key=isoDate(d); const ex=entries[key];
    const wfo = document.getElementById('modeWFO');
    const wfh = document.getElementById('modeWFH');
    const cuti = document.getElementById('modeCuti');
    const mode = ex ? ex.mode : 'WFO';
    if(wfo && wfh){
      wfo.checked = mode==='WFO';
      wfh.checked = mode==='WFH';
      if(cuti) cuti.checked = mode==='Cuti/Sakit';
    }
    if(clearOnly || !ex){
      startTime.value = '08:00';
      endTime.value = '';
      notes.value = '';
      lockBadge.classList.remove('show');
      enableInputs(true);
    } else {
      startTime.value = ex.start || '';
      endTime.value = ex.end || '';
      notes.value = ex.notes || '';
      enableInputs(!isLocked(d));
      lockBadge.classList.toggle('show', isLocked(d));
    }
    applyModeDisable();
  }

  function applyModeDisable(){
    const mode = (document.querySelector('input[name="mode"]:checked')?.value || 'WFO');
    const cuti = (mode === 'Cuti/Sakit');
    startTime.disabled = cuti || (startTime.disabled && isLocked(selectedDate));
    endTime.disabled   = cuti || (endTime.disabled && isLocked(selectedDate));
    try { startTime.required = false; endTime.required = false; } catch(e){}
  }

  function enableInputs(enabled){
    [startTime,endTime,notes].forEach(el=>el.disabled=!enabled);
    document.querySelectorAll('input[name="mode"]').forEach(r=>r.disabled=!enabled);
  }

  function applyLockState(){
    const unlocked = !isLocked(selectedDate);
    enableInputs(unlocked);
    lockBadge.classList.toggle('show', !unlocked);
    applyModeDisable();
  }

  document.querySelectorAll('input[name="mode"]').forEach(r=>{
    r.addEventListener('change', applyModeDisable);
  });

  function initTabs(){
    const tabs=document.querySelectorAll('.tab'); const contents=document.querySelectorAll('.tab-content');
    tabs.forEach(t=>t.addEventListener('click',()=>{ tabs.forEach(x=>x.classList.remove('active')); contents.forEach(c=>c.classList.remove('active')); t.classList.add('active'); document.getElementById(t.dataset.tab).classList.add('active'); }));
  }

  function initMonthPicker(){
    const now=new Date(); const y=now.getFullYear(); const m=now.getMonth()+1; monthPicker.value = `${y}-${String(m).padStart(2,'0')}`;
    monthPicker.addEventListener('change', refreshRekap);
  }
  function readMonthPicker(){ const [yy,mm]=monthPicker.value.split('-').map(Number); return {y:yy,m:mm-1}; }

  function initRekapSortHeader(){
    const thTanggal = document.querySelector('#rekapTable thead th:first-child');
    if (!thTanggal) return;
    thTanggal.style.cursor = 'pointer';
    updateSortHeaderLabel();
    thTanggal.addEventListener('click', ()=>{
      rekapSortAsc = !rekapSortAsc;
      refreshRekap();
      updateSortHeaderLabel();
    });
  }
  function updateSortHeaderLabel(){
    const thTanggal = document.querySelector('#rekapTable thead th:first-child');
    if (!thTanggal) return;
    thTanggal.textContent = 'Tanggal ' + (rekapSortAsc ? '▲' : '▼');
  }

  function listEntriesForMonth(store,year,month){
    const arr=[];
    Object.values(store).forEach(e=>{
      const d=new Date(e.date+'T00:00:00');
      if(d.getFullYear()===year && d.getMonth()===month) arr.push({...e});
    });
    arr.sort((a,b)=> rekapSortAsc ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date));
    return arr;
  }

  function refreshRekap(){
    const {y,m}=readMonthPicker(); const list=listEntriesForMonth(entries,y,m);
    rekapTableBody.innerHTML=''; let totalMin=0,wfo=0,wfh=0;
    list.forEach(e=>{
      totalMin+=e.minutes||0; if(e.mode==='WFO') wfo++; else if(e.mode==='WFH') wfh++;
      const d=new Date(e.date+'T00:00:00'); const tr=document.createElement('tr');
      tr.innerHTML = `
        <td>${e.date}</td>
        <td>${idDays[d.getDay()]}</td>
        <td>${e.start || ''}</td>
        <td>${e.end || ''}</td>
        <td>${fmtDuration(e.minutes||0)}</td>
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

  // ===== Form Delete Button (next to Edit) =====
  function ensureFormDeleteButton(){
    if (!clearBtn) return;
    let delBtn = document.getElementById('formDeleteBtn');
    if (!delBtn){
      delBtn = document.createElement('button');
      delBtn.id = 'formDeleteBtn';
      delBtn.type = 'button';
      delBtn.className = 'delBtn'; // reuse style
      delBtn.title = 'Hapus data tanggal ini';
      // delBtn.style.marginLeft = '8px';
      delBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';
      clearBtn.insertAdjacentElement('afterend', delBtn);
      delBtn.addEventListener('click', (ev)=>{ ev.stopPropagation(); onFormDelete(); });
    }
    renderFormDeleteButtonVisibility();
  }

  function renderFormDeleteButtonVisibility(){
    const delBtn = document.getElementById('formDeleteBtn');
    if (!delBtn) return;
    const exists = !!entries[isoDate(selectedDate)];
    delBtn.style.display = exists ? '' : 'none';
    delBtn.dataset.date = isoDate(selectedDate);
  }

  function onFormDelete(){
    const date = isoDate(selectedDate);
    if (!entries[date]){ formMsg.textContent = 'Belum ada data untuk tanggal ini.'; return; }
    if (!confirm('Hapus absen tanggal ' + date + '?')) return;
    delete entries[date];
    delete locks[date];
    save('attendanceEntries', entries);
    save('attendanceLocks', locks);
    renderCalendar(); refreshRekap();
    setFormForDate(selectedDate, true);
    applyLockState();
    renderFormDeleteButtonVisibility();
    formMsg.textContent = 'Entri dihapus.';
  }
  // ===== end Form Delete Button =====

  function toCSV(list){
    const header=['Tanggal','Hari','Mulai','Selesai','Durasi (menit)','Mode','Catatan'];
    const rows=list.map(e=>{ const d=new Date(e.date+'T00:00:00'); return [e.date,idDays[d.getDay()],e.start||'',e.end||'',e.minutes||0,e.mode,(e.notes||'').replaceAll('"','""')]; });
    const lines=[header.join(','), ...rows.map(r=>r.map(v=>`"${v}"`).join(','))]; return lines.join('\n');
  }
  function downloadText(text, filename){ const blob=new Blob([text],{type:'text/csv;charset=utf-8;'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=filename; a.click(); URL.revokeObjectURL(url); }
  function escapeHtml(str){ return str.replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s])); }
})();