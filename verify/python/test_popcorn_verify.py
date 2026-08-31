import copy
import base64
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
WITNESS_RESPONSE = WITNESS_VECTOR["paid_evidence"]
WITNESS_JWKS = {"keys": [WITNESS_VECTOR["public_verification_key"]]}
WITNESS_PAYLOAD = base64.urlsafe_b64decode(
    WITNESS_VECTOR["exact_schedule"]["bytes"] + "="
)

PROCEED_PACKET = json.loads(
    (Path(__file__).parents[2] / "examples" / "witness" / "evaluation-packet.proceed-002.production.json").read_text()
)
PROCEED_PAYLOAD = base64.urlsafe_b64decode(
    PROCEED_PACKET["exact_schedule"]["bytes"] + "="
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

    def test_settled_production_payload_bound_witness(self):
        result = verify_popcorn_witness_evidence(
            WITNESS_RESPONSE,
            WITNESS_JWKS,
            expected_payload=WITNESS_PAYLOAD,
            expected_nonce=WITNESS_VECTOR["submitted_request"]["nonce"],
            max_clock_accuracy_radius_ms=10_000,
        )
        expected = WITNESS_VECTOR["expected_verification"]["exact_schedule"]
        self.assertEqual(result["key_id"], WITNESS_VECTOR["public_verification_key"]["kid"])
        self.assertTrue(result["payload_digest_verified"])
        self.assertTrue(result["nonce_verified"])
        self.assertFalse(result["previous_attestation_digest_matched"])
        self.assertEqual(result["replay_key"], expected["replay_key"])
        self.assertEqual(result["payment_replay_key"], expected["payment_replay_key"])
        self.assertEqual(
            result["witness_window_utc"],
            WITNESS_RESPONSE["witness_receipt"]["witness_window_utc"],
        )

    def test_settled_proceed_checkpoint_is_inside_schedule_window(self):
        result = verify_popcorn_witness_evidence(
            PROCEED_PACKET["paid_evidence"],
            {"keys": [PROCEED_PACKET["public_verification_key"]]},
            expected_payload=PROCEED_PAYLOAD,
            expected_nonce=PROCEED_PACKET["submitted_request"]["nonce"],
            max_clock_accuracy_radius_ms=10_000,
        )
        schedule = json.loads(PROCEED_PAYLOAD)
        self.assertTrue(result["signature_verified"])
        self.assertTrue(result["payload_digest_verified"])
        self.assertTrue(result["nonce_verified"])
        self.assertGreaterEqual(
            result["witness_window_utc"]["latest"],
            schedule["execution_window_utc"]["opens_at"],
        )
        self.assertLessEqual(
            result["witness_window_utc"]["earliest"],
            schedule["execution_window_utc"]["closes_at"],
        )

    def test_witness_rejects_different_payload(self):
        with self.assertRaisesRegex(ValueError, "payload digest does not match"):
            verify_popcorn_witness_evidence(
                WITNESS_RESPONSE,
                WITNESS_JWKS,
                expected_payload=base64.urlsafe_b64decode(
                    WITNESS_VECTOR["expected_verification"]["one_byte_tamper"]["tampered_bytes"] + "="
                ),
                expected_nonce=WITNESS_VECTOR["submitted_request"]["nonce"],
            )

    def test_witness_rejects_different_nonce(self):
        with self.assertRaisesRegex(ValueError, "nonce does not match"):
            verify_popcorn_witness_evidence(
                WITNESS_RESPONSE,
                WITNESS_JWKS,
                expected_payload=WITNESS_PAYLOAD,
                expected_nonce="CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC",
            )

    def test_witness_rejects_wrong_predecessor(self):
        with self.assertRaisesRegex(ValueError, "does not contain a previous attestation commitment"):
            verify_popcorn_witness_evidence(
                WITNESS_RESPONSE,
                WITNESS_JWKS,
                expected_payload=WITNESS_PAYLOAD,
                expected_nonce=WITNESS_VECTOR["submitted_request"]["nonce"],
                expected_previous_attestation="not-the-previous-attestation",
            )

    def test_witness_rejects_altered_scope(self):
        response = copy.deepcopy(WITNESS_RESPONSE)
        response["witness_receipt"]["evidence_scope"]["replay_prevented"] = True
        with self.assertRaisesRegex(ValueError, "does not equal the signed payload"):
            verify_popcorn_witness_evidence(
                response,
                WITNESS_JWKS,
                expected_payload=WITNESS_PAYLOAD,
                expected_nonce=WITNESS_VECTOR["submitted_request"]["nonce"],
            )


if __name__ == "__main__":
    unittest.main()
