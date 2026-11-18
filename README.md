# Manchester Weekend

Interactive map for a Manchester weekend away (Fri 20 – Mon 23 Nov 2026). It covers cafés, restaurants, bars, pubs, sights, theatre, day trips, and vintage and record shops, with opening hours, booking info and live location.

- Data lives in `data/*.json` (one Place per entry, researched 18 Nov 2026). Run `node scripts/build-data.mjs` to validate it and regenerate `data/places.js`.
- To check the data on its own: `node scripts/validate.mjs`
- To run the tests: `node --test`
- To view it locally: `python3 -m http.server` then open http://localhost:8000

Works offline: `sw.js` saves the app, all places and the city-centre map on first visit (needs https or localhost, not file://).
Looks: light only (deliberately ignores the phone's dark setting); styles live in css/ (tokens.css holds every colour); icons are inline SVG from icons.js (Lucide, ISC); headings use Fraunces, self-hosted in fonts/ (OFL).
Late-night tram and bus times home are in `data/getting-home.js`, taken from TfGM's GTFS timetable feed (odata.tfgm.com) for 20-23 Nov 2026.
The accommodation address is deliberately not in the repo (the site is public); only the nearest stops and walks are.

Map: OpenFreeMap © OpenMapTiles, data © OpenStreetMap contributors (OSM raster fallback without WebGL).
