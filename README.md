# OTT Consumer Intelligence — Segmentation & Interactive Lab

An interactive audience-intelligence experience built around a real OTT (streaming)
consumer segmentation project: 1,000 viewers, unsupervised clustering (K-Means,
Hierarchical, DBSCAN), and supervised segment-prediction (Random Forest, SVM, KNN).

The frontend is a visualization/exploration layer, not a separate demo — every
number it shows was computed by the pipeline in `src/` and exported to
`analysis/results.json` / `frontend/js/data.js`.

```
data/            OTT_Consumer_Segmentation.csv (1,000 rows, 10 columns)
src/             clean, reproducible analytics pipeline
  data_prep.py     loading, cleaning, feature engineering
  clustering.py    K-Means / Hierarchical / DBSCAN + segment profiling
  classification.py  Random Forest / SVM / KNN trained to predict segment membership
  run_pipeline.py  orchestrates the above, exports JSON, persists models
models/          persisted scaler + trained models (joblib)
analysis/        results.json — the full computed output the frontend consumes
notebooks/       original research notebooks, kept intact and unmodified
frontend/        static interactive site (HTML/CSS/vanilla JS)
```

---

## A. What I changed

1. **Removed `User_ID` from the feature matrix.** The original notebooks selected
   `df.select_dtypes(include=['number'])` for clustering, which silently pulled in
   `User_ID` — a row identifier — as if it were a meaningful numeric signal.
2. **Fixed the classification target.** The "Updated" notebook set
   `y = df.iloc[:, -1]`, which is `Monthly_Spending` — a continuous variable — fed
   into `RandomForestClassifier` / `SVC` / `KNeighborsClassifier` as a multi-class
   label. Every distinct spending value became its own class, so the printed
   accuracy/precision/recall numbers didn't mean what they appeared to. The target
   is now **segment membership** (the label produced by clustering), which is both
   methodologically valid and directly useful — it's what powers the "Try a Viewer"
   prediction demo.
3. **Separated clustering features from classification features.** One-hot dummies
   for 5–6 category columns (Region, Genre, Platform, Subscription, Gender), each
   scaled to unit variance, contribute far more total variance to a Euclidean
   distance metric than the handful of genuinely continuous behavioral columns —
   so clustering on the full one-hot matrix produced clusters that mechanically
   split by "which genre checkbox is on," not real behavior. Clustering now runs
   on continuous/ordinal behavioral features only (age, watch time, spending,
   binge frequency); the categorical/demographic fields are used afterward to
   *profile and interpret* the resulting groups — standard practice for
   mixed-type segmentation.
4. **Data-driven k selection.** `k` for K-Means/Hierarchical now comes from a
   WCSS elbow (kneedle method) computed on this dataset, not a hardcoded guess.
5. **Data-driven DBSCAN eps.** Replaced a fixed, untuned `eps=1` with a k-distance
   elbow heuristic.
6. **Removed the hardcoded Google Colab path** (`/content/OTT_Consumer_Segmentation.csv`)
   in favor of paths resolved relative to the project root.
7. **Model persistence.** The scaler, K-Means model, and all three classifiers are
   now saved via `joblib` so the pipeline is actually reusable, not notebook-only.
8. **Consistent cluster labeling.** Cluster IDs are relabeled by ascending average
   spend across all three algorithms so "Segment 0" means roughly the same thing
   everywhere a comparison is legitimate.
9. Original notebooks were **left untouched** in `notebooks/` — nothing was deleted,
   the corrected logic lives alongside them in `src/`.

## B. What I discovered

- **Silhouette scores are low and nearly flat across k = 2..8 (~0.18–0.22).**
  This dataset does not contain sharply separated natural clusters — which is
  consistent with it being a synthetically generated/course dataset rather than
  organically collected behavioral logs. The frontend states this explicitly
  rather than overselling the segments as hard natural groups; they're
  presented as descriptive behavioral groupings.
