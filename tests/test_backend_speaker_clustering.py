import unittest

import numpy as np

from backend import neural_diarization


class SpeakerClusteringTests(unittest.TestCase):
    def test_cluster_embeddings_keeps_similar_speakers_together(self):
        embeddings = np.array(
            [
                [1.0, 0.0],
                [0.0, 1.0],
                [0.9, 0.1],
            ],
            dtype=np.float32,
        )

        labels = neural_diarization.cluster_embeddings(embeddings, n_clusters=2)

        self.assertEqual([0, 1, 0], labels)

    def test_cluster_embeddings_collapses_to_one_label_when_requested(self):
        embeddings = np.array([[1.0, 0.0], [0.0, 1.0]], dtype=np.float32)

        labels = neural_diarization.cluster_embeddings(embeddings, n_clusters=1)

        self.assertEqual([0, 0], labels)


if __name__ == "__main__":
    unittest.main()
