/* Shared helpers for the technician app and the admin page. */
(function () {
  const CFG = window.APP_CONFIG || {};
  const DEMO = !CFG.API_URL;

  // ---- tiny cookie store (remembers name / PIN on the device) ----
  const store = {
    get(k) {
      try {
        const m = document.cookie.split('; ').find(c => c.startsWith('fjl_' + k + '='));
        return m ? decodeURIComponent(m.split('=').slice(1).join('=')) : '';
      } catch (e) { return ''; }
    },
    set(k, v) {
      try { document.cookie = 'fjl_' + k + '=' + encodeURIComponent(v) + '; max-age=31536000; path=/; SameSite=Lax'; } catch (e) {}
    },
    del(k) { try { document.cookie = 'fjl_' + k + '=; max-age=0; path=/'; } catch (e) {} }
  };

  // ---- column detection: works with whatever headers your Excel has ----
  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  function findCol(headers, patterns) {
    for (const p of patterns) {
      const h = headers.find(x => norm(x) === p);
      if (h) return h;
    }
    for (const p of patterns) {
      const h = headers.find(x => norm(x).includes(p));
      if (h) return h;
    }
    return null;
  }
  function detectColumns(headers) {
    return {
      facility: findCol(headers, ['facility', 'facilityname', 'location', 'store', 'outlet', 'branch', 'site', 'restaurant']),
      ticket: findCol(headers, ['ticketno', 'ticketnumber', 'reportno', 'reportnumber', 'ticket', 'report', 'refno', 'reference', 'wo', 'workorder']),
      title: findCol(headers, ['title', 'subject', 'summary']),
      mainCategory: findCol(headers, ['maincategory']),
      category: headers.find(x => norm(x) === 'category') || null,
      subCategory: findCol(headers, ['subcategory']),
      description: findCol(headers, ['description', 'details', 'problem'])
    };
  }

  // ---- demo data (used only when API_URL is empty) ----
  const demo = {
    headers: ['Facility', 'Ticket No', 'Main Category', 'Category', 'Sub Category', 'Title', 'Description', 'Priority', 'Reported Date'],
    rows: [
      ['KFC Kota Bharu', 'TKT-24101', 'Building Maintenance', 'Electrical', 'Lighting', 'Dining area lights flickering', 'Three ceiling panels in the dining hall flicker during peak hours. Check ballast and wiring.', 'High', '2026-10-14'],
      ['KFC Kota Bharu', 'TKT-24107', 'Kitchen Equipment', 'Refrigeration', 'Chiller', 'Walk-in chiller temperature high', 'Chiller reading 9°C, should be 1–4°C. Door gasket may be worn.', 'Critical', '2026-10-16'],
      ['KFC Kota Bharu', 'TKT-24112', 'Building Maintenance', 'Plumbing', 'Drainage', 'Slow drain at wash area', 'Floor trap at dishwashing area drains slowly; grease build-up suspected.', 'Medium', '2026-10-18'],
      ['KFC Bandar Saujana Utama', 'TKT-24088', 'HVAC', 'Air Conditioning', 'Split Unit', 'Counter aircon not cold', 'Split unit above counter blowing warm air. Possible gas leak or dirty filter.', 'High', '2026-10-12'],
      ['KFC Bandar Saujana Utama', 'TKT-24095', 'Kitchen Equipment', 'Cooking', 'Pressure Fryer', 'Fryer #2 not reaching temp', 'Pressure fryer 2 heats slowly and trips at 150°C.', 'Critical', '2026-10-15'],
      ['KFC Shah Alam Seksyen 7', 'TKT-24070', 'Building Maintenance', 'Civil', 'Signage', 'Pylon sign partly unlit', 'Two letters on the pylon sign are not lit at night.', 'Low', '2026-10-09'],
      ['KFC Kuantan Teluk Cempedak', 'TKT-24099', 'HVAC', 'Ventilation', 'Exhaust Hood', 'Kitchen exhaust noisy', 'Loud rattling from the exhaust hood fan motor.', 'Medium', '2026-10-17']
    ]
  };
  const demoState = {
    tickets: demo.rows.map(r => Object.fromEntries(demo.headers.map((h, i) => [h, r[i]]))),
    headers: demo.headers.slice(),
    submissions: [],
    status: { 'KFC Kota Bharu||TKT-24101': { attended: true, workDone: false, count: 1, last: '2026-10-19 10:12:00', lastBy: 'Ahmad' } }
  };
  const wait = ms => new Promise(r => setTimeout(r, ms));

  // ---- API ----
  async function apiGet(params) {
    if (DEMO) return demoGet(params);
    const url = CFG.API_URL + '?' + new URLSearchParams(params).toString();
    const res = await fetch(url, { method: 'GET', redirect: 'follow' });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Request failed');
    return data;
  }
  async function apiPost(body) {
    if (DEMO) return demoPost(body);
    // text/plain avoids a CORS preflight, which Apps Script does not support
    const res = await fetch(CFG.API_URL, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  async function demoGet(p) {
    await wait(350);
    if (p.action === 'tickets') return { ok: true, headers: demoState.headers, rows: demoState.tickets, status: demoState.status, updated: new Date().toISOString() };
    if (p.action === 'submissions') return { ok: true, headers: [], rows: demoState.submissions.slice().reverse(), sheetUrl: '', folderUrl: '' };
    return { ok: true };
  }
  async function demoPost(b) {
    await wait(900);
    if (b.action === 'replaceTickets') {
      demoState.headers = b.headers.slice();
      demoState.tickets = b.rows;
      return { ok: true, count: b.rows.length };
    }
    if (b.action === 'submit') {
      const id = 'S-DEMO-' + (demoState.submissions.length + 1);
      const t = b.ticket || {};
      const att = b.photos.filter(p => p.kind === 'Attend').map(p => p.data);
      const wd = b.photos.filter(p => p.kind === 'Work Done').map(p => p.data);
      demoState.submissions.push({
        'Submission ID': id, 'Timestamp': new Date().toLocaleString('en-GB'), 'Technician': b.technician,
        'Facility': b.facility, 'Ticket No': b.ticketNo, 'Type': b.type, 'Remarks': b.remarks,
        'Main Category': t['Main Category'] || '', 'Category': t['Category'] || '', 'Sub Category': t['Sub Category'] || '', 'Title': t['Title'] || '',
        'Attend Photos': att.join('\n'), 'Work Done Photos': wd.join('\n'), 'Photo Count': b.photos.length, 'Photo Folder': '',
        'Latitude': b.lat || '', 'Longitude': b.lng || '', 'GPS Accuracy (m)': b.accuracy || '',
        'Map Link': b.lat ? 'https://maps.google.com/?q=' + b.lat + ',' + b.lng : '', 'Device Time': b.clientTime
      });
      const k = b.facility + '||' + b.ticketNo;
      const s = demoState.status[k] || (demoState.status[k] = { attended: false, workDone: false, count: 0 });
      if (b.type.includes('Attend')) s.attended = true;
      if (b.type.includes('Work Done')) s.workDone = true;
      s.count++; s.last = new Date().toLocaleString('en-GB'); s.lastBy = b.technician;
      return { ok: true, id, photos: b.photos.length };
    }
    return { ok: false, error: 'Unknown action' };
  }

  // ---- Drive helpers: turn a Drive file URL into a thumbnail URL ----
  function driveId(url) {
    const m = String(url).match(/\/d\/([\w-]{10,})/) || String(url).match(/[?&]id=([\w-]{10,})/);
    return m ? m[1] : null;
  }
  function thumbUrl(url, size) {
    if (String(url).startsWith('data:')) return url;
    const id = driveId(url);
    return id ? 'https://drive.google.com/thumbnail?id=' + id + '&sz=w' + (size || 400) : url;
  }

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function toast(msg, kind) {
    let el = document.getElementById('toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = msg;
    el.className = 'toast show ' + (kind || '');
    clearTimeout(el._t);
    el._t = setTimeout(() => el.className = 'toast', 3200);
  }

  // ---- service worker (makes it installable / "Add to Home screen") ----
  if ('serviceWorker' in navigator && location.protocol === 'https:' && window.top === window.self) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
  }

  window.FJL = { CFG, DEMO, store, detectColumns, norm, apiGet, apiPost, thumbUrl, driveId, esc, toast };
})();
