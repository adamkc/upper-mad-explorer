/* ---------------- community store: a Google Sheet (Apps Script web app) when config.js names one, this browser otherwise ---------------- */
// Same pattern as the Lost Meadows map: entries go out as a JSON beacon and land as a "pending" row in the Sheet.
// A reviewer types "approved" in the Sheet; the script's GET returns approved rows only.
const CFG = window.EXPLORER_CONFIG || {};
const EP = (CFG.sheetEndpoint || "").trim();
const LIVE = /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(EP);
const ls = {
  get(k, d){ try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } },
  set(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};
const newId = () => (Date.now().toString(36) + Math.random().toString(36).slice(2, 7)).slice(0, 16);
const TAB = { places: "places", project_sketches: "sketches" };
const store = {
  // approved rows (live) or this browser's demo rows
  async list(table){
    if (!LIVE) return ls.get("demo_" + table, []);
    const r = await fetch(EP + "?table=" + TAB[table], { cache: "no-store" }); if (!r.ok) throw new Error(r.status);
    const rows = await r.json(); if (!Array.isArray(rows)) throw new Error("bad reply");
    rows.forEach(p => { p.created_at = p.submitted_utc; p.status = "approved"; ["lng", "lat", "radius_m", "crossings", "diversion_prone", "fill_m3", "cost_usd", "start_year"].forEach(k => { if (p[k] != null) p[k] = +p[k]; }); });
    // drop this browser's pending copies once the reviewer has approved them
    const got = new Set(rows.map(p => String(p.id)));
    ls.set("mine_" + table, mine(table).filter(p => !got.has(p.id) && Date.now() - Date.parse(p.created_at) < 90 * 864e5));
    return rows;
  },
  async add(table, row){
    const rec = Object.assign({ id: newId(), created_at: new Date().toISOString() }, row);
    if (!LIVE) { const a = ls.get("demo_" + table, []); a.unshift(Object.assign({ status: "demo" }, rec)); ls.set("demo_" + table, a.slice(0, 300)); return rec; }
    const body = JSON.stringify(Object.assign({ table: TAB[table], ref: location.origin + location.pathname }, rec));
    // text/plain beacon: no CORS preflight, and it still goes out if the visitor leaves the page
    const sent = navigator.sendBeacon && navigator.sendBeacon(EP, new Blob([body], { type: "text/plain;charset=utf-8" }));
    if (!sent) await fetch(EP, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain;charset=utf-8" }, body, keepalive: true });
    return rec;
  },
  removeDemo(table, id){ ls.set("demo_" + table, ls.get("demo_" + table, []).filter(r => r.id !== id)); }
};
// what this browser sent in that is still waiting for review (live mode only)
function mine(table){ return ls.get("mine_" + table, []); }
const remember = (table, row) => ls.set("mine_" + table, [Object.assign({ status: "pending" }, row)].concat(mine(table)).slice(0, 100));
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
$$("[data-mode]").forEach(el => el.textContent = LIVE
  ? "Entries go to the project's review sheet and appear here once a reviewer approves them."
  : "Demo mode: this copy is not connected to the review sheet yet, so entries stay in this browser only.");

/* ---------------- TAB 3: your places ---------------- */
const PTYPES = [["swim", "Swimming hole", "#2F86B5"], ["fish", "Fishing spot", "#127A7A"], ["view", "Favorite view", "#7A5EA8"], ["wild", "Wildlife", "#2F6B45"],
  ["problem", "Problem spot", "#C2491D"], ["idea", "Restoration idea", "#C9952C"], ["story", "Memory or story", "#8C6D4F"]];
const ptype = k => PTYPES.find(t => t[0] === k) || PTYPES[6];
let mapP = null, pinType = "swim", pick = null, APINS = [], pinMarker = null, pickMode = false, pinFilter = new Set(PTYPES.map(t => t[0]));
inits.places = () => {
  if (mapP) { mapP.resize(); return; }
  $("#pinTypes").innerHTML = PTYPES.map(t => `<button class="chip" data-t="${t[0]}" aria-pressed="${t[0] === pinType}"><i style="background:${t[2]}"></i>${t[1]}</button>`).join("");
  $$("#pinTypes .chip").forEach(c => c.addEventListener("click", () => { pinType = c.dataset.t; $$("#pinTypes .chip").forEach(x => x.setAttribute("aria-pressed", x === c)); }));
  $("#pinFilter").innerHTML = PTYPES.map(t => `<button class="chip" data-t="${t[0]}" aria-pressed="true"><i style="background:${t[2]}"></i>${t[1]}</button>`).join("");
  $$("#pinFilter .chip").forEach(c => c.addEventListener("click", () => { const t = c.dataset.t; pinFilter.has(t) ? pinFilter.delete(t) : pinFilter.add(t); c.setAttribute("aria-pressed", pinFilter.has(t)); renderPins(); }));
  mapP = baseMap("mapP");
  mapP.ready.then(map => {
    map.addSource("pins", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addLayer({ id: "pins", type: "circle", source: "pins", paint: { "circle-radius": 7, "circle-color": ["get", "c"], "circle-opacity": ["case", ["get", "pending"], 0.45, 1],
      "circle-stroke-color": "#fff", "circle-stroke-width": 1.6 } });
    map.on("click", e => { if (!pickMode) return; pick = [e.lngLat.lng, e.lngLat.lat]; pickMode = false; $("#pinHint").hidden = true;
      if (pinMarker) pinMarker.remove(); pinMarker = new maplibregl.Marker({ color: ptype(pinType)[2] }).setLngLat(pick).addTo(map);
      $("#bPick").textContent = "1 · Spot picked (click to move)"; validatePin(); });
    map.on("click", "pins", e => { if (pickMode) return; const p = e.features[0].properties;
      new maplibregl.Popup({ maxWidth: "260px" }).setLngLat(e.lngLat).setHTML(`<b style="font-family:var(--display);font-size:16px">${esc(p.title)}</b><br><span style="font-size:12px">${esc(p.typeName)}${p.pending ? " · awaiting review" : ""}</span><p style="margin:6px 0 0">${esc(p.note)}</p>`).addTo(map); });
    refreshPins();
  });
};
async function refreshPins(){
  try { APINS = await store.list("places"); } catch (e) { $("#pinStatus").textContent = "The shared map can't be reached right now. Try again in a little while."; }
  renderPins();
}
$("#bPick").addEventListener("click", () => { pickMode = true; $("#pinHint").hidden = false; });
["pTitle", "pOk"].forEach(id => $("#" + id).addEventListener("input", validatePin)); $("#pOk").addEventListener("change", validatePin);
function validatePin(){ $("#bSave").disabled = !(pick && $("#pTitle").value.trim() && $("#pOk").checked); }
$("#bSave").addEventListener("click", async () => {
  const done = () => { $("#pTitle").value = ""; $("#pNote").value = ""; $("#pName").value = ""; $("#pOk").checked = false; pick = null;
    if (pinMarker) pinMarker.remove(); $("#bPick").textContent = "1 · Pick the spot on the map"; validatePin(); };
  if ($("#pWeb").value) { $("#pinStatus").textContent = "Thanks, it's in the review queue."; done(); return; }   // bot trap
  const row = { kind: pinType, title: $("#pTitle").value.trim().slice(0, 80), note: $("#pNote").value.trim().slice(0, 600) || null,
    display_name: $("#pName").value.trim().slice(0, 60) || null, lng: +pick[0].toFixed(5), lat: +pick[1].toFixed(5) };
  $("#bSave").disabled = true; $("#pinStatus").textContent = "Sending…";
  try {
    const rec = await store.add("places", row);
    if (LIVE) remember("places", rec);
    $("#pinStatus").textContent = LIVE ? "Thanks. It will show on the map once a reviewer approves it." : "Saved in this browser (demo mode).";
    done(); refreshPins();
  } catch (e) { $("#pinStatus").textContent = "Couldn't send it. Check the connection and try again."; validatePin(); }
});
function renderPins(){
  const pend = LIVE ? mine("places").map(p => Object.assign({ pending: true }, p)) : [];
  const list = APINS.concat(pend).filter(p => pinFilter.has(p.kind)).sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
  if (mapP && mapP.getSource("pins")) mapP.getSource("pins").setData({ type: "FeatureCollection", features: list.map(p => ({ type: "Feature",
    geometry: { type: "Point", coordinates: [p.lng, p.lat] }, properties: { c: ptype(p.kind)[2], title: p.title, note: p.note || "", typeName: ptype(p.kind)[1], pending: !!p.pending } })) });
  $("#pinList").innerHTML = list.length ? list.map(p => { const t = ptype(p.kind);
    return `<li><span class="m"><i style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${t[2]};margin-right:6px"></i>${esc(t[1])} · ${esc(p.display_name || "A community member")}${p.pending ? ' · <span class="tag">awaiting review</span>' : p.status === "demo" ? ' · <span class="tag">demo</span>' : ""}</span>
    <span class="t">${esc(p.title)}</span>${p.note ? `<span style="font-size:13.5px">${esc(p.note)}</span>` : ""}
    <span style="display:flex;gap:8px"><button class="btn ghost" data-fly="${p.lng},${p.lat}">Show on map</button>${p.status === "demo" ? `<button class="btn ghost" data-del="${esc(p.id)}">Remove</button>` : ""}</span></li>`; }).join("")
    : `<li class="empty">No places on the map yet. Pick a type, click <b>Pick the spot</b>, and be the first to add the place you love on this river.</li>`;
  $$("#pinList [data-fly]").forEach(b => b.addEventListener("click", () => { const [x, y] = b.dataset.fly.split(",").map(Number); mapP.flyTo({ center: [x, y], zoom: 14, duration: reduced ? 0 : 900 }); }));
  $$("#pinList [data-del]").forEach(b => b.addEventListener("click", () => { store.removeDemo("places", b.dataset.del); refreshPins(); }));
}

/* ---------------- TAB 4: road projects ---------------- */
let mapR = null, XS = null, circ = null, drawMode = null, APROJ = [], sel = null;
inits.projects = () => {
  if (mapR) { mapR.resize(); return; }
  mapR = baseMap("mapR");
  mapR.ready.then(async map => {
    const [xs, rm, rl, ws] = await Promise.all([load("crossings.json"), load("roads_mapped.json"), load("roads_lidar_only.json"), load("watersheds.json")]);
    XS = xs;
    map.addSource("rm", { type: "geojson", data: rm }); map.addSource("rl", { type: "geojson", data: rl });
    map.addLayer({ id: "rm", type: "line", source: "rm", paint: { "line-color": "#4A4A4A", "line-width": 0.8, "line-opacity": 0.7 } });
    map.addLayer({ id: "rl", type: "line", source: "rl", paint: { "line-color": "#4A4A4A", "line-width": 0.8, "line-opacity": 0.7 } });
    map.addSource("xs", { type: "geojson", data: xsGeo(xs) });
    map.addLayer({ id: "xs", type: "circle", source: "xs", paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, ["interpolate", ["linear"], ["get", "f"], 0, 1.4, 1500, 4.5], 14, ["interpolate", ["linear"], ["get", "f"], 0, 3, 1500, 11]],
      "circle-color": ["case", ["==", ["get", "d"], 1], "#A1302B", "#FFFFFF"], "circle-stroke-color": "#2B2B2B", "circle-stroke-width": 0.5 } });
    map.addSource("circ", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addLayer({ id: "circ-f", type: "fill", source: "circ", paint: { "fill-color": "#E0A526", "fill-opacity": 0.16 } });
    map.addLayer({ id: "circ-c", type: "line", source: "circ", paint: { "line-color": "#FFFFFF", "line-width": 5, "line-opacity": 0.85 } });
    map.addLayer({ id: "circ-l", type: "line", source: "circ", paint: { "line-color": "#B7791F", "line-width": 2.6, "line-dasharray": [2, 1] } });
    map.addSource("prj", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    map.addLayer({ id: "prj", type: "line", source: "prj", paint: { "line-color": "#2E3A40", "line-width": 1.4, "line-opacity": 0.7 } });
    const dh = ws.features.find(f => f.properties.name === "Deep Hollow Creek"); const bb = bbox(dh.geometry);
    setCircle([(bb[0][0] + bb[1][0]) / 2, (bb[0][1] + bb[1][1]) / 2], 900, true);
    map.fitBounds([[bb[0][0] - 0.02, bb[0][1] - 0.02], [bb[1][0] + 0.02, bb[1][1] + 0.02]], { duration: 0 });
    map.on("click", e => {
      if (drawMode === "center") { setCircle([e.lngLat.lng, e.lngLat.lat], +$("#rad").value, false); drawMode = "radius"; $("#drawHint").textContent = "Move to size the circle, click to finish (or use the slider)"; return; }
      if (drawMode === "radius") { drawMode = null; $("#drawHint").hidden = true; }
    });
    map.on("mousemove", e => { if (drawMode !== "radius" || !circ) return; const r = dist(circ.c, [e.lngLat.lng, e.lngLat.lat]); setCircle(circ.c, Math.max(150, Math.min(4000, r)), false); $("#rad").value = Math.round(circ.r); });
    refreshProj();
  });
};
async function refreshProj(){
  try { APROJ = await store.list("project_sketches"); } catch (e) { $("#projStatus").textContent = "The sketch list can't be reached right now."; }
  renderProj();
}
function dist(a, b){ const k = Math.PI / 180, x = (b[0] - a[0]) * k * Math.cos((a[1] + b[1]) / 2 * k), y = (b[1] - a[1]) * k; return Math.sqrt(x * x + y * y) * 6371000; }
function ring(c, r){ const pts = []; for (let i = 0; i <= 72; i++) { const t = i / 72 * 2 * Math.PI; pts.push([c[0] + r * Math.cos(t) / (111320 * Math.cos(c[1] * Math.PI / 180)), c[1] + r * Math.sin(t) / 110540]); } return pts; }
function setCircle(c, r, example){
  circ = { c, r }; $("#exTag").hidden = !example; $("#radV").textContent = (r / 1000).toFixed(2) + " km";
  mapR.getSource("circ").setData({ type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Polygon", coordinates: [ring(c, r)] }, properties: {} }] });
  const inside = XS.filter(x => dist(c, [x[0], x[1]]) <= r);
  sel = { n: inside.length, cul: inside.filter(x => x[2] === "c").length, uni: inside.filter(x => x[2] === "u").length,
    div: inside.filter(x => x[3] === 1).length, fill: inside.reduce((s, x) => s + x[4], 0), deb: inside.filter(x => x[5] === 3).length };
  $("#selBig").innerHTML = `<div><b class="num">${fmt(sel.n)}</b><span>crossings inside</span></div><div><b class="num">${fmt(sel.div)}</b><span>could divert</span></div><div><b class="num">${fmt(sel.fill)}</b><span>m³ of fill</span></div>`;
  calc();
}
$("#rad").addEventListener("input", () => { if (circ) setCircle(circ.c, +$("#rad").value, !$("#exTag").hidden); });
$("#bDraw").addEventListener("click", () => { drawMode = "center"; $("#drawHint").hidden = false; $("#drawHint").textContent = "Click the center of the project area"; });
["cCul", "cDip", "cShare", "cFill", "cOH"].forEach(id => $("#" + id).addEventListener("input", calc));
$("#prYear").addEventListener("change", () => renderProj());
const val = id => Math.max(0, +$("#" + id).value || 0);
function cost(s){
  const a = s.cul * val("cCul"), b = s.div * val("cDip"), c = s.fill * val("cShare") / 100 * val("cFill"); const oh = (a + b + c) * val("cOH") / 100;
  return { a, b, c, oh, tot: a + b + c + oh };
}
function calc(){
  if (!sel) return; const k = cost(sel);
  $("#costTot").textContent = money(k.tot);
  const parts = [[k.a, "var(--water)", "culverts"], [k.b, "var(--fire)", "dips"], [k.c, "var(--rust)", "fill removal"], [k.oh, "var(--muted)", "design"]];
  $("#costStack").innerHTML = k.tot ? parts.map(p => `<span title="${p[2]}" style="width:${p[0] / k.tot * 100}%;background:${p[1]}"></span>`).join("") : "";
  $("#costNote").textContent = `${fmt(sel.cul)} culverts, ${fmt(sel.uni)} unimproved crossings, ${fmt(sel.deb)} on high debris-flow hazard channels. Bars: culverts, dips, fill removal, design. Unit costs are placeholders, not bids.`;
  if (!APROJ.length && !(LIVE && mine("project_sketches").length)) chart([]);
}
$("#bSaveProj").addEventListener("click", async () => {
  if (!circ || !sel) return;
  if ($("#prWeb").value) { $("#projStatus").textContent = "Thanks, it's in the review queue."; return; }   // bot trap
  const k = cost(sel);
  const row = { name: ($("#prName").value.trim() || "Unnamed sketch").slice(0, 70), lead: $("#prLead").value.trim().slice(0, 70) || null, start_year: +$("#prYear").value,
    lng: +circ.c[0].toFixed(5), lat: +circ.c[1].toFixed(5), radius_m: Math.round(circ.r), crossings: sel.n, diversion_prone: sel.div, fill_m3: Math.round(sel.fill),
    cost_usd: Math.round(k.tot), unit_costs: { culvert: val("cCul"), dip: val("cDip"), close_share_pct: val("cShare"), fill_per_m3: val("cFill"), overhead_pct: val("cOH") } };
  $("#projStatus").textContent = "Sending…";
  try {
    const rec = await store.add("project_sketches", row);
    if (LIVE) remember("project_sketches", rec);
    $("#projStatus").textContent = LIVE ? "Thanks. It joins the forecast once a reviewer approves it." : "Saved in this browser (demo mode)."; $("#prName").value = "";
    refreshProj();
  } catch (e) { $("#projStatus").textContent = "Couldn't send it. Check the connection and try again."; }
});
function renderProj(){
  const pend = LIVE ? mine("project_sketches").map(p => Object.assign({ pending: true }, p)) : [];
  const L = APROJ.concat(pend).sort((a, b) => a.start_year - b.start_year || (b.created_at || "").localeCompare(a.created_at || ""));
  if (mapR && mapR.getSource("prj")) mapR.getSource("prj").setData({ type: "FeatureCollection", features: L.map(p => ({ type: "Feature", geometry: { type: "LineString", coordinates: ring([p.lng, p.lat], p.radius_m) }, properties: {} })) });
  $("#projList").innerHTML = L.length ? L.map(p => `<li><span class="m">${p.start_year}${p.lead ? " · " + esc(p.lead) : ""}${p.pending ? ' · <span class="tag">awaiting review</span>' : p.status === "demo" ? ' · <span class="tag">demo</span>' : ""}</span><span class="t">${esc(p.name)}</span>
    <span style="font-size:13.5px" class="num">${fmt(p.crossings)} crossings · ${fmt(p.diversion_prone)} could divert · ${fmt(p.fill_m3)} m³ fill · <b>${money(p.cost_usd)}</b></span>
    <span style="display:flex;gap:8px"><button class="btn ghost" data-go2="${p.lng},${p.lat},${p.radius_m}">Show</button>${p.status === "demo" ? `<button class="btn ghost" data-delp="${esc(p.id)}">Remove</button>` : ""}</span></li>`).join("")
    : `<li class="empty">No sketches yet. Draw an area, give it a name and start year, and send it in. Until then the forecast shows the example area as a draft.</li>`;
  $$("#projList [data-go2]").forEach(b => b.addEventListener("click", () => { const [x, y, r] = b.dataset.go2.split(",").map(Number); setCircle([x, y], r, false); $("#rad").value = r; mapR.flyTo({ center: [x, y], zoom: 13, duration: reduced ? 0 : 900 }); }));
  $$("#projList [data-delp]").forEach(b => b.addEventListener("click", () => { store.removeDemo("project_sketches", b.dataset.delp); refreshProj(); }));
  chart(L);
}
function chart(L){
  const years = [2027, 2028, 2029, 2030, 2031];
  const sum = (y, f) => L.filter(p => p.start_year === y && f(p)).reduce((s, p) => s + p.cost_usd, 0);
  let solid = years.map(y => sum(y, p => !p.pending)), dash = years.map(y => sum(y, p => p.pending)), draft = false;
  if (!L.length && sel) { draft = true; solid = years.map(() => 0); dash = years.map(y => y === +$("#prYear").value ? cost(sel).tot : 0); }
  const W = 560, H = 230, l = 56, b = 30, t = 14, max = Math.max(1, ...years.map((y, i) => solid[i] + dash[i])) * 1.15;
  const step = [1e4, 2.5e4, 5e4, 1e5, 2.5e5, 5e5, 1e6, 2.5e6, 5e6, 1e7, 2.5e7].find(s => max / s <= 5) || 5e7;
  const Y = v => t + (H - t - b) * (1 - v / max), bw = (W - l - 10) / years.length;
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Funding need by start year">`;
  for (let v = 0; v <= max; v += step) s += `<line x1="${l}" x2="${W - 6}" y1="${Y(v)}" y2="${Y(v)}" stroke="var(--rule)"/><text x="${l - 6}" y="${Y(v) + 4}" font-size="11" text-anchor="end" fill="var(--muted)">${v ? money(v) : "$0"}</text>`;
  years.forEach((yr, i) => { const x = l + i * bw + bw * 0.18, w = bw * 0.64, a = solid[i], d = dash[i];
    if (a) s += `<rect x="${x}" y="${Y(a)}" width="${w}" height="${Y(0) - Y(a)}" rx="3" fill="var(--rust)"/>`;
    if (d) s += `<rect x="${x}" y="${Y(a + d)}" width="${w}" height="${Y(a) - Y(a + d)}" rx="3" fill="none" stroke="var(--rust)" stroke-dasharray="5 3"/>`;
    if (a + d) s += `<text x="${x + w / 2}" y="${Y(a + d) - 6}" font-size="12" text-anchor="middle" fill="var(--ink)">${money(a + d)}</text>`;
    s += `<text x="${x + w / 2}" y="${H - 10}" font-size="12" text-anchor="middle" fill="var(--muted)">${yr}</text>`; });
  s += "</svg>";
  const tot = L.reduce((a, p) => a + p.cost_usd, 0);
  $("#fcChart").innerHTML = s + `<p class="note" style="margin:6px 0 0">${draft ? "Draft: the current area only (dashed). Sent-in sketches replace it." : `${L.length} sketch${L.length === 1 ? "" : "es"}, ${money(tot)} in all${pend_note(L)}.`} Placeholder unit costs; a planning aid, not an estimate.</p>`;
}
const pend_note = L => L.some(p => p.pending) ? "; dashed bars are your sketches awaiting review" : "";
