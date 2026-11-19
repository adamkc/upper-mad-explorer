"""Build the stand-alone explorer (explorer_web/index.html) from the dashboard source.
Differences from the claude.ai artifact: local libraries, a full HTML document, and community data in Supabase
(config.js) instead of the artifact database; without a config it runs in demo mode (this browser only).
Run: python -X utf8 build_web.py   (from UpperMad/explorer_web)"""
import re, pathlib
HERE = pathlib.Path(__file__).parent; DASH = HERE.parent / "dashboard"
s = (DASH / "page_src.html").read_text(encoding="utf-8")
def rep(a, b, count=1):
    global s
    assert a in s, a[:70]
    s = s.replace(a, b, count)

# ---- document shell, local libraries ----
rep("/*MAPLIBRE_CSS*/", "")
rep("<title>Upper Mad River Explorer</title>\n<meta name=\"claude:viewport-fit-sides\" content=\"cover\">",
    "<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width,initial-scale=1,viewport-fit=cover\">\n"
    "<title>Upper Mad River Explorer</title>\n<meta name=\"description\" content=\"Lidar assessment of the Upper Mad River: forests, roads, floodplains and crossings, with community places and road-project sketches.\">\n"
    "<link rel=\"stylesheet\" href=\"vendor/maplibre-gl.css\">")
rep("<header class=\"top wrap\">", "</head>\n<body>\n<header class=\"top wrap\">")
rep("*{box-sizing:border-box}", "*{box-sizing:border-box}\nhtml{color-scheme:light}\nbody{margin:0}\n[hidden]{display:none!important}\nimg{max-width:100%}\n.hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}\n.mode{font-size:12px;padding:6px 9px;border-radius:7px;background:var(--shade)}")
rep('<script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script>\n<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>\n<script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"></script>',
    '<script src="vendor/maplibre-gl.js"></script>\n<script src="vendor/three.min.js"></script>\n<script src="vendor/OrbitControls.js"></script>\n<script src="config.js"></script>')
s = s.rstrip() + "\n</body>\n</html>\n"
rep("<!--BASIN_SVG-->", (DASH / "basin_map.svg.txt").read_text(encoding="utf-8"))
for n in ("fire2020.png", "forest.png"):
    rep(f'url: "data/{n}"', f'url: new URL("data/{n}", location.href).href')

# ---- public basemaps instead of the bundled 16 m hillshade (the live site can reach USGS and OSM tile servers) ----
BASEMAP_JS = r"""const USGS = "https://basemap.nationalmap.gov/arcgis/rest/services/", TNM = "USGS The National Map";
const BASEMAPS = {
  relief: { name: "Relief", src: [
    { tiles: [USGS + "USGSShadedReliefOnly/MapServer/tile/{z}/{y}/{x}"], tileSize: 256, maxzoom: 16, attribution: TNM + " shaded relief", hide: 12 },
    // 3DEP lidar hillshade, drawn on request for each tile, once zoomed in far enough for 1 m detail to matter
    { tiles: ["https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=512,512&format=jpg&renderingRule=" +
        encodeURIComponent('{"rasterFunction":"Hillshade Multidirectional"}') + "&f=image"], tileSize: 512, attribution: "USGS 3DEP lidar", show: 12 } ] },
  topo: { name: "Topo", src: [{ tiles: [USGS + "USGSTopo/MapServer/tile/{z}/{y}/{x}"], tileSize: 256, maxzoom: 16, attribution: TNM }] },
  imagery: { name: "Imagery", src: [{ tiles: [USGS + "USGSImageryOnly/MapServer/tile/{z}/{y}/{x}"], tileSize: 256, maxzoom: 16, attribution: TNM + " imagery" }] },
  streets: { name: "Streets", src: [{ tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, maxzoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }] }
};
let BM = (() => { try { return BASEMAPS[localStorage.getItem("basemap")] ? localStorage.getItem("basemap") : "relief"; } catch (e) { return "relief"; } })();
const ALLMAPS = [];
function addBasemaps(map){
  Object.entries(BASEMAPS).forEach(([k, b]) => b.src.forEach((t, i) => { const id = `bm-${k}-${i}`;
    map.addSource(id, { type: "raster", tiles: t.tiles, tileSize: t.tileSize, maxzoom: t.maxzoom || 22, attribution: t.attribution });
    const L = { id, type: "raster", source: id, layout: { visibility: k === BM ? "visible" : "none" }, paint: { "raster-fade-duration": 150 } };
    if (t.hide) L.maxzoom = t.hide; if (t.show) L.minzoom = t.show; map.addLayer(L); }));
}
function setBasemap(k){
  BM = k; try { localStorage.setItem("basemap", k); } catch (e) {}
  ALLMAPS.forEach(m => { if (!m.getLayer("bm-relief-0")) return;
    Object.entries(BASEMAPS).forEach(([j, b]) => b.src.forEach((_, i) => m.setLayoutProperty(`bm-${j}-${i}`, "visibility", j === k ? "visible" : "none"))); });
  document.querySelectorAll(".bmctl button").forEach(b => b.setAttribute("aria-pressed", b.dataset.bm === k));
}
class BasemapCtl { onAdd(){ const d = document.createElement("div"); d.className = "maplibregl-ctrl maplibregl-ctrl-group bmctl"; d.setAttribute("role", "group"); d.setAttribute("aria-label", "Basemap");
    d.innerHTML = Object.entries(BASEMAPS).map(([k, b]) => `<button type="button" data-bm="${k}" aria-pressed="${k === BM}">${b.name}</button>`).join("");
    d.addEventListener("click", e => { const b = e.target.closest("[data-bm]"); if (b) setBasemap(b.dataset.bm); }); this.d = d; return d; }
  onRemove(){ this.d.remove(); } }
"""
rep("function baseMap(el){", BASEMAP_JS + "function baseMap(el){")
rep("attributionControl: false, cooperativeGestures: true,", "attributionControl: { compact: true }, cooperativeGestures: true,")
rep("""  map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "top-right");""",
    """  map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "top-right");
  map.addControl(new BasemapCtl(), "top-left"); ALLMAPS.push(map);""")
