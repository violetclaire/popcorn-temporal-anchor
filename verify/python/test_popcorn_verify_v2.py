"""Cross-language checks for the isolated POPCORN-WITNESS/2.0 contract."""

import base64
import copy
import hashlib
import json
import unittest
from pathlib import Path

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature

from popcorn_verify_v2 import digest_witness_signed_payload, verify_popcorn_witness_evidence


ROOT = Path(__file__).parents[2]
VECTOR = json.loads((ROOT / "verify" / "test-vectors" / "popcorn-witness-receipt-v2.json").read_text())
CHAIN = json.loads((ROOT / "verify" / "test-vectors" / "popcorn-witness-chain-v2.json").read_text())
LEGACY = json.loads((ROOT / "verify" / "test-vectors" / "popcorn-witness-receipt-v1.json").read_text())
PAYLOAD = base64.urlsafe_b64decode(VECTOR["exact_payload"]["bytes"] + "=")
JWKS = {"keys": [VECTOR["public_verification_key"]]}


def verify(response, payload=PAYLOAD, nonce=VECTOR["submitted_request"]["nonce"]):
    return verify_popcorn_witness_evidence(
        response, JWKS, expected_payload=payload, expected_nonce=nonce
    )


def resign(mutator):
    response = copy.deepcopy(VECTOR["paid_evidence"])
    mutator(response["witness_receipt"])
    encoded_header = response["witness_attestation"]["compact_jws"].split(".")[0]
    payload = json.dumps(response["witness_receipt"], sort_keys=True, separators=(",", ":")).encode()
    encoded_payload = base64.urlsafe_b64encode(payload).decode().rstrip("=")
    signing_input = (encoded_header + "." + encoded_payload).encode()
    private_key = ec.derive_private_key(1, ec.SECP256R1())  # fixture-only scalar
    der = private_key.sign(signing_input, ec.ECDSA(hashes.SHA256(), deterministic_signing=True))
    r, s = decode_dss_signature(der)
    signature = base64.urlsafe_b64encode(r.to_bytes(32, "big") + s.to_bytes(32, "big")).decode().rstrip("=")
    response["witness_attestation"]["compact_jws"] = signing_input.decode() + "." + signature
    return response


class WitnessV2Tests(unittest.TestCase):
    def test_deterministic_vector_and_approved_license_digest(self):
        result = verify(VECTOR["paid_evidence"])
        self.assertTrue(result["signature_verified"])
        self.assertEqual(result["witness_receipt"]["tain"], "tain_01M354CM7J0000000000000001")
        self.assertTrue(result["replay_key"].startswith("POPCORN-WITNESS/2.0:"))
        license_bytes = (ROOT / "reference" / "contribution-license" / "1.0.txt").read_bytes()
        digest = base64.urlsafe_b64encode(hashlib.sha256(license_bytes).digest()).decode().rstrip("=")
        self.assertEqual(result["witness_receipt"]["license_terms_digest"]["value"], digest)
        self.assertEqual(
            digest_witness_signed_payload(VECTOR["paid_evidence"]["witness_attestation"]["compact_jws"]),
            VECTOR["expected_signed_payload_digest"],
        )

    def test_v2_chain(self):
        predecessor = CHAIN["predecessor"]
        current = CHAIN["current"]
        result = verify_popcorn_witness_evidence(
            current["paid_evidence"],
            {"keys": [current["public_verification_key"]]},
            expected_payload=base64.urlsafe_b64decode(current["exact_payload"]["bytes"] + "="),
            expected_nonce=current["submitted_request"]["nonce"],
            previous_receipt={
                "response": predecessor["paid_evidence"],
                "jwks": {"keys": [predecessor["public_verification_key"]]},
                "verification": {
                    "expected_payload": base64.urlsafe_b64decode(predecessor["exact_payload"]["bytes"] + "="),
                    "expected_nonce": predecessor["submitted_request"]["nonce"],
                },
            },
        )
        self.assertTrue(result["previous_attestation_digest_matched"])
        self.assertEqual(current["submitted_request"]["previous_attestation_digest"]["value"], CHAIN["expected_previous_signed_payload_digest"])

    def test_legacy_and_signed_malformed_tain_fail_closed(self):
        with self.assertRaisesRegex(ValueError, "witness_receipt contains missing or unsupported fields"):
            verify_popcorn_witness_evidence(
                LEGACY["paid_evidence"],
                {"keys": [LEGACY["public_verification_key"]]},
                expected_payload=base64.urlsafe_b64decode(LEGACY["exact_schedule"]["bytes"] + "="),
                expected_nonce=LEGACY["submitted_request"]["nonce"],
            )
        for mutation, message in [
            (lambda receipt: receipt.pop("tain"), "witness_receipt contains missing or unsupported fields"),
            (lambda receipt: receipt.update(tain="tain_bad"), "witness receipt tain is missing or malformed"),
            (lambda receipt: receipt.update(tain="tain_01M354CM7K0000000000000001", tain_verification_uri="https://767-2676.com/v1/receipt/tain/tain_01M354CM7K0000000000000001"), "tain does not match witnessed_at_utc"),
        ]:
            with self.subTest(message=message), self.assertRaisesRegex(ValueError, message):
                verify(resign(mutation))

    def test_provenance_and_presentation_are_bound(self):
        for mutation in [
            lambda receipt: receipt.update(issuing_origin="https://copy.example"),
            lambda receipt: receipt.update(tain_verification_uri="https://copy.example/verify"),
            lambda receipt: receipt.update(contribution_license_uri="https://copy.example/license"),
        ]:
            with self.subTest(mutation=mutation), self.assertRaisesRegex(ValueError, "provenance or license URI is invalid"):
                verify(resign(mutation))
        full = {
            **VECTOR["paid_evidence"],
            "tain_qr_png_base64": "iVBORw0KGgo=",  # Worker tests must decode the actual QR PNG.
            "tain_qr_payload": VECTOR["expected_qr_payload"],
            "letterhead_uri": VECTOR["paid_evidence"]["witness_receipt"]["tain_verification_uri"],
        }
        self.assertTrue(verify(full)["signature_verified"])
        full["tain_qr_payload"] = full["tain_qr_payload"].replace("license_uri", "wrong_uri")
        with self.assertRaisesRegex(ValueError, "TAIN QR payload contains missing or unsupported fields"):
            verify(full)
        full["tain_qr_payload"] = json.dumps(json.loads(VECTOR["expected_qr_payload"]), sort_keys=True, separators=(",", ":"))
        with self.assertRaisesRegex(ValueError, "TAIN QR payload is not minified in canonical key order"):
            verify(full)
        del full["letterhead_uri"]
        with self.assertRaisesRegex(ValueError, "response contains missing or unsupported fields"):
            verify(full)


if __name__ == "__main__":
    unittest.main()
