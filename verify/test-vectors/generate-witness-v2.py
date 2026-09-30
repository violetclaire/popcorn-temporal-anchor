"""Regenerate deterministic, synthetic POPCORN-WITNESS/2.0 vectors.

The fixed P-256 scalar and TAIN suffixes are test-only. Never use them for issuance.
"""

from __future__ import annotations

import base64
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature


ROOT = Path(__file__).parents[2]
HERE = Path(__file__).parent
LICENSE = ROOT / "reference" / "contribution-license" / "1.0.txt"
CROCKFORD32 = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
ORIGIN = "https://767-2676.com"
LICENSE_URI = ORIGIN + "/license/contribution/1.0"
PRIVATE_KEY = ec.derive_private_key(1, ec.SECP256R1())  # public test fixture only
KEY_ID = "popcorn-witness-v2-deterministic-test-key"


def b64(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def sha256(value: bytes) -> str:
    return b64(hashlib.sha256(value).digest())


def canonical(value: object) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def iso(ms: int) -> str:
    return datetime.fromtimestamp(ms / 1000, timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def base32(value: int, width: int) -> str:
    result = ""
    for _ in range(width):
        result = CROCKFORD32[value & 31] + result
        value >>= 5
    if value:
        raise ValueError("TAIN component exceeds its field width")
    return result


def tain(ms: int, suffix: int) -> str:
    return "tain_" + base32(ms, 10) + base32(suffix, 16)


def public_jwk() -> dict[str, str]:
    numbers = PRIVATE_KEY.public_key().public_numbers()
    return {
        "kty": "EC",
        "crv": "P-256",
        "x": b64(numbers.x.to_bytes(32, "big")),
        "y": b64(numbers.y.to_bytes(32, "big")),
        "use": "sig",
        "alg": "ES256",
        "kid": KEY_ID,
        "popcorn_protocol": "POPCORN-WITNESS/2.0",
    }


def make_vector(index: int, ms: int, previous_digest: str | None, license_digest: str) -> dict:
    payload = canonical({"checkpoint_id": f"v2-{index}", "state": "ready"}) + b"\n"
    nonce = b64(bytes(range((index - 1) * 32, index * 32)))
    request = {
        "payload_digest": {"algorithm": "sha-256", "value": sha256(payload)},
        "nonce": nonce,
        "previous_attestation_digest": (
            {"algorithm": "sha-256", "value": previous_digest}
            if previous_digest is not None else None
        ),
    }
    issuance_tain = tain(ms, index)
    receipt = {
        "receipt_id": f"pwr_{index:032x}",
        "tain": issuance_tain,
        "node_id": "767-2676.com",
        "protocol_id": "POPCORN-WITNESS/2.0",
        "request_received_at_utc": iso(ms - 10),
        "witnessed_at_utc": iso(ms),
        "statement_created_at_utc": iso(ms + 10),
        "unix_time_milliseconds": ms,
        "clock_accuracy_radius_ms": 1000,
        "witness_window_utc": {"earliest": iso(ms - 1000), "latest": iso(ms + 1000)},
        "server_processing_duration_ms": 20,
        "post_witness_processing_duration_ms": 10,
        "commitment": request,
        "payment_identifier": f"test_vector_only_no_settlement_{index}",
        "payment_transaction": None,
        "evidence_scope": {
            "type": "payload_commitment_witness",
            "payload_disclosed": False,
            "caller_identity_proven": False,
            "recipient_delivery_proven": False,
            "action_execution_proven": False,
            "nonce_uniqueness_enforced": False,
            "replay_prevented": False,
            "authorization_granted": False,
            "external_atomic_clock_alignment_proven": False,
            "clock_accuracy_independently_verified": False,
            "payer_authorization_bound_to_commitment": False,
        },
        "issuing_origin": ORIGIN,
        "issuance_endpoint": "/v1/receipt",
        "tain_verification_uri": ORIGIN + "/v1/receipt/tain/" + issuance_tain,
        "contribution_license_uri": LICENSE_URI,
        "license_terms_digest": {"algorithm": "sha-256", "value": license_digest},
    }
    header = {"alg": "ES256", "kid": KEY_ID, "typ": "popcorn-witness+jws"}
    encoded_header = b64(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    signed_payload = canonical(receipt)
    encoded_payload = b64(signed_payload)
    signing_input = (encoded_header + "." + encoded_payload).encode("ascii")
    der = PRIVATE_KEY.sign(signing_input, ec.ECDSA(hashes.SHA256(), deterministic_signing=True))
    r, s = decode_dss_signature(der)
    compact = signing_input.decode("ascii") + "." + b64(r.to_bytes(32, "big") + s.to_bytes(32, "big"))
    qr = {
        "v": 1,
        "tain": issuance_tain,
        "license_uri": LICENSE_URI,
        "terms_digest": license_digest,
        "verify_uri": receipt["tain_verification_uri"],
    }
    return {
        "test_only": True,
        "description": "Synthetic cryptographic conformance fixture; payment fields are not settlement evidence.",
        "protocol_id": "POPCORN-WITNESS/2.0",
        "exact_payload": {"encoding": "base64url", "byte_length": len(payload), "bytes": b64(payload)},
        "submitted_request": request,
        "paid_evidence": {
            "witness_receipt": receipt,
            "witness_attestation": {
                "format": "JWS",
                "algorithm": "ES256",
                "key_id": KEY_ID,
                "key_set": "/.well-known/popcorn-keys.json",
                "compact_jws": compact,
            },
            "payment_status": "settled",
        },
        "public_verification_key": public_jwk(),
        "expected_qr_payload": json.dumps(qr, separators=(",", ":")),
        "expected_signed_payload_digest": sha256(signed_payload),
    }


def main() -> None:
    license_bytes = LICENSE.read_bytes()
    assert license_bytes.endswith(b"\n") and not license_bytes.endswith(b"\n\n")
    assert b"\r" not in license_bytes
    assert hashlib.sha256(license_bytes).hexdigest() == "711d2084e387e831b74847a86313f0d5bdfca0bdb07f62234dacc64b18bebc86"
    license_digest = sha256(license_bytes)
    first_ms = 1790100001010  # Corrects the PDF's numeric-ms typo; matches its ISO date and TAIN.
    first = make_vector(1, first_ms, None, license_digest)
    assert first["paid_evidence"]["witness_receipt"]["tain"] == "tain_01M354CM7J0000000000000001"
    second = make_vector(2, first_ms + 2000, first["expected_signed_payload_digest"], license_digest)
    chain = {
        "test_only": True,
        "protocol_id": "POPCORN-WITNESS/2.0",
        "predecessor": first,
        "current": second,
        "expected_previous_signed_payload_digest": first["expected_signed_payload_digest"],
    }
    (HERE / "popcorn-witness-receipt-v2.json").write_text(json.dumps(first, indent=2) + "\n", encoding="utf-8", newline="\n")
    (HERE / "popcorn-witness-chain-v2.json").write_text(json.dumps(chain, indent=2) + "\n", encoding="utf-8", newline="\n")


if __name__ == "__main__":
    main()
