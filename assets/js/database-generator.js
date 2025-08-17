
// ---- Extracted scripts from inline <script> blocks ----
const $ = (sel) => document.querySelector(sel);

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const campaignRegex = /^\d{8}.*$/; // Wajib diawali 8 digit angka (YYYYMMDD)

    const campaignIdEl = $('#campaignId');

    // Email/KR elements
    const newEmailEl = $('#newEmail');
    const addEmailBtn = $('#addEmail');

    // BULK refs
    const bulkBtn = $('#bulkBtn');
    const bulkBox = $('#bulkBox');
    const bulkEmailsEl = $('#bulkEmails');
    const applyBulkBtn = $('#applyBulk');
    const cancelBulkBtn = $('#cancelBulk');
    const bulkInfo = $('#bulkInfo');

    const newKeyEl = $('#newKey');
    const addKeyBtn = $('#addKey');
    const krHeadRow = $('#krHeadRow');
    const krBody = $('#krBody');

    const btnDownload = $('#btnDownload');
    const btnSave = $('#btnSave');
    const stateMsg = $('#stateMsg');
    const errorEl = $('#error');
    const previewsEl = $('#previews');
    const countInfo = $('#countInfo');
    const invalidInfo = $('#invalidInfo');

    const dlSection = $('#dlSection');
    const downloadsList = $('#downloadsList');

    // State
    let emails = [];                 // ["a@a.com", ...]
    let krKeys = [];                 // ["KRHRED_Unit_30", ...]
    const krValues = new Map();      // email -> Map(key -> value)

    // ---------- Helpers ----------
    function parseManyEmails(text) {
      const raw = (text || '')
        .split(/[\n,;\s]+/)        // baris, koma, titik koma, spasi
        .map(s => s.trim())
        .filter(Boolean);
      const out = [];
      const seen = new Set(emails);  // hindari duplikat dgn existing
      for (const e of raw) {
        if (!seen.has(e)) { out.push(e); seen.add(e); }
      }
      return out;
    }

    function normalizeKey(k) {
      if (k && k.trim()) {
        let key = k.trim();
        if (!/^KRHRED_/i.test(key)) key = 'KRHRED_' + key;
        key = key.replace(/\s+/g, '_');
        return key;
      }
      // auto-generate KRHRED_Unit_N starting at 30
      const nums = krKeys
        .map(x => (/KRHRED_Unit_(\d+)/i.exec(x)?.[1]))
        .filter(Boolean)
        .map(n => parseInt(n, 10));
      const max = nums.length ? Math.max(...nums) : 29;
      return `KRHRED_Unit_${max + 1}`;
    }

    function ensureRowMap(email) {
      if (!krValues.has(email)) krValues.set(email, new Map());
      return krValues.get(email);
    }

    function migrateEmail(oldEmail, newEmail) {
      if (oldEmail === newEmail) return;
      if (!emailRegex.test(newEmail)) return; // ignore invalid sampai valid
      if (emails.includes(newEmail)) return; // hindari duplikat
      const map = krValues.get(oldEmail) || new Map();
      krValues.delete(oldEmail);
      krValues.set(newEmail, map);
      emails = emails.map(e => (e === oldEmail ? newEmail : e));
      renderTable();
      updateUI();
    }

    function removeEmailRow(email) {
      emails = emails.filter(e => e !== email);
      krValues.delete(email);
      renderTable();
      updateUI();
    }

    function renderTable() {
      // Header: hapus kolom KR lama
      krHeadRow.querySelectorAll('th[data-key]').forEach(th => th.remove());
      for (const key of krKeys) {
        const th = document.createElement('th');
        th.className = 'px-2 py-2 border-b border-slate-800 whitespace-nowrap';
        th.setAttribute('data-key', key);
        th.innerHTML = `
          <div class="flex items-center gap-2">
            <span class="font-mono">${key}</span>
            <button class="text-slate-400 hover:text-rose-400" title="Hapus kolom" data-remove-key="${key}">✕</button>
          </div>`;
        krHeadRow.appendChild(th);
      }

      // Body
      krBody.innerHTML = '';
      for (const email of emails) {
        const tr = document.createElement('tr');

        const tdEmail = document.createElement('td');
        tdEmail.className = 'px-3 py-2 sticky left-0 bg-slate-900/80 backdrop-blur border-b border-slate-800';
        tdEmail.innerHTML = `
          <div class="flex items-center gap-2">
            <input class="w-64 md:w-72 rounded-xl bg-slate-900 border border-slate-700 px-3 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500" value="${email}" />
            <button class="text-slate-400 hover:text-rose-400" title="Hapus email" data-remove-email="${email}">🗑</button>
          </div>`;
        tr.appendChild(tdEmail);

        const rowMap = ensureRowMap(email);
        for (const key of krKeys) {
          const td = document.createElement('td');
          td.className = 'px-2 py-2 border-b border-slate-800';
          const inp = document.createElement('input');
          inp.className = 'w-44 md:w-56 rounded-xl bg-slate-900 border border-slate-700 px-3 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500';
          inp.value = rowMap.get(key) ?? '';
          inp.placeholder = 'nilai';
          inp.addEventListener('input', () => { rowMap.set(key, inp.value); updateUI(); });
          td.appendChild(inp);
          tr.appendChild(td);
        }
        krBody.appendChild(tr);

        // email change listener
        const emailInput = tdEmail.querySelector('input');
        emailInput.addEventListener('change', () => migrateEmail(email, emailInput.value.trim()));
      }

      // Listeners: remove email / remove key
      krHeadRow.querySelectorAll('button[data-remove-key]').forEach(btn => {
        btn.addEventListener('click', () => {
          const k = btn.getAttribute('data-remove-key');
          krKeys = krKeys.filter(x => x !== k);
          for (const m of krValues.values()) m.delete(k);
          renderTable();
          updateUI();
        });
      });
      krBody.querySelectorAll('button[data-remove-email]').forEach(btn => {
        btn.addEventListener('click', () => removeEmailRow(btn.getAttribute('data-remove-email')));
      });
    }

    function recordId(campaignId, i) { return `${campaignId}-${String(i + 1).padStart(6, '0')}`; }
    function rowCustMast(id, email) { const emptyCount = 17; const empties = Array(emptyCount).fill('').join('|'); return `${id}|${email}|${empties}|\n`; }
    function rowCustPref(id, email, campaignId) { return `${id}|${email}|CMPG_ID|${campaignId}|\n`; }
    function rowCustSubs(id, email) { return `${id}|${email}|IMO Marketing|Y|\n`; }
    function rowsCustAttrStatic(id, email, campaignId) { return `${id}|${email}|CMPG_ID|${campaignId}|\n`; }
    function rowsCustAttrDynamic(id, email, campaignId) {
      let out = `${id}|${email}|CMPG_ID|${campaignId}|\n`;
      const rowMap = krValues.get(email) || new Map();
      for (const key of krKeys) { const val = rowMap.get(key) ?? ''; out += `${id}|${email}|${key}|${val}|\n`; }
      return out;
    }

    function buildAllFiles(campaignId, emailList, useKr) {
      let mast = '', pref = '', subs = '', attr = '';
      emailList.forEach((email, i) => {
        const id = recordId(campaignId, i);
        mast += rowCustMast(id, email);
        pref += rowCustPref(id, email, campaignId);
        subs += rowCustSubs(id, email);
        attr += useKr ? rowsCustAttrDynamic(id, email, campaignId) : rowsCustAttrStatic(id, email, campaignId);
      });
      return {
        [`${campaignId}-CustMast.txt`]: mast,
        [`${campaignId}-CustPref.txt`]: pref,
        [`${campaignId}-CustSubs.txt`]: subs,
        [`${campaignId}-CustAttr.txt`]: attr,
      };
    }

    function downloadText(name, content) {
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a);
      setTimeout(() => {
        a.click();
        setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
      }, 0);
    }

    function renderDownloadLinks(files) {
      downloadsList.innerHTML = '';
      for (const [name, content] of Object.entries(files)) {
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = name;
        a.textContent = `⬇️ ${name}`;
        a.className = 'inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 w-fit';
        downloadsList.appendChild(a);
        // revoke setelah 2 menit (link cukup lama untuk di-klik)
        setTimeout(() => { URL.revokeObjectURL(url); a.removeAttribute('href'); a.classList.add('opacity-50','pointer-events-none'); }, 120000);
      }
      dlSection.classList.remove('hidden');
    }

    async function saveAllToFolder(files) {
      errorEl.classList.add('hidden');
      try {
        if (!('showDirectoryPicker' in window)) throw new Error("Browser Anda tidak mendukung 'Save to folder'. Coba Chrome/Edge desktop.");
        const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
        for (const [name, content] of Object.entries(files)) {
          const fileHandle = await dirHandle.getFileHandle(name, { create: true });
          const writable = await fileHandle.createWritable();
          await writable.write(content);
          await writable.close();
        }
      } catch (e) {
        if (e && e.name === 'AbortError') return;
        errorEl.textContent = e?.message || 'Gagal menyimpan ke folder.';
        errorEl.classList.remove('hidden');
      }
    }

    function updateUI() {
      const campaignId = campaignIdEl.value.trim();
      const useKr = krKeys.length > 0;

      // Stats & validation
      const invalid = emails.filter(e => !emailRegex.test(e));
      countInfo.textContent = `Total: ${emails.length}`;
      if (invalid.length) {
        invalidInfo.textContent = `Invalid: ${invalid.slice(0,3).join(', ')}${invalid.length>3?', …':''}`;
        invalidInfo.classList.remove('hidden');
      } else {
        invalidInfo.classList.add('hidden');
      }

      const ok = campaignRegex.test(campaignId) && emails.length > 0 && invalid.length === 0;
      btnDownload.disabled = !ok;
      btnSave.disabled = !ok;

      stateMsg.textContent = ok
        ? ''
        : (!campaignRegex.test(campaignId)
            ? 'Isi Campaign ID diawali YYYYMMDD.'
            : 'Tambahkan minimal 1 email valid.');

      // Previews
      previewsEl.innerHTML = '';
      if (!ok) return;
      const show = Math.min(emails.length, 5);
      const ids = Array.from({length: show}, (_, i) => recordId(campaignId, i));
      const sample = emails.slice(0, show);
      const previews = {
        [`${campaignId}-CustMast.txt`]: sample.map((e,i)=>rowCustMast(ids[i], e)).join('') + (emails.length>show?'…\n':''),
        [`${campaignId}-CustPref.txt`]: sample.map((e,i)=>rowCustPref(ids[i], e, campaignId)).join('') + (emails.length>show?'…\n':''),
        [`${campaignId}-CustSubs.txt`]: sample.map((e,i)=>rowCustSubs(ids[i], e)).join('') + (emails.length>show?'…\n':''),
        [`${campaignId}-CustAttr.txt`]: sample.map((e,i)=> (useKr ? rowsCustAttrDynamic(ids[i], e, campaignId) : rowsCustAttrStatic(ids[i], e, campaignId))).join('') + (emails.length>show?'…\n':''),
      };
      for (const [name, content] of Object.entries(previews)) {
        const card = document.createElement('div');
        card.className = 'bg-slate-900 rounded-2xl shadow p-4';
        card.innerHTML = '<div class="flex items-center justify-between"><h3 class="font-medium text-slate-200 truncate pr-2">'+name+'</h3><span class="text-[10px] px-2 py-1 rounded-full bg-slate-800 border border-slate-700">preview</span></div><pre class="mt-3 text-sm overflow-auto max-h-40 whitespace-pre-wrap leading-relaxed font-mono text-slate-300"></pre>';
        card.querySelector('pre').textContent = content;
        previewsEl.appendChild(card);
      }
    }

    // --- Events ---
    addEmailBtn.addEventListener('click', () => {
      const v = (newEmailEl.value || '').trim();
      if (!v) return;
      if (!emailRegex.test(v)) return alert('Email tidak valid.');
      if (!emails.includes(v)) {
        emails.push(v);
        ensureRowMap(v);
        renderTable();
        updateUI();
      }
      newEmailEl.value = '';
    });

    // Bulk handlers
    bulkBtn.addEventListener('click', () => {
      bulkBox.classList.toggle('hidden');
      bulkInfo.textContent = '';
    });
    cancelBulkBtn.addEventListener('click', () => {
      bulkBox.classList.add('hidden');
      bulkEmailsEl.value = '';
      bulkInfo.textContent = '';
    });
    applyBulkBtn.addEventListener('click', () => {
      const list = parseManyEmails(bulkEmailsEl.value);
      const valid = [];
      const invalid = [];
      for (const e of list) {
        if (emailRegex.test(e)) valid.push(e);
        else invalid.push(e);
      }
      // tambah yang valid & belum ada
      for (const e of valid) {
        if (!emails.includes(e)) {
          emails.push(e);
          ensureRowMap(e);
        }
      }
      renderTable();
      updateUI();

      // info singkat
      const parts = [];
      if (valid.length) parts.push(`${valid.length} email ditambahkan`);
      if (invalid.length) parts.push(`${invalid.length} invalid (diabaikan)`);
      bulkInfo.textContent = parts.join(' • ') || 'Tidak ada email baru.';
      // tetap biarkan teks paste agar bisa diperbaiki lalu Tambahkan lagi
    });

    addKeyBtn.addEventListener('click', () => {
      const key = normalizeKey(newKeyEl.value);
      if (!krKeys.includes(key)) {
        krKeys.push(key);
        for (const email of emails) ensureRowMap(email).set(key, ensureRowMap(email).get(key) ?? '');
        newKeyEl.value = '';
        renderTable();
        updateUI();
      }
    });

    btnDownload.addEventListener('click', async () => {
      const campaignId = campaignIdEl.value.trim();
      const useKr = krKeys.length > 0;
      const files = buildAllFiles(campaignId, emails, useKr);
      // unduh berurutan + tampilkan fallback links
      for (const [name, content] of Object.entries(files)) {
        downloadText(name, content);
        await new Promise(r => setTimeout(r, 120));
      }
      renderDownloadLinks(files);
    });

    btnSave.addEventListener('click', async () => {
      const campaignId = campaignIdEl.value.trim();
      const useKr = krKeys.length > 0;
      const files = buildAllFiles(campaignId, emails, useKr);
      await saveAllToFolder(files);
    });

    campaignIdEl.addEventListener('input', updateUI);

    // Init empty table
    renderTable();
    updateUI();
