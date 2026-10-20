/**
 * Facility Job Log — backend (Google Apps Script)
 * ------------------------------------------------
 * Paste this whole file into Extensions > Apps Script of your Google Sheet.
 * It turns the Sheet + a Google Drive folder into the database for the app.
 *
 *   Tickets      sheet = the ticket list technicians see (replace it by uploading Excel in admin.html,
 *                        or simply edit / paste rows into this sheet directly)
 *   Submissions  sheet = every Attend / Work Done record your technicians send
 *   Drive folder       = all photos, organised as  Root / Facility / Ticket No / photo.jpg
 *
 * 1. Change the two passwords below.
 * 2. Run the function  setup  once (authorise when asked).
 * 3. Deploy > New deployment > Web app > Execute as: Me, Who has access: Anyone > Deploy.
 * 4. Copy the Web app URL into app/config.js  (API_URL).
 */

// ===== SETTINGS — CHANGE THESE =====
const TECH_PIN = '1234';               // PIN your technicians type in the app
const ADMIN_KEY = 'change-this-admin-key'; // password for admin.html (upload Excel, view records)
const ROOT_FOLDER_NAME = 'Facility Job Log Photos';
const SHARE_PHOTOS_BY_LINK = true;     // true = photos viewable by anyone with the link (needed for thumbnails in admin.html)
const TIMEZONE = 'Asia/Kuala_Lumpur';
// ===================================

const TICKETS_SHEET = 'Tickets';
const SUBMISSIONS_SHEET = 'Submissions';
const DEFAULT_TICKET_HEADERS = ['Facility', 'Ticket No', 'Main Category', 'Category', 'Sub Category', 'Title', 'Description'];
const SUBMISSION_HEADERS = [
  'Submission ID', 'Timestamp', 'Technician', 'Facility', 'Ticket No', 'Type', 'Remarks',
  'Main Category', 'Category', 'Sub Category', 'Title',
  'Attend Photos', 'Work Done Photos', 'Photo Count', 'Photo Folder',
  'Latitude', 'Longitude', 'GPS Accuracy (m)', 'Map Link', 'Device Time'
];

/** Run once from the editor. */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const t = ensureSheet_(TICKETS_SHEET, DEFAULT_TICKET_HEADERS);
  ensureSheet_(SUBMISSIONS_SHEET, SUBMISSION_HEADERS);
  const folder = getRootFolder_();
  Logger.log('Sheet: ' + ss.getUrl());
  Logger.log('Photo folder: ' + folder.getUrl());
  Logger.log('Tickets rows: ' + Math.max(0, t.getLastRow() - 1));
}

// ---------- HTTP entry points ----------
function doGet(e) {
  try {
    const p = (e && e.parameter) || {};
    switch (p.action) {
      case 'tickets':
        if (String(p.key || '') !== String(ADMIN_KEY)) checkPin_(p.pin);
        return json_(getTickets_());
      case 'submissions':
        checkAdmin_(p.key);
        return json_(getSubmissions_());
      case 'ping':
        return json_({ ok: true, time: new Date().toISOString() });
      default:
        return json_({ ok: false, error: 'Unknown action' });
    }
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || '{}');
    switch (body.action) {
      case 'submit':
        checkPin_(body.pin);
        return json_(saveSubmission_(body));
      case 'replaceTickets':
        checkAdmin_(body.key);
        return json_(replaceTickets_(body.headers, body.rows));
      default:
        return json_({ ok: false, error: 'Unknown action' });
    }
  } catch (err) {
    return json_({ ok: false, error: String(err.message || err) });
  }
}

// ---------- Tickets ----------
function getTickets_() {
  const sh = ensureSheet_(TICKETS_SHEET, DEFAULT_TICKET_HEADERS);
  const values = sh.getDataRange().getDisplayValues();
  const headers = (values.shift() || []).map(String);
  const rows = values
    .filter(r => r.some(c => String(c).trim() !== ''))
    .map(r => {
      const o = {};
      headers.forEach((h, i) => { if (h) o[h] = r[i]; });
      return o;
    });
  return { ok: true, headers: headers.filter(Boolean), rows: rows, status: getStatus_(), updated: new Date().toISOString() };
}

function replaceTickets_(headers, rows) {
  if (!Array.isArray(headers) || !headers.length) throw new Error('No columns found in the uploaded file');
  if (!Array.isArray(rows)) throw new Error('No rows found');
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sh = ensureSheet_(TICKETS_SHEET, headers);
    sh.clear();
    const data = [headers].concat(rows.map(r => headers.map(h => (r[h] === undefined || r[h] === null) ? '' : r[h])));
    sh.getRange(1, 1, data.length, headers.length).setNumberFormat('@').setValues(data);
    sh.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sh.setFrozenRows(1);
    return { ok: true, count: rows.length };
  } finally {
    lock.releaseLock();
  }
}

