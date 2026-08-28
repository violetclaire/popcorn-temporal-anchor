"""Network-free POPCORN/1.0 ES256 temporal evidence verification."""

from __future__ import annotations

import base64
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
    if not isinstance(expected, int) or expected < 0 or actual != expected:
        raise ValueError(f"{label} signed relationship is invalid")


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
