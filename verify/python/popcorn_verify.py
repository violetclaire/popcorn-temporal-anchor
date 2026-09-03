"""Network-free POPCORN temporal and payload-bound witness verification."""

from __future__ import annotations

import base64
import hashlib
import json
from datetime import datetime, timezone
from typing import Any

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature


def _decode_base64url(value: str) -> bytes:
    if not value or any(c not in "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_" for c in value):
        raise ValueError("compact JWS contains invalid base64url")
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def _json_part(value: str, label: str) -> Any:
    try:
        return json.loads(_decode_base64url(value))
    except (ValueError, json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise ValueError(f"{label} is not valid base64url JSON") from exc


def _utc_ms(value: str, label: str) -> int:
    if not isinstance(value, str) or not value.endswith("Z"):
        raise ValueError(f"{label} must be an explicit UTC timestamp")
    try:
        parsed = datetime.fromisoformat(value[:-1] + "+00:00")
    except ValueError as exc:
        raise ValueError(f"{label} is invalid") from exc
    if parsed.tzinfo != timezone.utc:
        raise ValueError(f"{label} must be UTC")
    return round(parsed.timestamp() * 1000)


def _b64int(value: str) -> int:
    return int.from_bytes(_decode_base64url(value), "big")


def _validate_relationship(actual: int, expected: Any, label: str) -> None:
    if (
        not isinstance(expected, int)
        or isinstance(expected, bool)
        or expected < 0
        or actual != expected
    ):
        raise ValueError(f"{label} signed relationship is invalid")


def _sha256_base64url(value: bytes | str) -> str:
    if not isinstance(value, (bytes, str)):
        raise ValueError("value to hash must be bytes or a string")
    data = value.encode() if isinstance(value, str) else value
    return base64.urlsafe_b64encode(hashlib.sha256(data).digest()).decode().rstrip("=")


def digest_witness_signed_payload(compact_jws: str) -> str:
    if not isinstance(compact_jws, str):
        raise ValueError("compact_jws is missing")
    parts = compact_jws.split(".")
    if len(parts) != 3 or any(not part for part in parts):
        raise ValueError("compact_jws must contain exactly three parts")
    payload_bytes = _decode_base64url(parts[1])
    canonical = base64.urlsafe_b64encode(payload_bytes).decode().rstrip("=")
    if canonical != parts[1]:
        raise ValueError("compact JWS signed payload is not canonical base64url")
    return _sha256_base64url(payload_bytes)


def _require_exact_keys(value: dict[str, Any], expected: set[str], label: str) -> None:
    if set(value) != expected:
        raise ValueError(f"{label} contains missing or unsupported fields")


def _require_sha256_digest(value: Any, label: str) -> None:
    if (
        not isinstance(value, dict)
        or value.get("algorithm") != "sha-256"
        or not isinstance(value.get("value"), str)
        or len(value["value"]) != 43
        or any(c not in "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_" for c in value["value"])
    ):
        raise ValueError(f"{label} must be an unpadded base64url SHA-256 digest")
    _require_exact_keys(value, {"algorithm", "value"}, label)


def _require_nonce(value: Any) -> None:
    if (
        not isinstance(value, str)
        or len(value) != 43
        or any(c not in "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_" for c in value)
    ):
        raise ValueError("nonce must be 32 unpadded base64url bytes")


def evaluate_witness_against_schedule(
    witness_window_utc: dict[str, str],
    execution_window_utc: dict[str, str],
) -> dict[str, Any]:
    if not isinstance(witness_window_utc, dict):
        raise ValueError("witness_window_utc is missing")
    if not isinstance(execution_window_utc, dict):
        raise ValueError("execution_window_utc is missing")
    _require_exact_keys(witness_window_utc, {"earliest", "latest"}, "witness_window_utc")
    _require_exact_keys(execution_window_utc, {"opens_at", "closes_at"}, "execution_window_utc")

    earliest_ms = _utc_ms(witness_window_utc["earliest"], "witness_window_utc.earliest")
    latest_ms = _utc_ms(witness_window_utc["latest"], "witness_window_utc.latest")
    if earliest_ms > latest_ms:
        raise ValueError("witness_window_utc is not ordered")
    opens_ms = _utc_ms(execution_window_utc["opens_at"], "execution_window_utc.opens_at")
    closes_ms = _utc_ms(execution_window_utc["closes_at"], "execution_window_utc.closes_at")
    if opens_ms >= closes_ms:
        raise ValueError("execution_window_utc is not ordered")

    if latest_ms < opens_ms:
        decision = "STOP"
        reason = "witness_window_entirely_before_execution_window"
    elif earliest_ms > closes_ms:
        decision = "STOP"
        reason = "witness_window_entirely_after_execution_window"
    elif earliest_ms >= opens_ms and latest_ms <= closes_ms:
        decision = "TIME_CHECK_PASSED"
        reason = "witness_window_entirely_inside_execution_window"
    else:
        decision = "RECHECK"
        reason = "witness_uncertainty_crosses_execution_boundary"

    return {
        "decision": decision,
        "authorization_granted": False,
        "reason": reason,
        "witness_window_utc": dict(witness_window_utc),
        "execution_window_utc": dict(execution_window_utc),
    }


def verify_popcorn_temporal_evidence(
    response: dict[str, Any],
    jwks: dict[str, Any],
    monotonic: dict[str, float],
    *,
    expected_node_id: str = "767-2676.com",
    execution_window_utc: dict[str, str] | None = None,
) -> dict[str, Any]:
    receipt = response.get("temporal_receipt")
    attestation = response.get("temporal_attestation")
    if not isinstance(receipt, dict) or not isinstance(attestation, dict):
        raise ValueError("response is missing temporal receipt or attestation")
    compact = attestation.get("compact_jws")
    if not isinstance(compact, str):
        raise ValueError("compact_jws is missing")
    parts = compact.split(".")
    if len(parts) != 3 or any(not part for part in parts):
        raise ValueError("compact_jws must contain exactly three parts")
    encoded_header, encoded_payload, encoded_signature = parts
    header = _json_part(encoded_header, "protected header")
    if not isinstance(header, dict) or header.get("alg") != "ES256" or not isinstance(header.get("kid"), str):
        raise ValueError("protected header must contain alg=ES256 and kid")
    kid = header["kid"]
    if attestation.get("algorithm", "ES256") != "ES256":
        raise ValueError("attestation algorithm does not match ES256")
    if "key_id" in attestation and attestation["key_id"] != kid:
        raise ValueError("attestation key_id does not match protected kid")

    keys = jwks.get("keys") if isinstance(jwks, dict) else None
    key = next((candidate for candidate in keys or [] if candidate.get("kid") == kid), None)
    if key is None:
        raise ValueError(f"kid {kid} is absent from JWKS")
    if key.get("kty") != "EC" or key.get("crv") != "P-256" or key.get("alg", "ES256") != "ES256" or key.get("use", "sig") != "sig":
        raise ValueError("JWKS key is not an ES256 P-256 signature key")

    signature = _decode_base64url(encoded_signature)
    if len(signature) != 64:
        raise ValueError("ES256 signature must be 64 bytes")
    public_key = ec.EllipticCurvePublicNumbers(
        _b64int(key["x"]), _b64int(key["y"]), ec.SECP256R1()
    ).public_key()
    der_signature = encode_dss_signature(
        int.from_bytes(signature[:32], "big"),
        int.from_bytes(signature[32:], "big"),
    )
    try:
        public_key.verify(
            der_signature,
            f"{encoded_header}.{encoded_payload}".encode(),
            ec.ECDSA(hashes.SHA256()),
        )
    except InvalidSignature as exc:
        raise ValueError("ES256 temporal receipt signature is invalid") from exc

    signed_receipt = _json_part(encoded_payload, "signed payload")
    if signed_receipt != receipt:
        raise ValueError("response temporal_receipt does not equal the signed payload")
    if receipt.get("node_id") != expected_node_id:
        raise ValueError("unexpected node_id")
    if receipt.get("protocol_id") != "POPCORN/1.0":
        raise ValueError("unexpected protocol_id")

    request_received_ms = _utc_ms(receipt["request_received_at_utc"], "request_received_at_utc")
    observed_ms = _utc_ms(receipt["observed_at_utc"], "observed_at_utc")
    measurement_ms = _utc_ms(receipt["measurement_at_utc"], "measurement_at_utc")
    valid_until_ms = _utc_ms(receipt["valid_until_utc"], "valid_until_utc")
    _validate_relationship(measurement_ms - request_received_ms, receipt.get("server_processing_duration_ms"), "server_processing_duration_ms")
    _validate_relationship(measurement_ms - observed_ms, receipt.get("post_anchor_processing_duration_ms"), "post_anchor_processing_duration_ms")
    _validate_relationship(valid_until_ms - measurement_ms, receipt.get("validity_at_measurement_ms"), "validity_at_measurement_ms")
    _validate_relationship(valid_until_ms - observed_ms, receipt.get("freshness_window_ms"), "freshness_window_ms")
    if receipt.get("unix_time_milliseconds") != observed_ms:
        raise ValueError("unix_time_milliseconds signed relationship is invalid")
    scope = receipt.get("evidence_scope")
    if not isinstance(scope, dict) or scope != {
        "type": "bearer_temporal_evidence",
        "caller_bound": False,
        "task_bound": False,
        "authorization_granted": False,
    }:
        raise ValueError("temporal evidence must be bearer, non-authorizing, and unbound")

    start = monotonic.get("paid_request_start_monotonic_ms")
    received = monotonic.get("paid_response_receive_monotonic_ms")
    decision = monotonic.get("decision_monotonic_ms", received)
    if not all(isinstance(value, (int, float)) and value >= 0 for value in (start, received, decision)):
        raise ValueError("monotonic observations must be finite non-negative numbers")
    if received < start or decision < received:
        raise ValueError("monotonic observations are out of order")

    rtt_ms = received - start
    uncertainty_ms = max(0, rtt_ms - min(receipt["server_processing_duration_ms"], rtt_ms))
    remaining_at_receipt_ms = max(0, receipt["validity_at_measurement_ms"] - uncertainty_ms)
    elapsed_ms = decision - received
    remaining_now_ms = max(0, remaining_at_receipt_ms - elapsed_ms)
    earliest_ms = measurement_ms + elapsed_ms
    latest_ms = earliest_ms + uncertainty_ms

    def iso(ms: float) -> str:
        return datetime.fromtimestamp(ms / 1000, timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")

    result: dict[str, Any] = {
        "signature_verified": True,
        "key_id": kid,
        "temporal_receipt": receipt,
        "paid_request_rtt_ms": rtt_ms,
        "network_uncertainty_ms": uncertainty_ms,
        "remaining_validity_at_receipt_ms": remaining_at_receipt_ms,
        "remaining_validity_now_ms": remaining_now_ms,
        "temporal_interval_now_utc": {"earliest": iso(earliest_ms), "latest": iso(latest_ms)},
    }
    if execution_window_utc is not None:
        opens_ms = _utc_ms(execution_window_utc["opens_at_utc"], "opens_at_utc")
        closes_ms = _utc_ms(execution_window_utc["closes_at_utc"], "closes_at_utc")
        if opens_ms >= closes_ms:
            raise ValueError("execution_window_utc is not ordered")
        eligible = remaining_now_ms > 0 and earliest_ms >= opens_ms and latest_ms < closes_ms
        result["execution_window"] = {
            "eligible": eligible,
            "next_action": "continue_task" if eligible else "request_new_temporal_anchor",
            "reason": (
                "verified_interval_within_execution_window"
                if eligible
                else "temporal_evidence_expired"
                if remaining_now_ms == 0
                else "verified_interval_not_within_execution_window"
            ),
        }
    return result


def verify_popcorn_witness_evidence(
    response: dict[str, Any],
    jwks: dict[str, Any],
    *,
    expected_nonce: str,
    expected_payload: bytes | str | None = None,
    expected_payload_digest: str | None = None,
    previous_receipt: dict[str, Any] | None = None,
    expected_node_id: str = "767-2676.com",
    max_clock_accuracy_radius_ms: int = 60_000,
    _seen_attestations: set[str] | None = None,
) -> dict[str, Any]:
    receipt = response.get("witness_receipt")
    attestation = response.get("witness_attestation")
    if not isinstance(receipt, dict) or not isinstance(attestation, dict):
        raise ValueError("response is missing witness receipt or attestation")
    _require_exact_keys(
        response,
        {"witness_receipt", "witness_attestation", "payment_status"},
        "response",
    )
    _require_exact_keys(
        attestation,
        {"format", "algorithm", "key_id", "key_set", "compact_jws"},
        "witness_attestation",
    )
    compact = attestation.get("compact_jws")
    if not isinstance(compact, str):
        raise ValueError("compact_jws is missing")
    seen_attestations = _seen_attestations if _seen_attestations is not None else set()
    if compact in seen_attestations:
        raise ValueError("witness receipt chain contains a cycle")
    seen_attestations.add(compact)
    parts = compact.split(".")
    if len(parts) != 3 or any(not part for part in parts):
        raise ValueError("compact_jws must contain exactly three parts")
    encoded_header, encoded_payload, encoded_signature = parts
    header = _json_part(encoded_header, "protected header")
    if (
        not isinstance(header, dict)
        or header.get("alg") != "ES256"
        or not isinstance(header.get("kid"), str)
        or header.get("typ") != "popcorn-witness+jws"
    ):
        raise ValueError("protected header must contain alg=ES256, kid, and typ=popcorn-witness+jws")
    kid = header["kid"]
    if attestation.get("format") != "JWS":
        raise ValueError("attestation format does not match JWS")
    if attestation.get("algorithm") != "ES256":
        raise ValueError("attestation algorithm does not match ES256")
    if attestation.get("key_id") != kid:
        raise ValueError("attestation key_id does not match protected kid")
    if attestation.get("key_set") != "/.well-known/popcorn-keys.json":
        raise ValueError("attestation key_set is not canonical")
    if response.get("payment_status") != "settled":
        raise ValueError("witness payment_status is not settled")

    keys = jwks.get("keys") if isinstance(jwks, dict) else None
    key = next((candidate for candidate in keys or [] if candidate.get("kid") == kid), None)
    if key is None:
        raise ValueError(f"kid {kid} is absent from JWKS")
    if key.get("kty") != "EC" or key.get("crv") != "P-256" or key.get("alg", "ES256") != "ES256" or key.get("use", "sig") != "sig":
        raise ValueError("JWKS key is not an ES256 P-256 signature key")

    signature = _decode_base64url(encoded_signature)
    if len(signature) != 64:
        raise ValueError("ES256 signature must be 64 bytes")
    public_key = ec.EllipticCurvePublicNumbers(
        _b64int(key["x"]), _b64int(key["y"]), ec.SECP256R1()
    ).public_key()
    der_signature = encode_dss_signature(
        int.from_bytes(signature[:32], "big"),
        int.from_bytes(signature[32:], "big"),
    )
    try:
        public_key.verify(
            der_signature,
            f"{encoded_header}.{encoded_payload}".encode(),
            ec.ECDSA(hashes.SHA256()),
        )
    except InvalidSignature as exc:
        raise ValueError("ES256 witness receipt signature is invalid") from exc

    signed_receipt = _json_part(encoded_payload, "signed payload")
    if signed_receipt != receipt:
        raise ValueError("response witness_receipt does not equal the signed payload")
    _require_exact_keys(
        receipt,
        {
            "receipt_id",
            "node_id",
            "protocol_id",
            "request_received_at_utc",
            "witnessed_at_utc",
            "statement_created_at_utc",
            "unix_time_milliseconds",
            "clock_accuracy_radius_ms",
            "witness_window_utc",
            "server_processing_duration_ms",
            "post_witness_processing_duration_ms",
            "commitment",
            "payment_identifier",
            "payment_transaction",
            "evidence_scope",
        },
        "witness_receipt",
    )
    if receipt.get("node_id") != expected_node_id:
        raise ValueError("unexpected node_id")
    if receipt.get("protocol_id") != "POPCORN-WITNESS/1.0":
        raise ValueError("unexpected protocol_id")
    if (
        not isinstance(receipt.get("receipt_id"), str)
        or not receipt["receipt_id"]
        or not isinstance(receipt.get("payment_identifier"), str)
        or not receipt["payment_identifier"]
        or not (
            receipt.get("payment_transaction") is None
            or isinstance(receipt.get("payment_transaction"), str)
        )
    ):
        raise ValueError("receipt identifiers are missing")

    request_received_ms = _utc_ms(receipt["request_received_at_utc"], "request_received_at_utc")
    witnessed_ms = _utc_ms(receipt["witnessed_at_utc"], "witnessed_at_utc")
    statement_created_ms = _utc_ms(receipt["statement_created_at_utc"], "statement_created_at_utc")
    if request_received_ms > witnessed_ms or witnessed_ms > statement_created_ms:
        raise ValueError("witness receipt timestamps are out of order")
    _validate_relationship(
        statement_created_ms - request_received_ms,
        receipt.get("server_processing_duration_ms"),
        "server_processing_duration_ms",
    )
    _validate_relationship(
        statement_created_ms - witnessed_ms,
        receipt.get("post_witness_processing_duration_ms"),
        "post_witness_processing_duration_ms",
    )
    if receipt.get("unix_time_milliseconds") != witnessed_ms:
        raise ValueError("unix_time_milliseconds signed relationship is invalid")
    radius_ms = receipt.get("clock_accuracy_radius_ms")
    if not isinstance(radius_ms, int) or isinstance(radius_ms, bool) or radius_ms < 0:
        raise ValueError("clock_accuracy_radius_ms must be a non-negative integer")
    if (
        not isinstance(max_clock_accuracy_radius_ms, int)
        or isinstance(max_clock_accuracy_radius_ms, bool)
        or max_clock_accuracy_radius_ms < 0
    ):
        raise ValueError("max_clock_accuracy_radius_ms must be a non-negative integer")
    if radius_ms > max_clock_accuracy_radius_ms:
        raise ValueError("witness clock accuracy exceeds local policy")

    def iso(ms: int) -> str:
        return datetime.fromtimestamp(ms / 1000, timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")

    earliest = iso(witnessed_ms - radius_ms)
    latest = iso(witnessed_ms + radius_ms)
    witness_window = receipt.get("witness_window_utc")
    if not isinstance(witness_window, dict):
        raise ValueError("witness_window_utc is missing")
    _require_exact_keys(witness_window, {"earliest", "latest"}, "witness_window_utc")
    if witness_window != {"earliest": earliest, "latest": latest}:
        raise ValueError("witness_window_utc signed relationship is invalid")

    commitment = receipt.get("commitment")
    if not isinstance(commitment, dict):
        raise ValueError("commitment is missing")
    _require_exact_keys(
        commitment,
        {"payload_digest", "nonce", "previous_attestation_digest"},
        "commitment",
    )
    _require_sha256_digest(commitment.get("payload_digest"), "payload_digest")
    _require_nonce(commitment.get("nonce"))
    previous_digest = commitment.get("previous_attestation_digest")
    if previous_digest is not None:
        _require_sha256_digest(previous_digest, "previous_attestation_digest")

    expected_scope = {
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
    }
    if receipt.get("evidence_scope") != expected_scope:
        raise ValueError("witness evidence scope is invalid")

    _require_nonce(expected_nonce)
    if commitment["nonce"] != expected_nonce:
        raise ValueError("receipt nonce does not match the expected request nonce")
    if (expected_payload is None) == (expected_payload_digest is None):
        raise ValueError("provide exactly one expected_payload or expected_payload_digest")
    digest = (
        _sha256_base64url(expected_payload)
        if expected_payload is not None
        else expected_payload_digest
    )
    if not isinstance(digest, str):
        raise ValueError("expected payload digest is missing")
    _require_sha256_digest({"algorithm": "sha-256", "value": digest}, "expected_payload_digest")
    if commitment["payload_digest"]["value"] != digest:
        raise ValueError("receipt payload digest does not match the expected payload")

    previous_attestation_digest_matched = False
    if previous_digest is not None:
        if previous_receipt is None:
            raise ValueError("previous receipt is required to verify the claimed chain")
        if not isinstance(previous_receipt, dict):
            raise ValueError("previous_receipt must be an object")
        _require_exact_keys(
            previous_receipt,
            {"response", "jwks", "verification"},
            "previous_receipt",
        )
        verification = previous_receipt.get("verification")
        if not isinstance(verification, dict):
            raise ValueError("previous_receipt.verification must be an object")
        try:
            verify_popcorn_witness_evidence(
                previous_receipt["response"],
                previous_receipt["jwks"],
                _seen_attestations=seen_attestations,
                **verification,
            )
        except (TypeError, ValueError) as exc:
            raise ValueError(f"previous receipt verification failed: {exc}") from exc
        previous_compact = previous_receipt["response"]["witness_attestation"]["compact_jws"]
        if previous_digest["value"] != digest_witness_signed_payload(previous_compact):
            raise ValueError("previous signed payload digest does not match the claimed chain")
        previous_attestation_digest_matched = True
    elif previous_receipt is not None:
        raise ValueError("receipt does not contain a previous attestation commitment")

    return {
        "signature_verified": True,
        "key_id": kid,
        "witness_receipt": receipt,
        "payload_digest_verified": True,
        "nonce_verified": True,
        "previous_attestation_digest_matched": previous_attestation_digest_matched,
        "replay_key": f'{receipt["protocol_id"]}:{receipt["node_id"]}:{commitment["nonce"]}',
        "payment_replay_key": f'x402:{receipt["payment_identifier"]}',
        "witness_window_utc": {"earliest": earliest, "latest": latest},
    }