/** Latest status per facility + ticket, derived from Submissions. */
function getStatus_() {
  const sh = ensureSheet_(SUBMISSIONS_SHEET, SUBMISSION_HEADERS);
  if (sh.getLastRow() < 2) return {};
  const values = sh.getDataRange().getDisplayValues();
  const h = values.shift();
  const iF = h.indexOf('Facility'), iT = h.indexOf('Ticket No'), iY = h.indexOf('Type'), iS = h.indexOf('Timestamp'), iN = h.indexOf('Technician');
  const out = {};
  values.forEach(r => {
    const k = String(r[iF]).trim() + '||' + String(r[iT]).trim();
    const s = out[k] || (out[k] = { attended: false, workDone: false, count: 0, last: '', lastBy: '' });
    const type = String(r[iY]);
    if (type.indexOf('Attend') > -1) s.attended = true;
    if (type.indexOf('Work Done') > -1) s.workDone = true;
    s.count++;
    s.last = r[iS];
    s.lastBy = r[iN];
  });
  return out;
}

// ---------- Submissions ----------
function saveSubmission_(b) {
  if (!b.facility || !b.ticketNo) throw new Error('Facility and ticket are required');
  if (!b.type) throw new Error('Choose Attend, Work Done or both');
  const photos = Array.isArray(b.photos) ? b.photos : [];

  const now = new Date();
  const id = 'S' + Utilities.formatDate(now, TIMEZONE, 'yyMMdd-HHmmss') + '-' + Math.floor(Math.random() * 900 + 100);
  const stamp = Utilities.formatDate(now, TIMEZONE, 'yyyyMMdd-HHmmss');

  const root = getRootFolder_();
  const facFolder = getOrCreateChild_(root, safeName_(b.facility));
  const tktFolder = getOrCreateChild_(facFolder, safeName_(b.ticketNo));

  const links = { 'Attend': [], 'Work Done': [] };
  photos.forEach((p, i) => {
    const kind = p.kind === 'Work Done' ? 'Work Done' : 'Attend';
    const bytes = Utilities.base64Decode(String(p.data).replace(/^data:[^,]+,/, ''));
    const name = [safeName_(b.ticketNo), kind.replace(' ', ''), stamp, String(i + 1).padStart(2, '0')].join('_') + '.jpg';
    const file = tktFolder.createFile(Utilities.newBlob(bytes, p.mime || 'image/jpeg', name));
    file.setDescription('Technician: ' + (b.technician || '') + ' | ' + kind + ' | ' + id);
    if (SHARE_PHOTOS_BY_LINK) {
      try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) { /* domain policy may block */ }
    }
    links[kind].push(file.getUrl());
  });

  const t = b.ticket || {};
  const pick = (names) => {
    const keys = Object.keys(t);
    for (const n of names) {
      const k = keys.find(x => norm_(x) === norm_(n));
      if (k) return t[k];
    }
    return '';
  };
  const lat = b.lat || '', lng = b.lng || '';
  const row = [
    id,
    Utilities.formatDate(now, TIMEZONE, 'yyyy-MM-dd HH:mm:ss'),
    b.technician || '',
    b.facility,
    b.ticketNo,
    b.type,
    b.remarks || '',
    pick(['Main Category', 'MainCategory']),
    pick(['Category']),
    pick(['Sub Category', 'Subcategory', 'Sub-Category']),
    pick(['Title', 'Subject']),
    links['Attend'].join('\n'),
    links['Work Done'].join('\n'),
    photos.length,
    tktFolder.getUrl(),
    lat, lng, b.accuracy || '',
    (lat && lng) ? ('https://maps.google.com/?q=' + lat + ',' + lng) : '',
    b.clientTime || ''
  ];

  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    ensureSheet_(SUBMISSIONS_SHEET, SUBMISSION_HEADERS).appendRow(row);
  } finally {
    lock.releaseLock();
  }
  return { ok: true, id: id, photos: photos.length, folder: tktFolder.getUrl() };
}

function getSubmissions_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ensureSheet_(SUBMISSIONS_SHEET, SUBMISSION_HEADERS);
  const values = sh.getDataRange().getDisplayValues();
  const headers = values.shift() || [];
  const rows = values.map(r => {
    const o = {};
    headers.forEach((h, i) => o[h] = r[i]);
    return o;
  }).reverse(); // newest first
  return { ok: true, headers: headers, rows: rows, sheetUrl: ss.getUrl(), folderUrl: getRootFolder_().getUrl() };
}

// ---------- helpers ----------
function checkPin_(pin) { if (String(pin) !== String(TECH_PIN)) throw new Error('Wrong PIN'); }
function checkAdmin_(key) { if (String(key) !== String(ADMIN_KEY)) throw new Error('Wrong admin key'); }

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function ensureSheet_(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function getRootFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('ROOT_FOLDER_ID');
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { /* deleted — recreate */ }
  }
  const f = DriveApp.createFolder(ROOT_FOLDER_NAME);
  props.setProperty('ROOT_FOLDER_ID', f.getId());
  return f;
}

function getOrCreateChild_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

function safeName_(s) { return String(s).replace(/[\\/:*?"<>|#%]+/g, '-').trim().slice(0, 80) || 'Unknown'; }
function norm_(s) { return String(s).toLowerCase().replace(/[^a-z0-9]/g, ''); }
