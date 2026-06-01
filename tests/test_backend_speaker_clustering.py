import unittest
from unittest import mock

import numpy as np

from backend import server


class SpeakerClusteringTests(unittest.TestCase):
    def test_median_smoothing_does_not_collapse_two_timbres_to_one(self):
        labels = np.array([1, 1, 0, 1, 1])

        smoothed = server.smooth_labels_preserving_clusters(
            labels,
            smoothing_width=5,
            n_clusters=2,
        )

        self.assertEqual({0, 1}, set(int(label) for label in smoothed))

    def test_cluster_audio_features_falls_back_when_gmm_collapses(self):
        features = np.array(
            [
                [0.0, 0.0],
                [0.1, 0.1],
                [10.0, 10.0],
                [10.1, 10.1],
            ]
        )

        with mock.patch("backend.server.GaussianMixture") as gmm_cls, mock.patch("backend.server.KMeans") as kmeans_cls:
            gmm_cls.return_value.fit_predict.return_value = np.array([0, 0, 0, 0])
            kmeans_cls.return_value.fit_predict.return_value = np.array([0, 0, 1, 1])

            labels = server.cluster_audio_features(features, n_clusters=2)

        self.assertEqual([0, 0, 1, 1], labels.tolist())
        kmeans_cls.assert_called_once()


if __name__ == "__main__":
    unittest.main()
