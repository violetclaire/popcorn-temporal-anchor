"""Offline verification for POPCORN witness records in a LeRobot dataset.

Checks, in order:
1. Every recorded episode still exists and its rebuilt manifest digest
   matches the record's payload_digest. A changed byte names its episode.
2. The chain: each record's previous_attestation_digest matches the
   predecessor digest computed from the record before it; the first
   record in the set must start a chain (null) or continue a stated one.
3. For records carrying a paid witness receipt (compact JWS): the ES256
   signature verifies against the published POPCORN keys, and the signed
   payload's commitment matches this record's payload_digest, nonce, and
   previous_attestation_digest.

Verification depends on accepting the witness node's published key and
its clock. It establishes that bytes were presented in an interval and
not altered afterward. It does not establish that the teaching was
good, the robot was safe, or the uploader is anyone in particular.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from .core import (b64url, b64url_decode, episode_files,
                   episode_manifest_bytes, load_records,
                   record_predecessor_digest)


def verify_jws_es256(jws: str, jwks: dict) -> tuple[bool, dict | None, str]:
    """Verify a compact JWS (ES256) against a JWKS document.
    Returns (ok, payload_json_or_None, reason)."""
    try:
        from cryptography.hazmat.primitives.asymmetric.ec import (
            EllipticCurvePublicNumbers, SECP256R1)
        from cryptography.hazmat.primitives.hashes import SHA256
        from cryptography.hazmat.primitives.asymmetric import ec
        from cryptography.exceptions import InvalidSignature
    except ImportError:
        return False, None, "the 'cryptography' package is required for signature checks"

    parts = jws.split(".")
    if len(parts) != 3:
        return False, None, "not a compact JWS"
    try:
        header = json.loads(b64url_decode(parts[0]))
        payload_bytes = b64url_decode(parts[1])
        signature = b64url_decode(parts[2])
        payload = json.loads(payload_bytes)
    except Exception as exc:  # malformed receipt bytes
        return False, None, f"malformed JWS: {exc}"
    if header.get("alg") != "ES256":
        return False, None, f"unexpected alg {header.get('alg')!r}"
    kid = header.get("kid")
    key = next((k for k in jwks.get("keys", []) if k.get("kid") == kid), None)
    if key is None:
        return False, None, f"no published key with kid {kid!r}"
    x = int.from_bytes(b64url_decode(key["x"]), "big")
    y = int.from_bytes(b64url_decode(key["y"]), "big")
    pub = EllipticCurvePublicNumbers(x, y, SECP256R1()).public_key()
    if len(signature) != 64:
        return False, None, "ES256 signature must be 64 bytes (r||s)"
    from cryptography.hazmat.primitives.asymmetric.utils import (
        encode_dss_signature)
    r = int.from_bytes(signature[:32], "big")
    s = int.from_bytes(signature[32:], "big")
    der = encode_dss_signature(r, s)
    signing_input = f"{parts[0]}.{parts[1]}".encode("ascii")
    try:
        pub.verify(der, signing_input, ec.ECDSA(SHA256()))
    except InvalidSignature:
        return False, None, "signature does not verify"
    return True, payload, "ok"


def verify_dataset(dataset: Path, jwks: dict | None = None) -> list[str]:
    """Return a list of problems; empty means the dataset verifies."""
    problems: list[str] = []
    records = load_records(dataset)
    if not records:
        return ["no receipts found in this dataset"]
    episodes = episode_files(dataset)
    previous_record = None
    for record in records:
        idx = record["episode_index"]
        files = episodes.get(idx)
        if files is None:
            problems.append(f"episode {idx}: recorded but missing from dataset")
            continue
        manifest = episode_manifest_bytes(dataset, files)
        digest = b64url(hashlib.sha256(manifest).digest())
        if digest != record["payload_digest"]["value"]:
            problems.append(
                f"episode {idx}: bytes changed after recording "
                f"(digest {digest} != recorded {record['payload_digest']['value']})")
        expected_files = record["files"]
        actual_files = [str(p.relative_to(dataset)) for p in files]
        if actual_files != expected_files:
            problems.append(f"episode {idx}: file set changed "
                            f"(recorded {expected_files}, present {actual_files})")
        if previous_record is None:
            if record["previous_attestation_digest"] is not None:
                problems.append(
                    f"episode {idx}: first record does not start a chain "
                    "(previous_attestation_digest is not null)")
        else:
            want = record_predecessor_digest(previous_record)
            if record["previous_attestation_digest"] != want:
                problems.append(
                    f"episode {idx}: chain broken "
                    f"(names predecessor {record['previous_attestation_digest']}, "
                    f"computed {want})")
        wr = record.get("witness_receipt")
        if wr and isinstance(wr, dict) and wr.get("compact_jws"):
            if jwks is None:
                problems.append(
                    f"episode {idx}: carries a witness receipt but no JWKS "
                    "was supplied to check its signature")
            else:
                ok, payload, reason = verify_jws_es256(wr["compact_jws"], jwks)
                if not ok:
                    problems.append(f"episode {idx}: witness receipt failed: {reason}")
                else:
                    commitment = (payload or {}).get("commitment", {})
                    pd = commitment.get("payload_digest", {})
                    if pd.get("value") != record["payload_digest"]["value"]:
                        problems.append(
                            f"episode {idx}: witnessed digest does not match record")
                    if commitment.get("nonce") != record["nonce"]:
                        problems.append(
                            f"episode {idx}: witnessed nonce does not match record")
                    if commitment.get("previous_attestation_digest") != \
                            record["previous_attestation_digest"]:
                        problems.append(
                            f"episode {idx}: witnessed predecessor does not match record")
        previous_record = record
    recorded = {r["episode_index"] for r in records}
    for idx in sorted(episodes):
        if idx not in recorded:
            problems.append(f"episode {idx}: present in dataset but has no receipt")
    return problems
