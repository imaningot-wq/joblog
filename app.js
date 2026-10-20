(function () {
  const { CFG, DEMO, store, detectColumns, apiGet, apiPost, esc, toast } = window.FJL;
  const $ = id => document.getElementById(id);

  const S = {
    name: store.get('name'), pin: store.get('pin'),
    headers: [], rows: [], status: {}, cols: {},
    facilities: [], facility: null, ticket: null,
    type: null, photos: { 'Attend': [], 'Work Done': [] }, pickKind: null
  };

  if (DEMO) $('demoBanner').hidden = false;

  function show(id) {
    ['screenLogin', 'screenForm', 'screenDone'].forEach(s => $(s).hidden = s !== id);
    window.scrollTo({ top: 0 });
  }
  function setUserChip() {
    const c = $('userChip');
    c.hidden = !S.name;
    c.textContent = S.name ? S.name.split(' ')[0] + ' · Switch' : '';
  }

  // ---------- login ----------
  async function login() {
    const name = $('techName').value.trim(), pin = $('techPin').value.trim();
    const err = $('loginErr');
    err.hidden = true;
    if (!name || !pin) { err.textContent = 'Enter your name and the team PIN.'; err.hidden = false; return; }
    $('btnLogin').disabled = true; $('btnLogin').textContent = 'Checking…';
    try {
      S.pin = pin;
      await loadTickets();
      S.name = name;
      store.set('name', name); store.set('pin', pin);
      setUserChip();
      show('screenForm');
    } catch (e) {
      err.textContent = e.message === 'Wrong PIN' ? 'That PIN is not correct.' : 'Could not connect: ' + e.message;
      err.hidden = false;
    } finally {
      $('btnLogin').disabled = false; $('btnLogin').textContent = 'Continue';
    }
  }

  async function loadTickets() {
    const d = await apiGet({ action: 'tickets', pin: S.pin });
    S.headers = d.headers; S.rows = d.rows; S.status = d.status || {};
    S.cols = detectColumns(S.headers);
    if (!S.cols.facility || !S.cols.ticket) throw new Error('The ticket sheet needs a Facility column and a Ticket/Report No column.');
    const counts = {};
    S.rows.forEach(r => {
      const f = String(r[S.cols.facility] || '').trim();
      if (f) counts[f] = (counts[f] || 0) + 1;
    });
    S.facilities = Object.keys(counts).sort((a, b) => a.localeCompare(b)).map(f => ({ name: f, count: counts[f] }));
    renderFacilities();
    if (S.facility) {
      if (!counts[S.facility]) resetFacility(); else renderTickets();
    }
  }

  // ---------- facility ----------
  function renderFacilities() {
    const q = $('facilitySearch').value.trim().toLowerCase();
    const list = S.facilities.filter(f => f.name.toLowerCase().includes(q));
    $('facilityList').innerHTML = list.length
      ? list.map(f => `<button class="opt" role="option" data-f="${esc(f.name)}"><span>${esc(f.name)}</span><span class="pill">${f.count} ticket${f.count > 1 ? 's' : ''}</span></button>`).join('')
      : `<p class="empty">No facility matches “${esc(q)}”.</p>`;
  }
  function chooseFacility(name) {
    S.facility = name;
    $('facilitySearch').parentElement.hidden = true;
    const c = $('facilityChosen');
    c.innerHTML = `<div><span class="label">Facility</span><strong>${esc(name)}</strong></div><button class="link-btn" id="btnChangeFacility">Change</button>`;
    c.hidden = false;
    $('btnChangeFacility').onclick = resetFacility;
    $('ticketSearch').value = '';
    clearTicket();
    $('stepTicket').hidden = false;
    renderTickets();
    $('stepTicket').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function resetFacility() {
    S.facility = null;
    clearTicket();
    $('facilityChosen').hidden = true;
    $('facilitySearch').parentElement.hidden = false;
    $('facilitySearch').value = '';
    $('stepTicket').hidden = true;
    renderFacilities();
  }

  // ---------- tickets ----------
  function statusOf(r) {
    return S.status[String(r[S.cols.facility]).trim() + '||' + String(r[S.cols.ticket]).trim()];
  }
  function badges(st) {
    if (!st) return '<span class="badge open">Open</span>';
    let b = '';
    if (st.attended) b += '<span class="badge att">Attended</span>';
    if (st.workDone) b += '<span class="badge wd">Work done</span>';
    return b;
  }
  function renderTickets() {
    const C = S.cols, q = $('ticketSearch').value.trim().toLowerCase();
    const all = S.rows.filter(r => String(r[C.facility]).trim() === S.facility);
    const list = all.filter(r => !q || Object.values(r).join(' ').toLowerCase().includes(q));
    $('ticketCount').textContent = all.length + ' ticket' + (all.length > 1 ? 's' : '');
    $('ticketList').innerHTML = list.length ? list.map((r, i) => {
      const cat = [C.mainCategory, C.category, C.subCategory].filter(Boolean).map(k => r[k]).filter(Boolean).join(' › ');
      return `<button class="ticket" data-i="${S.rows.indexOf(r)}">
        <div class="t-top"><span class="t-no">${esc(r[C.ticket])}</span><span class="t-badges">${badges(statusOf(r))}</span></div>
        <div class="t-title">${esc(C.title ? r[C.title] : (C.description ? r[C.description] : ''))}</div>
        ${cat ? `<div class="t-cat">${esc(cat)}</div>` : ''}
      </button>`;
    }).join('') : '<p class="empty">No tickets match.</p>';
  }
  function chooseTicket(idx) {
    S.ticket = S.rows[idx];
    const C = S.cols;
    const st = statusOf(S.ticket);
    const order = [C.ticket, C.title, C.mainCategory, C.category, C.subCategory, C.description].filter(Boolean);
    const rest = S.headers.filter(h => !order.includes(h) && h !== C.facility);
    const fields = order.concat(rest).filter(h => String(S.ticket[h] || '').trim() !== '');
    $('ticketDetail').innerHTML = fields.map(h =>
      `<div class="${h === C.description ? 'wide' : ''}"><dt>${esc(h)}</dt><dd>${esc(S.ticket[h])}</dd></div>`
    ).join('') + (st ? `<div class="wide"><dt>History</dt><dd>${badges(st)} <span class="muted small">${st.count} record${st.count > 1 ? 's' : ''}, last ${esc(st.last || '')}${st.lastBy ? ' by ' + esc(st.lastBy) : ''}</span></dd></div>` : '');
    $('stepTicket').hidden = true;
    ['stepDetail', 'stepType'].forEach(s => $(s).hidden = false);
    // suggest next logical type
    if (st && st.attended && !st.workDone) setType('Work Done');
    $('stepDetail').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function clearTicket() {
    S.ticket = null; S.type = null;
    S.photos = { 'Attend': [], 'Work Done': [] };
    $('remarks').value = '';
    document.querySelectorAll('.seg-btn').forEach(b => { b.classList.remove('on'); b.setAttribute('aria-checked', 'false'); });
    ['stepDetail', 'stepType', 'stepPhotos', 'stepRemarks', 'submitBar'].forEach(s => $(s).hidden = true);
    if (S.facility) $('stepTicket').hidden = false;
  }

  // ---------- type + photos ----------
  function kinds() { return S.type === 'Both' ? ['Attend', 'Work Done'] : S.type ? [S.type] : []; }
  function setType(t) {
    S.type = t;
    document.querySelectorAll('.seg-btn').forEach(b => {
      const on = b.dataset.type === t;
      b.classList.toggle('on', on); b.setAttribute('aria-checked', on);
    });
    ['stepPhotos', 'stepRemarks', 'submitBar'].forEach(s => $(s).hidden = false);
    renderPhotos();
  }
  function renderPhotos() {
    const max = CFG.MAX_PHOTOS_PER_TYPE || 8;
    $('photoGroups').innerHTML = kinds().map(k => {
      const arr = S.photos[k];
      return `<div class="pgroup ${k === 'Attend' ? 'att' : 'wd'}">
        <div class="pg-head"><strong>${k} photos</strong><span class="muted small">${arr.length}/${max}</span></div>
        <div class="thumbs">
          ${arr.map((p, i) => `<figure class="thumb"><img src="${p.data}" alt="${k} photo ${i + 1}"><button class="x" data-k="${k}" data-i="${i}" aria-label="Remove photo">×</button></figure>`).join('')}
        </div>
        <div class="pg-actions">
          <button class="btn sm" data-cam="${k}" ${arr.length >= max ? 'disabled' : ''}>Take photo</button>
          <button class="btn sm ghost" data-gal="${k}" ${arr.length >= max ? 'disabled' : ''}>From gallery</button>
        </div>
      </div>`;
    }).join('');
  }

  function compress(file) {
    const maxSide = CFG.PHOTO_MAX_SIDE || 1600, q = CFG.PHOTO_QUALITY || 0.72;
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        let { width: w, height: h } = img;
        const s = Math.min(1, maxSide / Math.max(w, h));
        w = Math.round(w * s); h = Math.round(h * s);
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        // timestamp watermark
        const stamp = new Date().toLocaleString('en-GB') + '  ' + (S.facility || '') + '  ' + (S.ticket ? S.ticket[S.cols.ticket] : '');
        const fs = Math.max(14, Math.round(w / 45));
        ctx.font = `700 ${fs}px sans-serif`;
        const tw = ctx.measureText(stamp).width;
        ctx.fillStyle = 'rgba(0,0,0,.55)';
        ctx.fillRect(0, h - fs * 1.8, Math.min(w, tw + fs), fs * 1.8);
        ctx.fillStyle = '#fff';
        ctx.fillText(stamp, fs / 2, h - fs * 0.6);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', q));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read image')); };
      img.src = url;
    });
  }
  async function addFiles(files) {
    const k = S.pickKind, max = CFG.MAX_PHOTOS_PER_TYPE || 8;
    for (const f of Array.from(files)) {
      if (S.photos[k].length >= max) { toast('Maximum ' + max + ' photos for ' + k, 'warn'); break; }
      try { S.photos[k].push({ data: await compress(f), kind: k }); } catch (e) { toast(e.message, 'err'); }
    }
    renderPhotos();
  }

  // ---------- GPS ----------
  function getGps() {
    return new Promise(resolve => {
      if (!$('useGps').checked || !navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        p => resolve({ lat: p.coords.latitude.toFixed(6), lng: p.coords.longitude.toFixed(6), accuracy: Math.round(p.coords.accuracy) }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
      );
    });
  }

  // ---------- submit ----------
  async function submit() {
    if (!S.ticket) return toast('Pick a ticket first', 'warn');
    if (!S.type) return toast('Choose Attend, Work Done or Both', 'warn');
    if (CFG.REQUIRE_PHOTO) {
      const missing = kinds().filter(k => !S.photos[k].length);
      if (missing.length) return toast('Add at least one ' + missing.join(' and ') + ' photo', 'warn');
    }
    const ov = $('overlay'), bar = $('overlayBar');
    ov.hidden = false; $('overlayText').textContent = 'Getting location…'; bar.style.width = '10%';
    const gps = await getGps();
    $('overlayText').textContent = 'Uploading photos…'; bar.style.width = '40%';
    const tick = setInterval(() => { const w = parseFloat(bar.style.width); if (w < 90) bar.style.width = (w + 4) + '%'; }, 500);
    const photos = kinds().flatMap(k => S.photos[k].map(p => ({ kind: k, mime: 'image/jpeg', data: p.data })));
    const type = S.type === 'Both' ? 'Attend + Work Done' : S.type;
    try {
      const res = await apiPost({
        action: 'submit', pin: S.pin, technician: S.name,
        facility: S.facility, ticketNo: S.ticket[S.cols.ticket], ticket: S.ticket,
        type, remarks: $('remarks').value.trim(), photos,
        lat: gps && gps.lat, lng: gps && gps.lng, accuracy: gps && gps.accuracy,
        clientTime: new Date().toISOString()
      });
      bar.style.width = '100%';
      // update local status
      const k = S.facility + '||' + S.ticket[S.cols.ticket];
      const st = S.status[k] || (S.status[k] = { attended: false, workDone: false, count: 0 });
      if (type.includes('Attend')) st.attended = true;
      if (type.includes('Work Done')) st.workDone = true;
      st.count++; st.last = new Date().toLocaleString('en-GB'); st.lastBy = S.name;
      $('doneSummary').innerHTML = [
        ['Reference', res.id], ['Facility', S.facility], ['Ticket', S.ticket[S.cols.ticket]], ['Type', type], ['Photos', photos.length],
        ['Location', gps ? gps.lat + ', ' + gps.lng : 'Not attached']
      ].map(([a, b]) => `<div><dt>${a}</dt><dd>${esc(b)}</dd></div>`).join('');
      show('screenDone');
    } catch (e) {
      toast('Not sent: ' + e.message + '. Check your signal and try again.', 'err');
    } finally {
      clearInterval(tick); ov.hidden = true;
    }
  }

  // ---------- events ----------
  $('btnLogin').onclick = login;
  $('techPin').addEventListener('keydown', e => { if (e.key === 'Enter') login(); });
  $('userChip').onclick = () => {
    if (!confirm('Sign out and switch technician?')) return;
    store.del('name'); store.del('pin'); S.name = ''; S.pin = '';
    setUserChip(); $('techName').value = ''; $('techPin').value = ''; show('screenLogin');
  };
  $('facilitySearch').addEventListener('input', renderFacilities);
  $('facilityList').addEventListener('click', e => { const b = e.target.closest('[data-f]'); if (b) chooseFacility(b.dataset.f); });
  $('ticketSearch').addEventListener('input', renderTickets);
  $('ticketList').addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) chooseTicket(+b.dataset.i); });
  $('btnChangeTicket').onclick = () => { clearTicket(); renderTickets(); };
  document.querySelector('.seg').addEventListener('click', e => { const b = e.target.closest('.seg-btn'); if (b) setType(b.dataset.type); });
  $('photoGroups').addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.cam) { S.pickKind = t.dataset.cam; $('fileCamera').click(); }
    else if (t.dataset.gal) { S.pickKind = t.dataset.gal; $('fileGallery').click(); }
    else if (t.classList.contains('x')) { S.photos[t.dataset.k].splice(+t.dataset.i, 1); renderPhotos(); }
  });
  ['fileCamera', 'fileGallery'].forEach(id => $(id).addEventListener('change', async e => { await addFiles(e.target.files); e.target.value = ''; }));
  $('btnSubmit').onclick = submit;
  $('btnRefresh').onclick = async () => {
    $('btnRefresh').textContent = 'Loading…';
    try { await loadTickets(); toast('Ticket list updated'); } catch (e) { toast(e.message, 'err'); }
    $('btnRefresh').textContent = 'Refresh';
  };
  $('btnAnother').onclick = () => { resetFacility(); show('screenForm'); loadTickets().catch(() => {}); };
  $('btnSameFacility').onclick = () => { const f = S.facility; show('screenForm'); chooseFacility(f); };

  // ---------- start ----------
  (async function init() {
    if (S.name && S.pin) {
      setUserChip();
      show('screenForm');
      $('facilityList').innerHTML = '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>';
      try { await loadTickets(); }
      catch (e) { if (e.message === 'Wrong PIN') { store.del('pin'); show('screenLogin'); } else toast('Could not load tickets: ' + e.message, 'err'); }
    } else {
      $('techName').value = S.name || '';
      show('screenLogin');
    }
  })();
})();
