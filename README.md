# Upper Baduwa't Explorer

Baduwa't is the Wiyot name for the river most maps label the Mad River; the explorer uses it throughout (`../dashboard/rename_river.py` applies it to the page and data after any rebuild). Folder and repository names keep "UpperMad" and "upper-mad".

A public web explorer for the Upper Baduwa't watershed assessment, prepared as a proposal for the Watershed Research and Training Center (WRTC) to host as the public face of a basin-wide Baduwa't assessment. It is a static site (GitHub Pages or any web host). Community input lands in a Google Sheet in WRTC's Drive, and nothing shows on the public map until a reviewer approves it there.

## What's in this repository

| Path | What it is |
|---|---|
| `index.html` | The explorer: 3D river flight, findings map with four lenses, community places, road-project sketches and funding forecast |
| `config.js` | One setting: the review sheet's web-app URL. Empty means demo mode |
| `sheets/Code.gs` | The Google Apps Script that writes entries to the Sheet and serves approved ones back |
| `data/` | Assessment layers the explorer draws (GeoJSON, fire and forest overlays, the 3D terrain tile and its five layer textures, about 6 MB of them) |
| `vendor/` | MapLibre GL JS 4.7.1 and three.js r128, with their licenses |
| `build_web.py`, `web_contribute.js` | Rebuild `index.html` from the dashboard source (see "Rebuilding") |
| `.nojekyll` | Tells GitHub Pages to serve the files as they are |

## Publish with GitHub Pages

1. Create an empty repository on GitHub (under WRTC's organization, so it outlives any one account). Public repositories get Pages for free.
2. Push this folder to it:
   ```
   git remote add origin https://github.com/<org>/<repo>.git
   git push -u origin main
   ```
3. In the repository: **Settings > Pages > Build and deployment**, Source **Deploy from a branch**, branch **main**, folder **/ (root)**. Save.
4. After a minute the site is at `https://<org>.github.io/<repo>/`. To use WRTC's own address (for example `explorer.example.org`), add it under **Custom domain** and create the CNAME record GitHub shows.

Any other static host works the same way: upload the folder as is.

To try it on your own computer, serve the folder (opening `index.html` as a file won't load the data):

```
python -m http.server 8000
```

then open http://localhost:8000.

## Connect the review sheet (Google Sheets)

Same setup as the Lost Meadows map's download log: a Google Sheet with a small Apps Script deployed as a web app. No server, no accounts for the public, no cost.

1. **Create the Sheet.** In WRTC's Google Drive: New > Google Sheets. Name it, for example, `Baduwa't explorer input`.
2. **Add the script.** In that Sheet: **Extensions > Apps Script**. Delete the stub code, paste the contents of [`sheets/Code.gs`](sheets/Code.gs), and save.
3. **Deploy as a web app.** **Deploy > New deployment**, gear icon, **Web app**:
   - **Execute as:** Me
   - **Who has access:** Anyone

   Click **Deploy**, then **Authorize access** and approve. The "unverified app" warning is expected for your own script (Advanced > Go to ... > Allow).
4. **Copy the Web app URL** (ends in `/exec`) into `config.js`:
   ```js
   window.EXPLORER_CONFIG = { sheetEndpoint: "https://script.google.com/macros/s/AKfy.../exec" };
   ```
   Commit and push; Pages redeploys on its own.
5. **Test.** Open the `/exec` URL in a browser; it should say the logger is live. Then pin a place on the explorer. A `places` tab appears in the Sheet with the new row marked `pending`.

### Reviewing entries

- The script makes two tabs on first use: `places` and `sketches`. Each row arrives with `status` = `pending`.
- To publish an entry, change its `status` cell to `approved` (the cell has a dropdown). To keep it off the map, choose `rejected` or delete the row.
- Approved entries appear on the explorer within about a minute (the script caches its answer for 60 seconds).
- `review_note` and `referrer` are never sent to the public page. Only these columns are: places (kind, title, note, display name, location) and sketches (name, lead, start year, location, radius, counts, cost, unit costs).
- Anyone with edit access to the Sheet can review. Share it with reviewers the usual Google way.

### What the script checks

- Locations must fall inside the Baduwa't basin envelope; text is trimmed to length limits; place types must be one of the seven on the form.
- A hidden form field catches simple bots, and cells that start with `= + - @` are stored as text so they can't run as formulas.
- The public never gives an email address or signs in. A display name is optional.
- The `/exec` URL is public, so junk rows are possible. They never show without approval. If it gets spammed, make a new deployment (the old URL stops working) and update `config.js`.

**Updating the script later:** Deploy > Manage deployments > edit (pencil) > Version: New version > Deploy. The `/exec` URL stays the same; a *new* deployment would give a new URL.

### Getting the data out

- The Sheet itself: File > Download > CSV or Excel.
- GeoJSON of approved entries, for QGIS or a download link: `<exec URL>?table=places&format=geojson` (or `table=sketches`). Each sketch's area is a circle from its center point and `radius_m`.

## Basemaps

The maps load public basemaps from their providers, so nothing heavy is stored here:

| Button | Source |
|---|---|
| Relief | USGS National Map shaded relief; from zoom 12 in, a 3DEP lidar hillshade drawn on request by the USGS 3DEP elevation service |
| Topo | USGS National Map topo (USGSTopo) |
| Imagery | USGS National Map imagery (USGSImageryOnly) |
| Streets | OpenStreetMap standard tiles |

All four are free for this kind of use and are credited in each map's attribution button. The OpenStreetMap tile servers ask that heavy users bring their own tiles; a watershed explorer is well inside their policy. The last choice is remembered per visitor.

## Rebuilding

The page is built from `../dashboard/page_src.html`, shared with the claude.ai preview, which keeps the parts both versions use, plus `web_contribute.js` for the community tabs. With both folders checked out side by side:

```
python -X utf8 build_web.py
```

The layers in `data/` come from the assessment's build scripts in `../dashboard/`, run in WSL from `UpperMad/work/scripts`:

| Script | Writes |
|---|---|
| `build_data.py` | watersheds, streams, crossings, floodplain zones, fire and forest overlays, headline numbers |
| `build_roads_web.py` | `roads.json` (the ERASER network, classed by use) and each crossing's road class |
| `build_3d.py` | the 3D terrain tile, its floodplain texture and the river path |
| `build_3d_layers.py` | the flight's layer textures: NAIP imagery, lidar hillshade, and the stream and road lines with their paint-in times |
| `build_basin_svg.py` | the whole-basin outline map |

The 3D flight itself is `../dashboard/three_flight.js`; `splice_three.py` copies it into the page source and rebuilds both pages. Each new subwatershed (Middle Baduwa't, then Lower Baduwa't) runs through the same lidar toolkit and is added the same way.

Sources shown in the flight: USDA NAIP imagery through the USGS National Map, and USGS 3DEP lidar (2022 and 2023 collections).

## Caveats

- Unit costs in the road-project calculator are planning placeholders, not bids. Replace them with regional figures before showing them to funders.
- All findings are lidar screening and have not been field verified. Private land is summarized by watershed.
