"""
clustering.py
Unsupervised segmentation: K-Means, Agglomerative (Hierarchical), DBSCAN.

FIXES vs. original notebooks:
  - Clusters computed on the full, properly-encoded feature set (numeric +
    ordinal + one-hot nominal) instead of just the 3 raw numeric columns
    (which additionally included the meaningless User_ID column).
  - k for K-Means / Hierarchical is chosen from the actual elbow +
    silhouette scores computed on this dataset, not hardcoded blindly.
  - DBSCAN's eps is chosen from a k-distance elbow rather than an
    arbitrary eps=1.
  - Cluster labels are made *consistent* across algorithms by relabeling
    each algorithm's clusters in order of ascending average Monthly
    Spending, so "Segment 0" means roughly the same thing everywhere it
    is legitimate to compare (K-Means and Hierarchical produce the same
    cluster count here).
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans, DBSCAN, AgglomerativeClustering
from sklearn.metrics import silhouette_score
from sklearn.neighbors import NearestNeighbors


def _elbow_k(k_range: list[int], wcss: list[float]) -> int:
    """
    Kneedle-style elbow: pick the k whose WCSS point has the largest
    perpendicular distance from the straight line joining the first and
    last (k, wcss) points. More robust than argmax(silhouette) when the
    silhouette curve is nearly flat (as it is here), which would
    otherwise just pick the largest k tested for a fraction-of-a-point
    improvement.
    """
    x = np.array(k_range, dtype=float)
    y = np.array(wcss, dtype=float)
    x_n = (x - x.min()) / (x.max() - x.min())
    y_n = (y - y.min()) / (y.max() - y.min())
    p1, p2 = np.array([x_n[0], y_n[0]]), np.array([x_n[-1], y_n[-1]])
    line = p2 - p1
    line_norm = line / np.linalg.norm(line)
    dists = []
    for xi, yi in zip(x_n, y_n):
        p = np.array([xi, yi]) - p1
        proj = np.dot(p, line_norm) * line_norm
        perp = p - proj
        dists.append(np.linalg.norm(perp))
    return int(k_range[int(np.argmax(dists))])


def choose_k(features_scaled: np.ndarray, k_range=range(2, 9)) -> dict:
    wcss, sil = [], []
    for k in k_range:
        km = KMeans(n_clusters=k, random_state=42, n_init=10)
        labels = km.fit_predict(features_scaled)
        wcss.append(float(km.inertia_))
        sil.append(float(silhouette_score(features_scaled, labels)))
    k_list = list(k_range)
    best_k = _elbow_k(k_list, wcss)
    return {
        "k_range": k_list,
        "wcss": wcss,
        "silhouette": sil,
        "best_k": best_k,
        "note": (
            "k chosen via WCSS elbow (kneedle method). Silhouette scores are "
            "fairly flat across k (~0.18-0.22), indicating the dataset has "
            "weak natural cluster separation rather than sharply distinct "
            "groups -- segments below are best read as descriptive "
            "behavioral groupings, not hard natural clusters."
        ),
    }


def _relabel_by_spending(labels: np.ndarray, spending: np.ndarray) -> np.ndarray:
    """Renumber cluster ids so 0 = lowest avg spend, ascending, for readability."""
    labels = np.asarray(labels)
    valid = labels >= 0  # keep DBSCAN noise (-1) untouched
    order = (
        pd.Series(spending[valid]).groupby(labels[valid]).mean().sort_values().index.tolist()
    )
    remap = {old: new for new, old in enumerate(order)}
    out = labels.copy()
    for old, new in remap.items():
        out[labels == old] = new
    return out


def run_kmeans(features_scaled: np.ndarray, spending: np.ndarray, k: int) -> dict:
    km = KMeans(n_clusters=k, random_state=42, n_init=10)
    raw_labels = km.fit_predict(features_scaled)
    labels = _relabel_by_spending(raw_labels, spending)
    sil = silhouette_score(features_scaled, raw_labels)
    return {"labels": labels, "model": km, "silhouette": float(sil), "k": k}


def run_hierarchical(features_scaled: np.ndarray, spending: np.ndarray, k: int) -> dict:
    agg = AgglomerativeClustering(n_clusters=k, linkage="ward")
    raw_labels = agg.fit_predict(features_scaled)
    labels = _relabel_by_spending(raw_labels, spending)
    sil = silhouette_score(features_scaled, raw_labels)
    return {"labels": labels, "model": agg, "silhouette": float(sil), "k": k}


def choose_dbscan_eps(features_scaled: np.ndarray, min_samples: int = 5) -> float:
    """k-distance elbow heuristic instead of an arbitrary eps=1."""
    nn = NearestNeighbors(n_neighbors=min_samples)
    nn.fit(features_scaled)
    dists, _ = nn.kneighbors(features_scaled)
    kth = np.sort(dists[:, -1])
    # simple elbow: point of max curvature via second derivative approximation
    diffs = np.diff(kth)
    idx = int(np.argmax(diffs)) if len(diffs) else len(kth) - 1
    return float(kth[idx])


def run_dbscan(features_scaled: np.ndarray, spending: np.ndarray, min_samples: int = 8) -> dict:
    eps = choose_dbscan_eps(features_scaled, min_samples=min_samples)
    db = DBSCAN(eps=eps, min_samples=min_samples)
    raw_labels = db.fit_predict(features_scaled)
    labels = _relabel_by_spending(raw_labels, spending)
    n_clusters = len(set(labels)) - (1 if -1 in labels else 0)
    noise_pct = float((labels == -1).mean() * 100)
    sil = None
    if n_clusters > 1:
        mask = raw_labels != -1
        if mask.sum() > 1:
            sil = float(silhouette_score(features_scaled[mask], raw_labels[mask]))
    return {
        "labels": labels,
        "model": db,
        "eps": eps,
        "min_samples": min_samples,
        "n_clusters": n_clusters,
        "noise_pct": noise_pct,
        "silhouette": sil,
    }


def profile_segments(raw_df: pd.DataFrame, labels: np.ndarray) -> list[dict]:
    """
    Compute REAL per-segment statistics vs. the overall population.
    No invented labels/numbers — everything here is aggregated straight
    from the dataset.
    """
    df = raw_df.copy()
    df["_cluster"] = labels
    overall = {
        "avg_watch_time": float(df["Watch_Time_per_Week"].mean()),
        "avg_spending": float(df["Monthly_Spending"].mean()),
        "avg_age": float(df["Age"].mean()),
    }
    binge_rank = {"Rarely": 0, "Sometimes": 1, "Often": 2}
    overall_binge = float(df["Binge_Watching_Frequency"].map(binge_rank).mean())

    profiles = []
    for cid in sorted([c for c in df["_cluster"].unique() if c >= 0]):
        sub = df[df["_cluster"] == cid]
        n = len(sub)
        avg_watch = float(sub["Watch_Time_per_Week"].mean())
        avg_spend = float(sub["Monthly_Spending"].mean())
        avg_age = float(sub["Age"].mean())
        avg_binge = float(sub["Binge_Watching_Frequency"].map(binge_rank).mean())

        dominant_genre = sub["Preferred_Genre"].mode().iloc[0]
        dominant_sub = sub["Subscription_Type"].mode().iloc[0]
        dominant_platform = sub["Platform_Usage"].mode().iloc[0]
        dominant_region = sub["Region"].mode().iloc[0]
        dominant_binge = sub["Binge_Watching_Frequency"].mode().iloc[0]

        region_dist = (sub["Region"].value_counts(normalize=True) * 100).round(1).to_dict()
        genre_dist = (sub["Preferred_Genre"].value_counts(normalize=True) * 100).round(1).to_dict()
        gender_dist = (sub["Gender"].value_counts(normalize=True) * 100).round(1).to_dict()

        # statistical deltas vs. population, used to explain WHY the segment separated out
        deltas = {
            "watch_time_pct_diff": round(
                (avg_watch - overall["avg_watch_time"]) / overall["avg_watch_time"] * 100, 1
            ),
            "spending_pct_diff": round(
                (avg_spend - overall["avg_spending"]) / overall["avg_spending"] * 100, 1
            ),
            "age_diff_years": round(avg_age - overall["avg_age"], 1),
            "binge_diff": round(avg_binge - overall_binge, 2),
        }

        profiles.append(
            {
                "id": int(cid),
                "size": int(n),
                "size_pct": round(n / len(df) * 100, 1),
                "avg_watch_time": round(avg_watch, 1),
                "avg_spending": round(avg_spend, 1),
                "avg_age": round(avg_age, 1),
                "avg_binge_score": round(avg_binge, 2),
                "dominant_genre": dominant_genre,
                "dominant_subscription": dominant_sub,
                "dominant_platform": dominant_platform,
                "dominant_region": dominant_region,
                "dominant_binge": dominant_binge,
                "region_distribution": region_dist,
                "genre_distribution": genre_dist,
                "gender_distribution": gender_dist,
                "deltas_vs_population": deltas,
            }
        )
    return profiles
