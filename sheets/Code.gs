// Upper Mad River Explorer: community input logger (Google Apps Script).
//
// Same pattern as the Lost Meadows map's download logger: the explorer sends a
// small JSON beacon to this web app's /exec URL, and doPost() appends one row to
// the Google Sheet this script is bound to. Two tabs: "places" and "sketches".
//
// Review happens in the Sheet itself. Every new row arrives with status "pending".
// Change the status cell to "approved" (or "rejected") and the explorer picks it
// up within a minute. Only approved rows, and only their public columns, are ever
// sent back to the public page (doGet).
//
// SETUP (README.md has the click-by-click version):
//   1. Make a new blank Google Sheet in WRTC's Drive.
//   2. In that Sheet: Extensions > Apps Script. Delete the stub, paste this file, Save.
//   3. Deploy > New deployment > type "Web app":
//        Execute as:        Me
//        Who has access:    Anyone
//      Deploy, authorize, and copy the Web app /exec URL.
//   4. Paste that URL into sheetEndpoint in config.js, then commit + push.
//
// The script must be BOUND to the Sheet (created from inside the Sheet, step 2)
// so getActiveSpreadsheet() resolves to it.

var TABS = {
  places: {
    headers: ['id', 'submitted_utc', 'status', 'kind', 'title', 'note', 'display_name', 'lng', 'lat', 'review_note', 'referrer'],
    public: ['id', 'submitted_utc', 'kind', 'title', 'note', 'display_name', 'lng', 'lat']
  },
  sketches: {
    headers: ['id', 'submitted_utc', 'status', 'name', 'lead', 'start_year', 'lng', 'lat', 'radius_m', 'crossings',
              'diversion_prone', 'fill_m3', 'cost_usd', 'unit_costs', 'review_note', 'referrer'],
    public: ['id', 'submitted_utc', 'name', 'lead', 'start_year', 'lng', 'lat', 'radius_m', 'crossings',
             'diversion_prone', 'fill_m3', 'cost_usd', 'unit_costs']
  }
};
var KINDS = ['swim', 'fish', 'view', 'wild', 'problem', 'idea', 'story'];
// Mad River basin envelope (WGS84); anything outside is dropped.
var BOX = { w: -124.30, e: -123.20, s: 40.20, n: 41.05 };

function tab_(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    var h = TABS[name].headers;
    sh.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold');
    sh.setFrozenRows(1);
    var rule = SpreadsheetApp.newDataValidation().requireValueInList(['pending', 'approved', 'rejected'], true).build();
    sh.getRange(2, h.indexOf('status') + 1, sh.getMaxRows() - 1, 1).setDataValidation(rule);
  }
  return sh;
}
function str_(v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max); }
function num_(v, lo, hi) { var x = Number(v); return isFinite(x) && x >= lo && x <= hi ? x : null; }
// A leading = + - @ would make Sheets read the cell as a formula.
function safe_(s) { return /^[=+\-@]/.test(s) ? "'" + s : s; }

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var d = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (d.hp) return out_('ok');                                   // bot trap filled in
    var lng = num_(d.lng, BOX.w, BOX.e), lat = num_(d.lat, BOX.s, BOX.n);
    if (lng == null || lat == null) return out_('err: outside the basin');
    // the page makes the id so it can match its own pending entries to approved rows later
    var id = /^[a-z0-9]{6,16}$/.test(d.id) ? d.id : Utilities.getUuid().slice(0, 8), now = new Date().toISOString(), ref = str_(d.ref, 200), row;
    if (d.table === 'places') {
      var kind = KINDS.indexOf(d.kind) >= 0 ? d.kind : 'story', title = str_(d.title, 80);
      if (!title) return out_('err: no title');
      row = [id, now, 'pending', kind, safe_(title), safe_(str_(d.note, 600)), safe_(str_(d.display_name, 60)), lng, lat, '', ref];
    } else if (d.table === 'sketches') {
      var uc = d.unit_costs && typeof d.unit_costs === 'object' ? JSON.stringify(d.unit_costs).slice(0, 300) : '';
      row = [id, now, 'pending', safe_(str_(d.name, 70) || 'Unnamed sketch'), safe_(str_(d.lead, 70)),
             num_(d.start_year, 2025, 2040), lng, lat, num_(d.radius_m, 50, 5000), num_(d.crossings, 0, 1e5),
             num_(d.diversion_prone, 0, 1e5), num_(d.fill_m3, 0, 1e8), num_(d.cost_usd, 0, 1e10), uc, '', ref];
    } else return out_('err: unknown table');
    lock.waitLock(10000);
    tab_(d.table).appendRow(row);
    return out_('ok');
  } catch (err) {
    return out_('err: ' + err);                                    // never 500 on a bad beacon
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

// GET ?table=places|sketches            -> approved rows as JSON (what the explorer reads)
// GET ?table=places&format=geojson      -> approved rows as GeoJSON (for QGIS or a download link)
// GET with no table                     -> "live" check, handy after deploying
function doGet(e) {
  var p = (e && e.parameter) || {}, t = p.table;
  if (!TABS[t]) return out_('Upper Mad River Explorer logger is live.');
  var key = t + '|' + (p.format || 'json'), cache = CacheService.getScriptCache(), hit = cache.get(key);
  if (hit) return json_(hit);
  var sh = tab_(t), vals = sh.getDataRange().getValues(), H = vals[0], st = H.indexOf('status'), pub = TABS[t].public;
  var rows = vals.slice(1).filter(function (r) { return String(r[st]).toLowerCase() === 'approved'; }).map(function (r) {
    var o = {};
    pub.forEach(function (k) {
      var v = r[H.indexOf(k)];
      if (v instanceof Date) v = v.toISOString();
      if (k === 'unit_costs') { try { v = v ? JSON.parse(v) : null; } catch (x) { v = null; } }
      if (typeof v === 'string' && v.charAt(0) === "'") v = v.slice(1);
      o[k] = v === '' ? null : v;
    });
    return o;
  });
  var body = p.format === 'geojson'
    ? JSON.stringify({ type: 'FeatureCollection', features: rows.map(function (o) {
        return { type: 'Feature', geometry: { type: 'Point', coordinates: [o.lng, o.lat] }, properties: o }; }) })
    : JSON.stringify(rows);
  if (body.length < 90000) cache.put(key, body, 60);                // one-minute cache keeps quota use low
  return json_(body);
}
function out_(s) { return ContentService.createTextOutput(s); }
function json_(s) { return ContentService.createTextOutput(s).setMimeType(ContentService.MimeType.JSON); }
