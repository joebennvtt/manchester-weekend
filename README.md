# Manchester Weekend

Interactive map for a Manchester weekend away (Fri 20 – Mon 23 Nov 2026). It covers cafés, restaurants, bars, pubs, sights, theatre, day trips, and vintage and record shops, with opening hours, booking info and live location.

- Data lives in `data/*.json` (one Place per entry, researched 18 Nov 2026). Run `node scripts/build-data.mjs` to validate it and regenerate `data/places.js`.
- To check the data on its own: `node scripts/validate.mjs`
- To run the tests: `node --test`
- To view it locally: `python3 -m http.server` then open http://localhost:8000

Map: OpenFreeMap © OpenMapTiles, data © OpenStreetMap contributors (OSM raster fallback without WebGL).
