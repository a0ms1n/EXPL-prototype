# วินชัวร์ — mobile fare prototype

Open `index.html` directly in a browser. No installation, build, API key, or backend is required. Internet access is needed for the embedded Google Maps and optional Google font; the simulator works without them.

1. Enter an origin and destination under **เลือกปลายทาง**.
2. Press **คำนวณราคา** to compare three simulated routes. The route with the shortest estimated time is selected automatically, and its estimated fare range is locked when the trip begins.
3. Press **เริ่มเดินทาง**. The meter runs at 30× speed by default; open the gear button in the header for **Debug mode** to change speed or simulate normal driving, traffic, and waiting.
4. Pause/resume as needed. Press **ถึงที่หมาย** to end early, or let the simulation reach the destination automatically.
5. Review the fare breakdown and start another trip.

## Fare rules

- First 2 km: ฿25.
- Distance above 2 km up to 5 km: ฿5/km.
- Distance above 5 km: ฿10/km.
- Each completed, non-overlapping two-minute travel window adds ฿5 if movement during that window is **0.4 km or less**, including exactly 0.4 km. Incomplete windows do not charge; pausing freezes simulated time and distance.
- Distance is charged proportionally. The total meter amount is rounded up to a whole baht.
- Final fare: `min(estimated maximum, max(estimated minimum, meter amount))`.

The prediction uses the same meter rules with the route’s estimated average speed, then applies a ±฿7 margin with a ฿25 minimum. This range is not recalculated during the trip.

Google Maps is the map background. A simulated route, origin/destination markers, and a moving motorcycle are drawn over it. The motorcycle and completed route follow the meter distance, freeze when paused or waiting, and stop at the actual simulated trip endpoint. Use the **+ / −** buttons to zoom and the route button below them to fit the complete route again. Zoom controls work before and during trips and keep the route overlay aligned without changing trip progress. The embedded map reloads briefly when its zoom changes. Direct panning is locked while a route is visible; the **เปิดแผนที่ ↗** link opens a separate interactive Google Maps view. Route comparisons, coordinates for unlisted places, time, and movement are simulated locally; they do not use Google's routing, geocoding, traffic, or live GPS. Known Bangkok destinations have preset coordinates; custom names receive reproducible fictional coordinates, with a notification.

On phones and portrait tablets, the app uses a single column with larger text and touch targets. The map stays fixed in every trip stage; only the details panel below it scrolls. Pause/arrival buttons stay in a separate stationary row at the bottom. On desktop, only the right-hand details panel scrolls. Changing trip stages returns the details panel to its top without moving the map. Layouts account for phone safe areas and landscape screens; animation respects the device's reduced-motion preference.

## Phone frame and debug settings

`index.html` defaults to full-screen on mobile and short landscape screens, and a phone frame on larger screens. Use **Mobile frame: On / Off** at the top of the page or **Mobile frame** in settings. The choice is saved locally; switching preserves the active trip. The frame includes a simulated status bar and home indicator, and scales to fit the screen.

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
