# SEESAW: Earth's Opposite-Trend Detective

*When one side of the Earth goes up, where does it go down?*

**Team:** Trindade Full-Stack · **Event:** NASA Space Apps Challenge 2026, São Paulo, Brazil ·
**Challenge:** Be An Earth System Trend Detective!

SEESAW is a web tool that finds "seesaws" in the Earth system: pairs of regions where the
same variable is rising in one place and falling in another. You pick a variable, see a map
of how much it changed per decade, learn where the change is statistically significant, and
with one click find the region that trends the opposite way. The result is a plain-language
**Case File** answering the four questions of the challenge: what is changing, where, how
much, and is it significant.

> **Data status: SAMPLE DATA.** The files currently in `web/data/` are **synthetic**, created
> by `pipeline/make_sample_data.py` so the interface can be developed and deployed. They are
> not NASA observations, and the site shows a banner saying so. Run the pipeline below to
> replace them with real NASA POWER data, then delete this notice.

## How it works

| Step | What happens | Where |
| --- | --- | --- |
| 1. Collect | Monthly gridded data, 1981-2025, from the NASA POWER API (no login) | `pipeline/01_fetch_power.py` |
| 2. Annual means | Mean of the 12 months of each year, per grid cell | `pipeline/02_trends.py` |
| 3. How much | Theil-Sen slope per decade with a 95% confidence interval | `pipeline/seesaw_stats.py` |
| 4. Significant? | Mann-Kendall test with trend-free pre-whitening (handles autocorrelation) | `pipeline/seesaw_stats.py` |
| 5. Field significance | Benjamini-Hochberg false discovery rate across every cell of the map | `pipeline/seesaw_stats.py` |
| 6. Seesaw search | In the browser, for the clicked cell | `web/seesaw.js` |
| 7. Case File | Plain-language summary with a verdict | `web/seesaw.js` |

**Seesaw score.** For a region A and any region B with a significant trend of the opposite sign:

```
S(A, B) = sqrt(|beta_A| * |beta_B|) * max(0, -r)
```

`beta` is the trend per decade divided by the region's year-to-year spread, and `r` is the
correlation of the two series after their trends are removed. The first factor rewards strong
opposite trends; the second rewards regions that also move in anti-phase from year to year,
which hints at a shared driver. It is statistical evidence, not proof of cause.

**Verdicts.** *Significant*: FDR-adjusted q < 0.05. *Suggestive*: p < 0.05 but q >= 0.05.
*Not significant*: p >= 0.05.

## Repository layout

```
pipeline/
  01_fetch_power.py     download from the NASA POWER API into pipeline/raw/
  02_trends.py          statistics -> web/data/<variable>.json + manifest.json
  seesaw_stats.py       Theil-Sen, Mann-Kendall, FDR (shared module)
  make_sample_data.py   synthetic sample data (NOT NASA data)
web/                    static site (this folder is what gets deployed)
  index.html  style.css  app.js  seesaw.js
  data/                 JSON read by the site
  vendor/               Leaflet and Chart.js (bundled, no CDN needed)
vercel.json  requirements.txt  LICENSE
```

## Run the site locally

```bash
cd web
python -m http.server 8000
# open http://localhost:8000
```

## Replace the sample data with NASA data

```bash
python -m venv .venv && source .venv/bin/activate     # Windows: .venv\Scripts\activate
pip install -r requirements.txt

python pipeline/01_fetch_power.py      # Brazil and surroundings, T2M and PRECTOTCORR
python pipeline/02_trends.py           # writes web/data/
```

Notes:

- `01_fetch_power.py` has not been run against the live API yet. Test one small request first
  and compare the response with the [API documentation](https://power.larc.nasa.gov/docs/services/api/).
  If the regional endpoint refuses the tile size, use `--tile 5`; if it keeps failing, use
  `--mode point` (one request per grid point: slower, same result).
- Raw responses are cached in `pipeline/raw/` (ignored by git). Re-running only fetches what is missing.
- Useful options: `--lat -34,6 --lon -74,-34 --start 1981 --end 2025 --vars T2M,PRECTOTCORR`.
- Validate a few cells against [NASA Giovanni](https://giovanni.gsfc.nasa.gov/) before presenting any result.

## Deploy on Vercel

1. Push this repository to GitHub.
2. In Vercel: **Add New > Project**, import the repository, framework preset **Other**.
3. `vercel.json` already points the output to `web/`. If the deploy shows a 404, open
   **Settings > General > Root Directory**, set it to `web`, and redeploy.
4. Open the public link in a private window to confirm it needs no login.

## Team workflow (commits)

```bash
git clone <repository-url> && cd seesaw
git checkout -b feat/short-description      # one branch per task
# ...work...
git add -A
git commit -m "feat: add period selector"   # prefixes: feat, fix, data, docs, style
git push -u origin feat/short-description   # open a Pull Request into main
```

- `main` is what Vercel publishes: keep it working.
- Commit `web/data/*.json` only after `02_trends.py` ran on real data; say so in the commit message (`data: ...`).
- Never commit `pipeline/raw/` or `.venv/`.

## To do before submitting

- [ ] Run the pipeline on real NASA POWER data and remove the sample-data notice above
- [ ] Validate sample cells against NASA Giovanni
- [ ] Choose the showcase seesaw and describe it honestly (use the verdict the tool gives)
- [ ] Add team member names below
- [ ] Demo: 7 slides or 30-second video, public link
- [ ] Update the "Use of SI" section to match what the team actually did

## Data and resources

**NASA**

- [NASA POWER](https://power.larc.nasa.gov/) monthly API: `T2M` (temperature at 2 m) and
  `PRECTOTCORR` (precipitation), derived from MERRA-2. Main data source.
- [NASA Giovanni](https://giovanni.gsfc.nasa.gov/): cross-check of sample cells. *(planned)*

**Other**

- Leaflet 1.9.4 (BSD-2-Clause), Chart.js 4.4.1 (MIT), NumPy, SciPy, Requests.
- Base map: © OpenStreetMap contributors.
- Methods: Mann (1945); Kendall (1975); Sen (1968); Benjamini and Hochberg (1995);
  Yue et al. (2002), trend-free pre-whitening; Wilks (2016), field significance.

## Use of Super Intelligence (SI)

A large language model (Claude, by Anthropic) was used to help structure the project plan and
to write a first version of the code and of this documentation. SI-assisted files carry an
acknowledgement in their header and the website footer states it. The team reviewed, ran and
is responsible for the result. No SI-generated images, audio or video are used.
*(Team: edit this paragraph so it matches exactly what you did.)*

## Limitations

- Prototype region: Brazil and surroundings, 1° grid, two variables.
- Annual means hide seasonal changes; a wet-season trend can cancel a dry-season one.
- POWER meteorology is a reanalysis (model plus observations), not a direct measurement.
- The seesaw score finds statistical coupling. It does not identify the physical cause.

## Team

Trindade Full-Stack: *add member names here.*

## License

MIT. See `LICENSE`. This project is not endorsed by NASA.