rep("""    map.addSource("hill", { type: "image", url: "data/hillshade.png", coordinates: ov.hillshade });
    map.addLayer({ id: "hill", type: "raster", source: "hill", paint: { "raster-fade-duration": 0 } });""", "    addBasemaps(map);")
rep(".mode{font-size:12px", ".bmctl{display:flex}.bmctl button{width:auto!important;padding:0 9px;font:500 12px/29px Inter,system-ui,sans-serif;color:#22303A}.bmctl button+button{border-top:0!important;border-left:1px solid #ddd}.bmctl button[aria-pressed=true]{background:#22303A;color:#fff}\n.mode{font-size:12px")

# ---- wording: entries are reviewed before they show ----
rep("Pin the places you know: a swimming hole, a washed-out road, a spot elk cross. Everyone sees the shared map.",
    "Pin the places you know: a swimming hole, a washed-out road, a spot elk cross. Reviewed pins go on a shared map.")
rep("Circle a group of crossings, pick treatments, and see a rough cost. Saved sketches add up into a funding forecast.",
    "Circle a group of crossings, pick treatments, and see a rough cost. Reviewed sketches add up into a funding forecast.")
rep("""          <label style="font-size:13px;display:flex;gap:8px;align-items:center"><input type="checkbox" id="pNamed"> Show my name with this place</label>
          <button class="btn" id="bSave" disabled>Save to the shared map</button>
          <div class="note" id="pinStatus"></div>""",
    """          <label class="f" for="pName">Your name, shown with the place (optional)<input type="text" id="pName" maxlength="60" autocomplete="name"></label>
          <label class="hp" aria-hidden="true">Leave this empty<input type="text" id="pWeb" tabindex="-1" autocomplete="off"></label>
          <label style="font-size:13px;display:flex;gap:8px;align-items:flex-start"><input type="checkbox" id="pOk" style="margin-top:3px"> This place can be shown publicly once a reviewer approves it.</label>
          <button class="btn" id="bSave" disabled>Send for review</button>
          <div class="note" id="pinStatus"></div>
          <div class="mode" data-mode></div>""")
rep("The project team can remove pins.", "Entries appear on the map after a reviewer approves them.")
rep("Save a sketch and it joins everyone's sketches in the funding forecast below.",
    "Send a sketch in and, once it's reviewed, it joins the funding forecast below.")
rep("""          <button class="btn" id="bSaveProj">Save this sketch</button>
          <div class="note" id="projStatus"></div>""",
    """          <label class="hp" aria-hidden="true">Leave this empty<input type="text" id="prWeb" tabindex="-1" autocomplete="off"></label>
          <button class="btn" id="bSaveProj">Send sketch for review</button>
          <div class="note" id="projStatus"></div>
          <div class="mode" data-mode></div>""")
rep('<div><div class="eyebrow" style="margin-bottom:6px">Saved sketches</div>', '<div><div class="eyebrow" style="margin-bottom:6px">Sketches</div>')
rep("<h2 style=\"font-size:26px;margin:4px 0 8px\">What the saved sketches add up to</h2>", "<h2 style=\"font-size:26px;margin:4px 0 8px\">What the sketches add up to</h2>")

