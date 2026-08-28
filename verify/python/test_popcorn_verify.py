import copy
import json
import unittest
from pathlib import Path

from popcorn_verify import verify_popcorn_temporal_evidence


VECTOR = json.loads(
    (Path(__file__).parents[1] / "test-vectors" / "popcorn-receipt-v1.json").read_text()
)


class PopcornVerifierTests(unittest.TestCase):
    def test_positive_vector(self):
        result = verify_popcorn_temporal_evidence(
            VECTOR["response"],
            VECTOR["jwks"],
            VECTOR["client_observation"],
            execution_window_utc=VECTOR["execution_window_utc"],
        )
        expected = VECTOR["expected"]
        self.assertEqual(result["key_id"], expected["key_id"])
        self.assertEqual(result["paid_request_rtt_ms"], expected["paid_request_rtt_ms"])
        self.assertEqual(result["network_uncertainty_ms"], expected["network_uncertainty_ms"])
        self.assertEqual(result["remaining_validity_now_ms"], expected["remaining_validity_now_ms"])
        self.assertEqual(result["temporal_interval_now_utc"]["earliest"], expected["earliest_server_time_now_utc"])
        self.assertEqual(result["temporal_interval_now_utc"]["latest"], expected["latest_server_time_now_utc"])
        self.assertTrue(result["execution_window"]["eligible"])

    def test_tampering_is_rejected(self):
        response = copy.deepcopy(VECTOR["response"])
        response["temporal_receipt"]["node_id"] = "copy.example"
        with self.assertRaisesRegex(ValueError, "does not equal the signed payload"):
            verify_popcorn_temporal_evidence(response, VECTOR["jwks"], VECTOR["client_observation"])

    def test_unknown_key_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "absent from JWKS"):
            verify_popcorn_temporal_evidence(VECTOR["response"], {"keys": []}, VECTOR["client_observation"])

    def test_stale_evidence_fails_closed(self):
        monotonic = copy.deepcopy(VECTOR["client_observation"])
        monotonic["decision_monotonic_ms"] = VECTOR["negative_cases"]["expired_decision_monotonic_ms"]
        result = verify_popcorn_temporal_evidence(
            VECTOR["response"], VECTOR["jwks"], monotonic,
            execution_window_utc=VECTOR["execution_window_utc"],
        )
        self.assertEqual(result["remaining_validity_now_ms"], 0)
        self.assertEqual(result["execution_window"]["next_action"], "request_new_temporal_anchor")

    def test_closed_window_fails_closed(self):
        result = verify_popcorn_temporal_evidence(
            VECTOR["response"], VECTOR["jwks"], VECTOR["client_observation"],
            execution_window_utc=VECTOR["negative_cases"]["closed_execution_window_utc"],
        )
        self.assertFalse(result["execution_window"]["eligible"])


if __name__ == "__main__":
    unittest.main()
