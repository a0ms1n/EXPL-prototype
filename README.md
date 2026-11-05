# วินชัวร์ — mobile fare prototype

## PrototypeV2: rider and customer views

`PrototypeV2` adds a passenger page while keeping the original rider calculator and meter.

Use the **Old prototype / New prototype** dropdown at the top of `index.html` to compare versions. Old prototype (V1) restores the original interface with the rider calculator and meter. New prototype (V2) uses the refreshed green interface and adds QR sharing, rider details, and the customer page. Both versions use a ฿15 starting fare for the first 2 km. Switching preserves the current trip and mobile frame setting. The selection is saved locally, and `index.html?prototype=1` or `index.html?prototype=2` opens a specific version.

Opening `app.html` directly redirects to the same `index.html` preview host, preserving query parameters. This ensures the Mobile frame switch resizes the actual app viewport. Use `index.html?frame=on` for a phone-sized preview or `index.html?frame=off` for the full-window view; prototype and frame parameters can be combined. Both the top toolbar and the in-app settings control the same frame, and toggling preserves an active trip. Passenger links also open in the shared host (`index.html?view=passenger#ride=…`) with a **Mobile frame: On / Off** toggle. Their ride snapshot survives the redirect, reload, and frame changes. The passenger’s home links return to the rider page at the top level.

1. Open `index.html` and press **คำนวณราคา**. Every successful calculation creates a new ride ID, a QR code, and a customer link. Editing either place invalidates the estimate and cancels its unused ride link; calculating again creates a fresh ride.
2. Scan the QR or press **เปิดหน้าผู้โดยสาร**. **QR ผู้โดยสาร** in the header opens an enlarged QR at any trip stage. Each calculation randomly assigns one of five mock riders (สมชาย ใจดี, วิชัย สุขสวัสดิ์, อนันต์ รุ่งเรือง, สุดา พูนทรัพย์, or กิตติพงษ์ มั่นคง). The assigned rider stays with that ride and its QR link. The customer page shows the agreed fare range, simulated current position, progress, rider profile, vehicle/plate, rating, and example reviews. Reviews are isolated by rider.
3. Leave both rider and passenger pages open in the same browser profile to watch the rider's meter, movement, pause/resume, and arrival sync through browser storage. Different rides stay isolated. Ending early preserves the actual simulated endpoint.
4. After the rider completes the trip, passengers can submit one 1–5 star review with an optional comment (up to 500 characters). Reviews persist in that browser and appear with the mock reviews; they are not published to a server.

The link contains a UTF-8 ride snapshot in its URL fragment, so it also opens on a different phone without access to the rider's browser storage. **GitHub Pages cannot relay live location updates between devices without a backend**: another device shows the snapshot captured when that QR/link was generated. The QR refreshes during the trip and immediately when enlarged or copied. A separate, clearly labeled **ลองการเดินทางบนเครื่องนี้** button demonstrates movement on the customer device without changing the rider's trip or enabling reviews for that isolated demo. This prototype does not use real GPS.

QR encoding runs locally using vendored `qrcode.js`; it does not send trip data to a QR service. Browser storage restrictions are handled with an in-memory fallback and an on-screen explanation. Snapshots still open; cross-tab synchronization and persistence may be unavailable. Google Maps needs internet access; the Sarabun Thai font is hosted locally, and the ride data and simulated route overlay work independently.

For testing with two devices, serve the site at an address both can reach. A QR pointing at `localhost`, `127.0.0.1`, or a `file:` URL cannot open your computer's files on another phone. Once deployed, customer links are resolved relative to the current page, e.g. `https://YOUR-USERNAME.github.io/REPOSITORY/customer.html#ride=…`. No domain, repository name, or root-relative path is hard-coded.

New files: `customer.html`, `customer.css`, `customer.js` (passenger view); `ride-share.js` (snapshot, storage, reviews and demo protocol); `ride-panel.js` (rider QR UI); `qrcode.js` and `THIRD_PARTY_NOTICES.md` (MIT QR encoder); `tests/ride-share.test.cjs` (protocol tests).

Run all protocol and existing fare tests with `node --test tests/*.test.cjs`. To deploy this branch using the existing workflow, push `PrototypeV2`, enable GitHub Pages with **GitHub Actions**, then manually run **Deploy GitHub Pages** with `PrototypeV2` selected under **Run workflow**. Automatic push deployment continues to use `main`. No push or deployment is performed by these local changes.

If Pages deployment stays at `updating_pages` and times out, check **Settings → Pages → Build and deployment → Source** and select **GitHub Actions**. A separate run named **pages build and deployment** is GitHub's automatic branch publisher; the workflow in this repository is named **Deploy GitHub Pages**. Use the repository workflow after enabling Actions publishing. Publishing is serialized across branches without canceling an active deployment, and the deploy action waits up to 30 minutes for GitHub to finish. This longer timeout cannot repair a stalled GitHub service; if publishing still stalls, check [GitHub Status](https://www.githubstatus.com/) and start a new workflow run after the service recovers. Push workflow changes before starting a new run; re-running an old run uses its original workflow revision.

## Original rider flow

Open `index.html` directly in a browser. No installation, build, API key, or backend is required. Internet access is needed for the embedded Google Maps; the simulator and locally hosted Sarabun font work without external requests.