- **DBSCAN found very little density structure at a naive `eps=1`** (nearly all
  points flagged as noise). With a proper k-distance elbow, it settles on a
  small number of reasonably sized clusters, but is still the least stable of
  the three algorithms on this data — worth noting on the frontend rather than
  hiding.
- **KNN performs much worse than Random Forest / SVM at predicting segment
  membership** (see numbers below) once the feature space is one-hot expanded —
  consistent with the curse of dimensionality degrading raw distance-based
  lookup, while tree- and margin-based models tolerate the sparsity better.
- The original "Updated" notebook's classification results were not reproducible
  as methodologically valid numbers; no fabricated figure was substituted —
  the whole target was corrected instead.

## C. How the ML pipeline works now

```
raw CSV (1,000 × 10)
   → drop_duplicates / dropna
   → drop User_ID
   → build two feature views:
       - cluster_features:  Age, Watch_Time_per_Week, Monthly_Spending,
                             Binge_Watching_Frequency (ordinal) — 4 columns
       - full features:     the above + one-hot Gender/Region/Genre/
                             Subscription/Platform — ~26 columns
   → StandardScaler fit separately for each view
   → K-Means / Agglomerative(Ward) / DBSCAN fit on cluster_features_scaled
       (k chosen via WCSS elbow; DBSCAN eps via k-distance elbow)
   → segment profiles computed as real groupby() aggregates vs. population
   → Random Forest / SVM / KNN trained on full features_scaled to predict
     K-Means segment label, 80/20 train/test split, evaluated on the held-out
     20%
   → PCA(2) on cluster_features_scaled for the frontend scatter plot
   → everything exported to analysis/results.json
```

Run it end to end with `python src/run_pipeline.py`. Every metric shown on the
frontend is copied verbatim from that JSON — nothing is hand-typed into the UI.

Latest run on this dataset (yours may vary slightly due to `random_state`
being fixed but k/eps selection being data-driven):

| Model | Accuracy | Precision | Recall | F1 |
|---|---|---|---|---|
| Random Forest | 91.0% | 91.6% | 91.0% | 91.0% |
| SVM | 88.5% | 88.7% | 88.5% | 88.4% |
| KNN | 45.5% | 46.3% | 45.5% | 45.3% |

## D. How to run it locally

**Regenerate the analysis (optional — `analysis/results.json` is already committed):**
```bash
pip install -r requirements.txt
python src/run_pipeline.py
```
This overwrites `analysis/results.json` and the models in `models/`. If you
change the pipeline, regenerate `frontend/js/data.js` from the new JSON:
```bash
python -c "
import json
d = json.load(open('analysis/results.json'))
with open('frontend/js/data.js','w') as f:
    f.write('const OTT_DATA = ')
    json.dump(d, f, indent=0)
    f.write(';')
"
```

**Run the frontend:**
```bash
cd frontend
python3 -m http.server 8000
# open http://localhost:8000
```
No build step, no npm install — it's a static site that reads `js/data.js`
directly, so it also works if you just double-click `index.html` locally.

## E. Deployment

Because `frontend/` is fully static (HTML/CSS/vanilla JS, data baked into
`js/data.js`), it deploys to any static host with zero configuration:

- **Vercel / Netlify:** point either at the `frontend/` folder as the project
  root (no build command needed) and deploy.
- **GitHub Pages:** push `frontend/`'s contents to a `gh-pages` branch (or the
  repo root of a dedicated Pages repo) and enable Pages in the repo settings.
- **Any static bucket (S3 + CloudFront, Cloudflare Pages, etc.):** upload the
  contents of `frontend/` as-is.

If you want the demo to reflect a *live* re-run of the pipeline instead of a
static export, you'd need to stand up `src/run_pipeline.py` behind a small API
(e.g. FastAPI) and have the frontend `fetch()` it instead of loading
`data.js` — the pipeline functions are already separated cleanly enough to
drop into a route handler with minimal changes.
