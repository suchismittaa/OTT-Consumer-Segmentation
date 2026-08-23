"""
data_prep.py
Data loading, cleaning and feature preparation for the OTT Consumer
Segmentation project.

FIXES vs. original notebooks:
  - User_ID is explicitly dropped before any numeric feature selection.
    (Original notebooks selected `df.select_dtypes(include=['number'])`,
    which silently swept User_ID into the clustering/scaling matrix as if
    it were a meaningful numeric signal.)
  - Categorical attributes (Gender, Region, Preferred_Genre,
    Subscription_Type, Platform_Usage) are properly encoded instead of
    being ignored. Binge_Watching_Frequency is encoded ordinally
    (Rarely < Sometimes < Often) since it has a natural order; the rest
    are one-hot encoded since they are nominal.
  - No hardcoded Colab (`/content/...`) paths — everything is relative
    to the project root and resolved via pathlib.
"""
from __future__ import annotations

import pathlib
from dataclasses import dataclass

import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler

ROOT = pathlib.Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "data" / "OTT_Consumer_Segmentation.csv"

ID_COL = "User_ID"
NUMERIC_COLS = ["Age", "Watch_Time_per_Week", "Monthly_Spending"]
ORDINAL_COLS = {"Binge_Watching_Frequency": ["Rarely", "Sometimes", "Often"]}
NOMINAL_COLS = ["Gender", "Region", "Preferred_Genre", "Subscription_Type", "Platform_Usage"]


@dataclass
class PreparedData:
    raw: pd.DataFrame              # original data, untouched, User_ID kept for reference only
    features: pd.DataFrame         # engineered feature matrix (no User_ID), pre-scaling
    features_scaled: np.ndarray    # StandardScaler-transformed feature matrix
    feature_names: list[str]
    scaler: StandardScaler
    cluster_features: pd.DataFrame       # behavioral-only subset used for clustering
    cluster_features_scaled: np.ndarray  # scaled version of the above
    cluster_scaler: StandardScaler


def load_raw(path: pathlib.Path = DATA_PATH) -> pd.DataFrame:
    df = pd.read_csv(path)
    return df


def clean(df: pd.DataFrame) -> pd.DataFrame:
    """Drop exact duplicates and rows with missing values. Report both."""
    before = len(df)
    df = df.drop_duplicates()
    df = df.dropna()
    after = len(df)
    if before != after:
        print(f"[clean] Removed {before - after} rows (duplicates/missing).")
    return df.reset_index(drop=True)


def build_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Build the model-ready feature frame.
    Explicitly excludes User_ID — it is a row identifier, not a behavioral signal.
    """
    feats = pd.DataFrame(index=df.index)

    # numeric behavioral signals
    for col in NUMERIC_COLS:
        feats[col] = df[col].astype(float)

    # ordinal: frequency has a real order, so map to 0/1/2 rather than one-hot
    for col, order in ORDINAL_COLS.items():
        mapping = {v: i for i, v in enumerate(order)}
        feats[col] = df[col].map(mapping).astype(float)

    # nominal: one-hot encode (no natural order)
    nominal_dummies = pd.get_dummies(df[NOMINAL_COLS], prefix=NOMINAL_COLS)
    feats = pd.concat([feats, nominal_dummies.astype(float)], axis=1)

    return feats


def build_cluster_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Feature subset used specifically for CLUSTERING.

    Deliberately narrower than build_features(): one-hot dummies for
    5-6 category nominal columns (Region, Genre, Platform, ...), each
    scaled to unit variance, end up contributing far more total variance
    to a Euclidean distance metric than the 3-4 genuinely continuous
    behavioral signals combined. In practice this makes K-Means/
    Hierarchical clustering split almost entirely along "which genre
    checkbox is 1" rather than actual behavior — a mechanical artifact,
    not a real segment. Standard practice for mixed-type segmentation is
    to cluster on the continuous/ordinal behavioral variables and use the
    categorical/demographic fields afterward to *profile and interpret*
    the resulting groups (see clustering.profile_segments), which is
    exactly what this project now does.
    """
    feats = pd.DataFrame(index=df.index)
    for col in NUMERIC_COLS:
        feats[col] = df[col].astype(float)
    for col, order in ORDINAL_COLS.items():
        mapping = {v: i for i, v in enumerate(order)}
        feats[col] = df[col].map(mapping).astype(float)
    return feats


def prepare(path: pathlib.Path = DATA_PATH) -> PreparedData:
    raw = clean(load_raw(path))

    features = build_features(raw)
    scaler = StandardScaler()
    scaled = scaler.fit_transform(features.values)

    cluster_features = build_cluster_features(raw)
    cluster_scaler = StandardScaler()
    cluster_scaled = cluster_scaler.fit_transform(cluster_features.values)

    return PreparedData(
        raw=raw,
        features=features,
        features_scaled=scaled,
        feature_names=list(features.columns),
        scaler=scaler,
        cluster_features=cluster_features,
        cluster_features_scaled=cluster_scaled,
        cluster_scaler=cluster_scaler,
    )


if __name__ == "__main__":
    pd_data = prepare()
    print(pd_data.raw.shape, pd_data.features.shape)
    print(pd_data.feature_names)