1. Enter an origin and destination under **เลือกปลายทาง**.
2. Press **คำนวณราคา** to compare three simulated routes. The route with the shortest estimated time is selected automatically, and its estimated fare range is locked when the trip begins.
3. Press **เริ่มเดินทาง**. The meter runs at 30× speed by default; open the gear button in the header for **Debug mode** to change speed or simulate normal driving, traffic, and waiting.
4. Pause/resume as needed. Press **ถึงที่หมาย** to end early, or let the simulation reach the destination automatically.
5. Review the fare breakdown and start another trip.

## Fare rules

- First 2 km: ฿15.
- Distance above 2 km up to 5 km: ฿5/km.
- Distance above 5 km: ฿10/km.
- Each completed, non-overlapping two-minute travel window adds ฿5 if movement during that window is **0.4 km or less**, including exactly 0.4 km. Incomplete windows do not charge; pausing freezes simulated time and distance.
- Distance is charged proportionally. The total meter amount is rounded up to a whole baht.
- Final fare: `min(estimated maximum, max(estimated minimum, meter amount))`.

The prediction uses the same meter rules with the route’s estimated average speed, then applies a ±฿7 margin with a ฿15 minimum. This range is not recalculated during the trip.

Google Maps is the map background. A simulated route, origin/destination markers, and a moving motorcycle are drawn over it. The motorcycle and completed route follow the meter distance, freeze when paused or waiting, and stop at the actual simulated trip endpoint. Use the **+ / −** buttons to zoom and the route button below them to fit the complete route again. Zoom controls work before and during trips and keep the route overlay aligned without changing trip progress. The embedded map reloads briefly when its zoom changes. Direct panning is locked while a route is visible; the **เปิดแผนที่ ↗** link opens a separate interactive Google Maps view. Route comparisons, coordinates for unlisted places, time, and movement are simulated locally; they do not use Google's routing, geocoding, traffic, or live GPS. Known Bangkok destinations have preset coordinates; custom names receive reproducible fictional coordinates, with a notification.

On phones and portrait tablets, the app uses a single column with larger text and touch targets. The map stays fixed in every trip stage; only the details panel below it scrolls. Pause/arrival buttons stay in a separate stationary row at the bottom. On desktop, only the right-hand details panel scrolls. Changing trip stages returns the details panel to its top without moving the map. Layouts account for phone safe areas and landscape screens; animation respects the device's reduced-motion preference.

## Phone frame and debug settings

`index.html` defaults to full-screen on mobile and short landscape screens, and a phone frame on larger screens. Use **Mobile frame: On / Off** at the top of the page or **Mobile frame** in settings. The choice is saved locally; switching preserves the active trip. The frame includes a simulated status bar and home indicator. It fits the available screen using its actual responsive width and height; text and touch controls are never shrunk with a CSS transform. Short landscape screens use a landscape frame and hide decorative status chrome. The home indicator has its own reserved space outside the app viewport.

Open the gear button to use the debug pop-up:

- **รอบเวลา 2 นาทีปัจจุบัน**: show or hide the current waiting-charge window on the meter. Hidden by default; hiding it does not disable waiting charges.
- **ปุ่มพักมิเตอร์**: show or hide the pause/resume button, shown by default. Hiding it while paused resumes the trip; the arrival button fills the available width.
- **Mobile frame**: turn the phone frame on or off. Turning it off expands the same app to the browser window without restarting an active trip.
- **สภาพการจราจร / ความเร็วจำลอง**: simulation controls live only in this pop-up. Changes apply immediately to an active trip and also carry into the next trip.

Settings are saved locally when browser storage is available. Close the pop-up with Done, the close button, Escape, or a click on its backdrop. The app keeps simulating while settings are open.

## Files and checks

- `index.html`, `preview.css`, `preview.js`: scalable phone frame and preview mode.
- `app.html`: Thai mobile interface, Google Maps embed, and debug pop-up.
- `settings.js`: debug settings and local preferences.
- `styles.css`: responsive desktop and mobile layouts.
- `fonts.css`, `fonts/`: locally hosted Sarabun Thai fonts and SIL Open Font License.
- `theme.css`: refreshed green interface; disabled in Old prototype to restore the original look.
- `frame-layout.css`: phone layout and accessible map/meter controls retained in both skins.
- `frame-entry.js`: direct rider/passenger links enter the same real iframe preview host.
- `fare.js`: independently testable fare and meter calculations.
- `map.js`: simulated route projection and animated motorcycle overlay.
- `app.js`: route mock, meter simulation, and trip flow.
- `tests/fare.test.cjs`: calculation and boundary tests.

Run the checks with Node.js:

```sh
node --check app.js
node --check fare.js
node --check map.js
node --check settings.js
node --check preview.js
node --test tests/fare.test.cjs
```

Optional local server, run from this folder:

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000`.


## Deploy to GitHub Pages

This folder is the repository root. Create an empty public repository on GitHub (for example `sc-09-fare`), then run from this folder, replacing `YOUR-USERNAME`:

```sh
git add .
git commit -m "Prepare SC-09 fare prototype for GitHub Pages"
git remote add origin https://github.com/YOUR-USERNAME/sc-09-fare.git
git push -u origin main
```

In the GitHub repository, open **Settings → Pages → Build and deployment → Source** and select **GitHub Actions**. If the initial deployment ran before Pages was enabled, rerun **Deploy GitHub Pages** from the Actions tab. Future pushes to `main` run syntax checks and fare tests, then publish only HTML, CSS, JavaScript, and `.nojekyll`. Pull requests run checks without deploying.

The site will be available at `https://YOUR-USERNAME.github.io/sc-09-fare/`. Relative asset links support repository subpaths. No build dependencies, API keys, or backend are required.

Reference: [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).
