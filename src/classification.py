"""
classification.py
Supervised stage: given the segments discovered by clustering, can we
predict which segment a *new* viewer belongs to from their attributes
alone (without re-running clustering on the whole dataset)?

FIX vs. original "Updated" notebook:
  The original notebook set `y = df.iloc[:, -1]`, which is
  Monthly_Spending — a continuous numeric column. Feeding a continuous
  variable into RandomForestClassifier / SVC / KNeighborsClassifier as a
  multi-class label is not a valid classification setup: every distinct
  spending value becomes its own "class", so accuracy/precision/recall
  numbers computed this way do not mean what they appear to mean.

  The legitimate, useful classification task here is: predict the
  behavioral SEGMENT (the label produced by clustering) from a viewer's
  raw attributes. That's also exactly what the "Try a Consumer" demo on
  the frontend needs — assigning a hypothetical new viewer to a segment
  instantly, without recomputing K-Means over the whole population.
"""
from __future__ import annotations

import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import (
    accuracy_score,
    f1_score,
    precision_score,
    recall_score,
)
from sklearn.model_selection import train_test_split
from sklearn.neighbors import KNeighborsClassifier
from sklearn.svm import SVC


def evaluate(model, X_test, y_test) -> dict:
    y_pred = model.predict(X_test)
    return {
        "accuracy": float(accuracy_score(y_test, y_pred)),
        "precision": float(precision_score(y_test, y_pred, average="weighted", zero_division=0)),
        "recall": float(recall_score(y_test, y_pred, average="weighted", zero_division=0)),
        "f1": float(f1_score(y_test, y_pred, average="weighted", zero_division=0)),
    }


def train_and_evaluate(features_scaled: np.ndarray, segment_labels: np.ndarray, feature_names: list[str]):
    X_train, X_test, y_train, y_test = train_test_split(
        features_scaled, segment_labels, test_size=0.2, random_state=42, stratify=segment_labels
    )

    results = {}
    trained_models = {}

    rf = RandomForestClassifier(n_estimators=200, random_state=42)
    rf.fit(X_train, y_train)
    results["Random Forest"] = evaluate(rf, X_test, y_test)
    trained_models["Random Forest"] = rf

    svm = SVC(kernel="rbf", probability=True, random_state=42)
    svm.fit(X_train, y_train)
    results["SVM"] = evaluate(svm, X_test, y_test)
    trained_models["SVM"] = svm

    knn = KNeighborsClassifier(n_neighbors=7)
    knn.fit(X_train, y_train)
    results["KNN"] = evaluate(knn, X_test, y_test)
    trained_models["KNN"] = knn

    # feature importance is only well-defined for RF
    importances = dict(zip(feature_names, rf.feature_importances_.round(4).tolist()))
    importances = dict(sorted(importances.items(), key=lambda kv: -kv[1]))

    best_model_name = max(results, key=lambda m: results[m]["f1"])

    return {
        "metrics": results,
        "models": trained_models,
        "feature_importance": importances,
        "best_model": best_model_name,
        "test_size": len(y_test),
        "train_size": len(y_train),
    }
