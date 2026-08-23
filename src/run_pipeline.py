"""
run_pipeline.py
End-to-end, reproducible pipeline:
  raw csv -> clean -> feature prep -> clustering (KMeans/Hierarchical/DBSCAN)
  -> segment profiling -> classification (segment prediction) -> export

Run with:  python src/run_pipeline.py
Produces:
  analysis/results.json   -> everything the frontend needs, computed for real
  models/*.joblib          -> persisted sklearn models + scaler
"""
from __future__ import annotations

import json
import pathlib
import sys

import joblib
import numpy as np
from sklearn.decomposition import PCA

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

from classification import train_and_evaluate  # noqa: E402
from clustering import (  # noqa: E402
    choose_dbscan_eps,
    choose_k,
    profile_segments,
    run_dbscan,
    run_hierarchical,
    run_kmeans,
)
from data_prep import prepare  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[1]
ANALYSIS_DIR = ROOT / "analysis"
MODELS_DIR = ROOT / "models"
ANALYSIS_DIR.mkdir(exist_ok=True)
MODELS_DIR.mkdir(exist_ok=True)


def main():
    print("[1/6] Loading + cleaning data, building features...")
    pdata = prepare()
    raw = pdata.raw
    spending = raw["Monthly_Spending"].values.astype(float)

    print("[2/6] Selecting k via elbow + silhouette (on behavioral features)...")
    k_search = choose_k(pdata.cluster_features_scaled)
    k = k_search["best_k"]
    print(f"      chosen k = {k} (silhouette={max(k_search['silhouette']):.3f})")

    print("[3/6] Running K-Means, Hierarchical, DBSCAN...")
    kmeans_res = run_kmeans(pdata.cluster_features_scaled, spending, k)
    hier_res = run_hierarchical(pdata.cluster_features_scaled, spending, k)
    dbscan_res = run_dbscan(pdata.cluster_features_scaled, spending)

    print(f"      KMeans silhouette:       {kmeans_res['silhouette']:.3f}")
    print(f"      Hierarchical silhouette: {hier_res['silhouette']:.3f}")
    print(f"      DBSCAN eps={dbscan_res['eps']:.3f}  clusters={dbscan_res['n_clusters']}  "
          f"noise={dbscan_res['noise_pct']:.1f}%  silhouette={dbscan_res['silhouette']}")

    print("[4/6] Profiling segments (K-Means, used as the canonical segmentation)...")
    kmeans_profiles = profile_segments(raw, kmeans_res["labels"])
    hier_profiles = profile_segments(raw, hier_res["labels"])
    dbscan_profiles = profile_segments(raw, dbscan_res["labels"])

    print("[5/6] Training classifiers to predict segment membership...")
    clf_results = train_and_evaluate(pdata.features_scaled, kmeans_res["labels"], pdata.feature_names)
    for name, m in clf_results["metrics"].items():
        print(f"      {name:15s} acc={m['accuracy']:.3f} f1={m['f1']:.3f}")
    print(f"      Best model by F1: {clf_results['best_model']}")

    print("[6/6] Building 2D projection (PCA) for the frontend scatter view...")
    pca = PCA(n_components=2, random_state=42)
    coords = pca.fit_transform(pdata.cluster_features_scaled)
    explained_var = pca.explained_variance_ratio_.round(4).tolist()

    # ---- persist models ----
    joblib.dump(pdata.scaler, MODELS_DIR / "scaler.joblib")
    joblib.dump(pdata.cluster_scaler, MODELS_DIR / "cluster_scaler.joblib")
    joblib.dump(kmeans_res["model"], MODELS_DIR / "kmeans.joblib")
    for name, model in clf_results["models"].items():
        joblib.dump(model, MODELS_DIR / f"{name.lower().replace(' ', '_')}.joblib")
    print(f"[models] saved to {MODELS_DIR}")

    # ---- assemble export payload for the frontend ----
    sample_points = []
    rng = np.random.default_rng(42)
    idx = rng.choice(len(raw), size=min(400, len(raw)), replace=False)  # keep payload light
    for i in idx:
        sample_points.append({
            "id": int(raw.iloc[i]["User_ID"]),
            "x": round(float(coords[i, 0]), 3),
            "y": round(float(coords[i, 1]), 3),
            "kmeans_segment": int(kmeans_res["labels"][i]),
            "hierarchical_segment": int(hier_res["labels"][i]),
            "dbscan_segment": int(dbscan_res["labels"][i]),
            "age": int(raw.iloc[i]["Age"]),
            "gender": raw.iloc[i]["Gender"],
            "region": raw.iloc[i]["Region"],
            "genre": raw.iloc[i]["Preferred_Genre"],
            "subscription": raw.iloc[i]["Subscription_Type"],
            "binge": raw.iloc[i]["Binge_Watching_Frequency"],
            "platform": raw.iloc[i]["Platform_Usage"],
            "watch_time": int(raw.iloc[i]["Watch_Time_per_Week"]),
            "spending": int(raw.iloc[i]["Monthly_Spending"]),
        })

    def dist_pct(col):
        return (raw[col].value_counts(normalize=True) * 100).round(1).to_dict()

    payload = {
        "meta": {
            "n_consumers": int(len(raw)),
            "n_attributes": int(raw.shape[1] - 1),  # excluding User_ID
            "n_segments": int(k),
            "n_classification_models": 3,
        },
        "audience_overview": {
            "age": {"min": int(raw.Age.min()), "max": int(raw.Age.max()), "mean": round(float(raw.Age.mean()), 1)},
            "watch_time": {"min": int(raw.Watch_Time_per_Week.min()), "max": int(raw.Watch_Time_per_Week.max()),
                            "mean": round(float(raw.Watch_Time_per_Week.mean()), 1)},
            "spending": {"min": int(raw.Monthly_Spending.min()), "max": int(raw.Monthly_Spending.max()),
                          "mean": round(float(raw.Monthly_Spending.mean()), 1)},
            "gender_distribution": dist_pct("Gender"),
            "region_distribution": dist_pct("Region"),
            "genre_distribution": dist_pct("Preferred_Genre"),
            "subscription_distribution": dist_pct("Subscription_Type"),
            "binge_distribution": dist_pct("Binge_Watching_Frequency"),
            "platform_distribution": dist_pct("Platform_Usage"),
        },
        "cluster_selection": k_search,
        "clustering": {
            "kmeans": {
                "k": kmeans_res["k"],
                "silhouette": round(kmeans_res["silhouette"], 3),
                "profiles": kmeans_profiles,
                "centroids_scaled": kmeans_res["model"].cluster_centers_.round(4).tolist(),
            },
            "hierarchical": {
                "k": hier_res["k"],
                "silhouette": round(hier_res["silhouette"], 3),
                "profiles": hier_profiles,
            },
            "dbscan": {
                "eps": round(dbscan_res["eps"], 3),
                "min_samples": dbscan_res["min_samples"],
                "n_clusters": dbscan_res["n_clusters"],
                "noise_pct": round(dbscan_res["noise_pct"], 1),
                "silhouette": round(dbscan_res["silhouette"], 3) if dbscan_res["silhouette"] else None,
                "profiles": dbscan_profiles,
            },
        },
        "pca": {"explained_variance": explained_var},
        "sample_points": sample_points,
        "classification": {
            "target_description": "Predicts K-Means segment membership from raw viewer attributes.",
            "metrics": clf_results["metrics"],
            "best_model": clf_results["best_model"],
            "feature_importance": clf_results["feature_importance"],
            "train_size": clf_results["train_size"],
            "test_size": clf_results["test_size"],
        },
        "feature_names": pdata.feature_names,
        "cluster_feature_names": list(pdata.cluster_features.columns),
        "cluster_scaler": {
            "mean": pdata.cluster_scaler.mean_.round(6).tolist(),
            "scale": pdata.cluster_scaler.scale_.round(6).tolist(),
        },
        "pca_components": pca.components_.round(6).tolist(),
        "ordinal_maps": {"Binge_Watching_Frequency": ["Rarely", "Sometimes", "Often"]},
    }

    out_path = ANALYSIS_DIR / "results.json"
    with open(out_path, "w") as f:
        json.dump(payload, f, indent=2)
    print(f"\n[export] wrote {out_path} ({out_path.stat().st_size / 1024:.1f} KB)")


if __name__ == "__main__":
    main()
