(function () {
  const { DEMO, store, detectColumns, apiGet, apiPost, thumbUrl, esc, toast } = window.FJL;
  const $ = id => document.getElementById(id);
  const A = { key: store.get('akey'), subs: [], pending: null };
  if (DEMO) $('demoBanner').hidden = false;

  // ---------- auth ----------
  async function signIn(key) {
    A.key = key;
    await apiGet({ action: 'submissions', key }); // throws if wrong
    store.set('akey', key);
    $('adminLogin').hidden = true; $('adminMain').hidden = false;
    loadSubs(); loadCurrent();
  }
  $('btnAdminLogin').onclick = async () => {
    const k = $('adminKey').value.trim();
    $('adminErr').hidden = true;
    try { await signIn(k); } catch (e) { $('adminErr').textContent = e.message; $('adminErr').hidden = false; }
  };
  $('adminKey').addEventListener('keydown', e => { if (e.key === 'Enter') $('btnAdminLogin').click(); });

  // ---------- tabs ----------
  document.querySelector('.tabs').addEventListener('click', e => {
    const t = e.target.closest('.tab'); if (!t) return;
    document.querySelectorAll('.tab').forEach(x => x.classList.toggle('on', x === t));
    $('tab-subs').hidden = t.dataset.tab !== 'subs';
    $('tab-tickets').hidden = t.dataset.tab !== 'tickets';
    if (t.dataset.tab === 'subs') loadSubs();
  });

  // ---------- records ----------
  async function loadSubs() {
    $('subList').innerHTML = '<div class="skeleton"></div><div class="skeleton"></div>';
    try {
      const d = await apiGet({ action: 'submissions', key: A.key });
      A.subs = d.rows || [];
      if (d.sheetUrl) { $('lnkSheet').href = d.sheetUrl; $('lnkSheet').hidden = false; }
      if (d.folderUrl) { $('lnkFolder').href = d.folderUrl; $('lnkFolder').hidden = false; }
      fillFilter('fFacility', 'Facility', 'All facilities');
      fillFilter('fTech', 'Technician', 'All technicians');
      renderSubs();
    } catch (e) { $('subList').innerHTML = `<p class="empty">Could not load records: ${esc(e.message)}</p>`; }
  }
  function fillFilter(id, field, label) {
    const cur = $(id).value;
    const vals = [...new Set(A.subs.map(r => r[field]).filter(Boolean))].sort();
    $(id).innerHTML = `<option value="">${label}</option>` + vals.map(v => `<option ${v === cur ? 'selected' : ''}>${esc(v)}</option>`).join('');
  }
  function filtered() {
    const q = $('fText').value.trim().toLowerCase(), f = $('fFacility').value, t = $('fTech').value, y = $('fType').value;
    return A.subs.filter(r =>
      (!f || r.Facility === f) && (!t || r.Technician === t) && (!y || String(r.Type).includes(y)) &&
      (!q || Object.values(r).join(' ').toLowerCase().includes(q)));
  }
  function photoBlock(label, cls, str) {
    const urls = String(str || '').split('\n').filter(Boolean);
    if (!urls.length) return '';
    return `<div class="ph-label ${cls}">${label} · ${urls.length}</div><div class="thumbs">` +
      urls.map(u => `<figure class="thumb"><a href="${esc(u.startsWith('data:') ? '#' : u)}" target="_blank" rel="noopener noreferrer"><img loading="lazy" src="${esc(thumbUrl(u, 300))}" alt="${label} photo"></a></figure>`).join('') + '</div>';
  }
  function renderSubs() {
    const list = filtered();
    const att = list.filter(r => String(r.Type).includes('Attend')).length;
    const wd = list.filter(r => String(r.Type).includes('Work Done')).length;
    const facs = new Set(list.map(r => r.Facility)).size;
    $('subStats').innerHTML = [['Records', list.length], ['Attend', att], ['Work done', wd], ['Facilities', facs]]
      .map(([a, b]) => `<div class="stat"><span>${a}</span><b>${b}</b></div>`).join('');
    $('subList').innerHTML = list.length ? list.map(r => `
      <article class="sub">
        <div class="sub-head"><strong>${esc(r['Ticket No'])} · ${esc(r.Facility)}</strong>
          <span>${String(r.Type).includes('Attend') ? '<span class="badge att">Attend</span> ' : ''}${String(r.Type).includes('Work Done') ? '<span class="badge wd">Work done</span>' : ''}</span></div>
        <div class="sub-meta">${esc(r.Timestamp)} · ${esc(r.Technician)}${r.Title ? ' · ' + esc(r.Title) : ''}${r['Map Link'] ? ` · <a href="${esc(r['Map Link'])}" target="_blank" rel="noopener noreferrer">Map</a>` : ''}</div>
        ${r.Remarks ? `<div>${esc(r.Remarks)}</div>` : ''}
        ${photoBlock('Attend', 'att', r['Attend Photos'])}
        ${photoBlock('Work done', 'wd', r['Work Done Photos'])}
      </article>`).join('') : '<p class="empty">No records yet. They appear here as soon as a technician submits.</p>';
  }
  ['fText', 'fFacility', 'fTech', 'fType'].forEach(id => $(id).addEventListener('input', renderSubs));
  $('btnReload').onclick = loadSubs;
  $('btnExport').onclick = () => {
    const rows = filtered().map(r => {
      const o = Object.assign({}, r);
      ['Attend Photos', 'Work Done Photos'].forEach(k => { if (String(o[k]).startsWith('data:')) o[k] = '(demo photo)'; });
      return o;
    });
    if (!rows.length) return toast('No records to export', 'warn');
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Records');
    XLSX.writeFile(wb, 'job-log-records-' + new Date().toISOString().slice(0, 10) + '.xlsx');
  };

  // ---------- ticket upload ----------
  function table(el, headers, rows, limit) {
    const shown = rows.slice(0, limit || 200);
    el.innerHTML = '<thead><tr>' + headers.map(h => `<th>${esc(h)}</th>`).join('') + '</tr></thead><tbody>' +
      shown.map(r => '<tr>' + headers.map(h => `<td>${esc(r[h])}</td>`).join('') + '</tr>').join('') + '</tbody>' +
      (rows.length > shown.length ? `<tfoot><tr><td colspan="${headers.length}" class="muted">…and ${rows.length - shown.length} more rows</td></tr></tfoot>` : '');
  }
  async function loadCurrent() {
    try {
      const d = await apiGet({ action: 'tickets', key: A.key });
      const C = detectColumns(d.headers);
      const facs = new Set(d.rows.map(r => r[C.facility])).size;
      $('curCount').textContent = `${d.rows.length} tickets · ${facs} facilities`;
      table($('curTable'), d.headers, d.rows);
    } catch (e) { $('curTable').innerHTML = `<tr><td>${esc(e.message)}</td></tr>`; }
  }
  async function readFile(file) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
    const headerIdx = aoa.findIndex(r => r.filter(c => String(c).trim()).length >= 2);
    if (headerIdx < 0) throw new Error('Could not find a header row');
    const headers = aoa[headerIdx].map(h => String(h).trim()).filter(Boolean);
    const rawHeaders = aoa[headerIdx].map(h => String(h).trim());
    const rows = aoa.slice(headerIdx + 1)
      .filter(r => r.some(c => String(c).trim() !== ''))
      .map(r => { const o = {}; rawHeaders.forEach((h, i) => { if (h) o[h] = String(r[i] == null ? '' : r[i]).trim(); }); return o; });
    return { headers, rows };
  }
  async function handleFile(file) {
    if (!file) return;
    try {
      const { headers, rows } = await readFile(file);
      const C = detectColumns(headers);
      const warn = [];
      if (!C.facility) warn.push('No Facility column found (looked for Facility / Location / Store / Outlet / Branch).');
      if (!C.ticket) warn.push('No Ticket No column found (looked for Ticket / Report No / Ref).');
      const facs = C.facility ? new Set(rows.map(r => r[C.facility]).filter(Boolean)).size : 0;
      const missing = C.ticket ? rows.filter(r => !r[C.ticket]).length : 0;
      if (missing) warn.push(missing + ' row(s) have no ticket number and will be hard to pick.');
      $('upStats').innerHTML = [['File', file.name], ['Tickets', rows.length], ['Facilities', facs], ['Columns', headers.length]]
        .map(([a, b]) => `<div class="stat"><span>${a}</span><b style="font-size:var(--text-base);overflow-wrap:anywhere">${esc(b)}</b></div>`).join('');
      $('upWarn').innerHTML = warn.map(esc).join('<br>'); $('upWarn').hidden = !warn.length;
      table($('upTable'), headers, rows, 50);
      $('btnPublish').disabled = !C.facility || !C.ticket || !rows.length;
      A.pending = { headers, rows };
      $('preview').hidden = false;
    } catch (e) { toast('Could not read file: ' + e.message, 'err'); }
  }
  $('xlsFile').addEventListener('change', e => { handleFile(e.target.files[0]); e.target.value = ''; });
  const drop = $('drop');
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => handleFile(e.dataTransfer.files[0]));
  $('btnCancelUp').onclick = () => { A.pending = null; $('preview').hidden = true; };
  $('btnPublish').onclick = async () => {
    if (!A.pending) return;
    if (!confirm(`Replace the current ticket list with ${A.pending.rows.length} tickets? Technicians will see the new list next time they refresh.`)) return;
    $('btnPublish').disabled = true; $('btnPublish').textContent = 'Uploading…';
    try {
      const r = await apiPost({ action: 'replaceTickets', key: A.key, headers: A.pending.headers, rows: A.pending.rows });
      toast(r.count + ' tickets published');
      A.pending = null; $('preview').hidden = true;
      loadCurrent();
    } catch (e) { toast('Upload failed: ' + e.message, 'err'); }
    $('btnPublish').disabled = false; $('btnPublish').textContent = 'Replace ticket list';
  };

  // ---------- start ----------
  (async () => {
    if (A.key || DEMO) {
      try { await signIn(A.key || 'demo'); return; } catch (e) { store.del('akey'); }
    }
    $('adminLogin').hidden = false;
  })();
})();