# ---- the stewardship pitch, at the end of the river tab ----
PITCH = """    <div class="sec">
      <div class="eyebrow">Proposed · how the data would be run</div>
      <h2>One home for the basin's data</h2>
      <p class="prose" style="margin:0;max-width:70ch">A basin-wide assessment makes a lot of data: lidar products for every subwatershed, tens of thousands of crossings, and what residents and partners add. This proposal puts it in one place the Watershed Research and Training Center would steward: the assessment layers as open files in a public repository, community input in a review sheet in WRTC's Google Drive, and this explorer as the public face.</p>
      <div class="card" style="background:var(--paper)">
        <svg viewBox="0 0 760 210" role="img" aria-label="Lidar and public data feed the toolkit, which loads the basin database; community entries are reviewed into the same database; the database feeds this explorer, the printed atlas and open downloads">
          <defs><marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10z" fill="var(--muted)"/></marker></defs>
          <g font-size="12" fill="var(--ink)">
            <rect x="8" y="26" width="150" height="58" rx="8" fill="var(--panel)" stroke="var(--rule)"/><text x="83" y="50" text-anchor="middle" font-family="EB Garamond, serif" font-size="16">Lidar + public data</text><text x="83" y="68" text-anchor="middle" fill="var(--muted)" font-size="11">3DEP, NHD, MTBS, LANDFIRE</text>
            <rect x="196" y="26" width="160" height="58" rx="8" fill="var(--panel)" stroke="var(--rule)"/><text x="276" y="50" text-anchor="middle" font-family="EB Garamond, serif" font-size="16">Assessment toolkit</text><text x="276" y="68" text-anchor="middle" fill="var(--muted)" font-size="11">roads, crossings, REM, ranks</text>
            <rect x="394" y="70" width="170" height="70" rx="10" fill="var(--teal)" fill-opacity=".16" stroke="var(--teal)"/><text x="479" y="98" text-anchor="middle" font-family="EB Garamond, serif" font-size="18">Basin data</text><text x="479" y="118" text-anchor="middle" fill="var(--muted)">open files + review sheet</text>
            <rect x="196" y="140" width="160" height="58" rx="8" fill="var(--panel)" stroke="var(--rule)"/><text x="276" y="164" text-anchor="middle" font-family="EB Garamond, serif" font-size="16">Community + partners</text><text x="276" y="182" text-anchor="middle" fill="var(--muted)">places, project sketches</text>
            <rect x="602" y="14" width="150" height="46" rx="8" fill="var(--panel)" stroke="var(--rule)"/><text x="677" y="42" text-anchor="middle" font-family="EB Garamond, serif" font-size="16">This explorer</text>
            <rect x="602" y="82" width="150" height="46" rx="8" fill="var(--panel)" stroke="var(--rule)"/><text x="677" y="110" text-anchor="middle" font-family="EB Garamond, serif" font-size="16">Printed atlas</text>
            <rect x="602" y="150" width="150" height="46" rx="8" fill="var(--panel)" stroke="var(--rule)"/><text x="677" y="172" text-anchor="middle" font-family="EB Garamond, serif" font-size="16">Open downloads</text><text x="677" y="188" text-anchor="middle" fill="var(--muted)" font-size="11">GeoPackage, CSV</text>
          </g>
          <g stroke="var(--muted)" stroke-width="1.4" fill="none" marker-end="url(#ar)">
            <path d="M158 55 L192 55"/><path d="M356 60 C 380 64, 386 80, 392 92"/><path d="M356 168 C 380 160, 386 140, 392 124"/>
            <path d="M564 96 C 586 80, 588 48, 598 40"/><path d="M564 105 L598 105"/><path d="M564 116 C 586 132, 588 162, 598 170"/>
          </g>
          <text x="384" y="196" font-size="11" fill="var(--muted)">reviewed before it shows</text>
        </svg>
      </div>
      <div class="cards" style="grid-template-columns:repeat(3,minmax(0,1fr))">
        <div class="card"><h3>Owned and open</h3><p>The layers are open files (GeoJSON, GeoPackage) in WRTC's own repository, and the site runs on free static hosting. No paid platform and no software licenses.</p></div>
        <div class="card"><h3>Reviewed</h3><p>Every entry arrives in the review sheet as pending. Nothing shows until a reviewer marks it approved, so sensitive places stay off the public map. No contact details are collected.</p></div>
        <div class="card"><h3>Repeatable</h3><p>Each subwatershed goes through the same pipeline and lands in the same tables, so the Middle and Lower Mad drop in beside the Upper Mad.</p></div>
      </div>
    </div>
"""
rep("  </div>\n</section>\n\n<!-- ============ TAB 2: WHAT WE FOUND ============ -->", PITCH + "  </div>\n</section>\n\n<!-- ============ TAB 2: WHAT WE FOUND ============ -->")
rep("<footer class=\"foot wrap\"><div class=\"inner\">Upper Mad River watershed assessment, 2026.",
    "<footer class=\"foot wrap\"><div class=\"inner\">Draft prepared for the Watershed Research and Training Center. Upper Mad River watershed assessment, 2026.")

# ---- replace the claude.ai storage and the two contribute tabs ----
a = s.index("/* ---------------- shared store (db) ---------------- */"); b = s.index("show(location.hash.slice(1));")
s = s[:a] + (HERE / "web_contribute.js").read_text(encoding="utf-8") + "\n" + s[b:]
(HERE / "index.html").write_text(s, encoding="utf-8", newline="\n")
print("index.html", len(s), "bytes")
