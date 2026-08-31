import copy
import json
import unittest
from pathlib import Path

from popcorn_verify import (
    verify_popcorn_temporal_evidence,
    verify_popcorn_witness_evidence,
)


VECTOR = json.loads(
    (Path(__file__).parents[1] / "test-vectors" / "popcorn-receipt-v1.json").read_text()
)

WITNESS_VECTOR = json.loads(
    (Path(__file__).parents[1] / "test-vectors" / "popcorn-witness-receipt-v1.json").read_text()
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

    def test_payload_bound_witness_and_predecessor_digest_binding(self):
        predecessor = verify_popcorn_temporal_evidence(
            VECTOR["response"],
            VECTOR["jwks"],
            VECTOR["client_observation"],
        )
        self.assertTrue(predecessor["signature_verified"])
        self.assertEqual(
            WITNESS_VECTOR["previous_attestation"],
            VECTOR["response"]["temporal_attestation"]["compact_jws"],
        )
        result = verify_popcorn_witness_evidence(
            WITNESS_VECTOR["response"],
            WITNESS_VECTOR["jwks"],
            expected_payload=WITNESS_VECTOR["payload_utf8"],
            expected_nonce=WITNESS_VECTOR["request"]["nonce"],
            expected_previous_attestation=WITNESS_VECTOR["previous_attestation"],
        )
        expected = WITNESS_VECTOR["expected"]
        self.assertEqual(result["key_id"], expected["key_id"])
        self.assertTrue(result["payload_digest_verified"])
        self.assertTrue(result["nonce_verified"])
        self.assertTrue(result["previous_attestation_digest_matched"])
        self.assertEqual(result["replay_key"], expected["replay_key"])
        self.assertEqual(result["witness_window_utc"], expected["witness_window_utc"])

    def test_witness_rejects_different_payload(self):
        with self.assertRaisesRegex(ValueError, "payload digest does not match"):
            verify_popcorn_witness_evidence(
                WITNESS_VECTOR["response"],
                WITNESS_VECTOR["jwks"],
                expected_payload=WITNESS_VECTOR["negative_cases"]["wrong_payload_utf8"],
                expected_nonce=WITNESS_VECTOR["request"]["nonce"],
                expected_previous_attestation=WITNESS_VECTOR["previous_attestation"],
            )

    def test_witness_rejects_different_nonce(self):
        with self.assertRaisesRegex(ValueError, "nonce does not match"):
            verify_popcorn_witness_evidence(
                WITNESS_VECTOR["response"],
                WITNESS_VECTOR["jwks"],
                expected_payload=WITNESS_VECTOR["payload_utf8"],
                expected_nonce=WITNESS_VECTOR["negative_cases"]["wrong_nonce"],
                expected_previous_attestation=WITNESS_VECTOR["previous_attestation"],
            )

    def test_witness_rejects_wrong_predecessor(self):
        with self.assertRaisesRegex(ValueError, "previous attestation digest does not match"):
            verify_popcorn_witness_evidence(
                WITNESS_VECTOR["response"],
                WITNESS_VECTOR["jwks"],
                expected_payload=WITNESS_VECTOR["payload_utf8"],
                expected_nonce=WITNESS_VECTOR["request"]["nonce"],
                expected_previous_attestation=WITNESS_VECTOR["negative_cases"]["wrong_previous_attestation"],
            )

    def test_witness_rejects_altered_scope(self):
        response = copy.deepcopy(WITNESS_VECTOR["response"])
        response["witness_receipt"]["evidence_scope"]["replay_prevented"] = True
        with self.assertRaisesRegex(ValueError, "does not equal the signed payload"):
            verify_popcorn_witness_evidence(
                response,
                WITNESS_VECTOR["jwks"],
                expected_payload=WITNESS_VECTOR["payload_utf8"],
                expected_nonce=WITNESS_VECTOR["request"]["nonce"],
                expected_previous_attestation=WITNESS_VECTOR["previous_attestation"],
            )


if __name__ == "__main__":
    unittest.main()
