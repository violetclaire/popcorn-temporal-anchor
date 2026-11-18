"""Core fingerprinting and chaining for the POPCORN witness for LeRobot.

Design rules (from the build brief, Violet's boundaries):
- Only fingerprints travel. Episode bytes never leave the machine except
  when the operator explicitly requests a paid witness receipt, and even
  then only the digest is sent, never the payload.
- The chain uses the POPCORN protocol's own field,
  previous_attestation_digest: SHA-256 over the exact signed payload
  bytes of the predecessor receipt (the base64url-decoded second segment
  of its compact JWS). For local dry-run records, the same rule is
  applied to the predecessor record's canonical bytes, so a dry-run
  chain upgrades to a witnessed chain without changing shape.
- A record proves a fingerprint was assembled at a place and chained in
  an order. It does not grade the teaching, the robot, or the operator.
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import re
import secrets as _secrets
from pathlib import Path

EPISODE_RE = re.compile(r"episode_(\d+)\.")
RECEIPTS_DIR = "receipts"
RECORD_VERSION = "popcorn-lerobot/0.1"


def b64url(data: bytes) -> str:
    """Unpadded base64url, the encoding POPCORN uses for digests/nonces."""
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def b64url_decode(text: str) -> bytes:
    pad = "=" * (-len(text) % 4)
    return base64.urlsafe_b64decode(text + pad)


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def file_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def dataset_format(dataset: Path) -> str:
    """The LeRobot layout of a dataset, from meta/info.json.

    Returns "v3.0" when info.json carries codebase_version "v3.0"
    (the layout LeRobot v0.7.0 writes) and "v2.1" otherwise: a
    missing, unreadable, or older info.json means the per-episode
    file layout this package originally shipped with.
    """
    try:
        info = json.loads((dataset / "meta" / "info.json").read_bytes())
    except Exception:
        return "v2.1"
    if isinstance(info, dict) and info.get("codebase_version") == "v3.0":
        return "v3.0"
    return "v2.1"


def episode_files(dataset: Path) -> dict[int, list[Path]]:
    """Map episode index -> sorted list of that episode's files.

    LeRobot layout: data/chunk-*/episode_000000.parquet and
    videos/chunk-*/<camera>/episode_000000.mp4. Any file in the dataset
    tree whose name carries an episode index belongs to that episode.
    The receipts directory is excluded.
    """
    found: dict[int, list[Path]] = {}
    for path in sorted(dataset.rglob("*")):
        if not path.is_file():
            continue
        rel = path.relative_to(dataset)
        if rel.parts and rel.parts[0] == RECEIPTS_DIR:
            continue
        m = EPISODE_RE.search(path.name)
        if m:
            found.setdefault(int(m.group(1)), []).append(path)
    for files in found.values():
        files.sort(key=lambda p: str(p.relative_to(dataset)))
    return found


def episode_manifest_bytes(dataset: Path, files: list[Path]) -> bytes:
    """Deterministic bytes standing for one episode: one line per file,
    'relative/path sha256hex size', sorted by relative path, LF endings.
    These bytes are what the payload digest commits to; a verifier
    rebuilds them from the dataset alone."""
    lines = []
    for path in files:
        rel = str(path.relative_to(dataset))
        lines.append(f"{rel} {file_sha256(path)} {path.stat().st_size}")
    return ("\n".join(lines) + "\n").encode("utf-8")


def canonical_json(obj) -> bytes:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"),
                      ensure_ascii=False).encode("utf-8")


def new_nonce() -> str:
    return b64url(_secrets.token_bytes(32))


def record_episode(dataset: Path, index: int, files: list[Path],
                   previous_digest: str | None) -> dict:
    manifest = episode_manifest_bytes(dataset, files)
    record = {
        "record_version": RECORD_VERSION,
        "episode_index": index,
        "files": [str(p.relative_to(dataset)) for p in files],
        "payload_digest": {"algorithm": "sha-256",
                           "value": b64url(hashlib.sha256(manifest).digest())},
        "nonce": new_nonce(),
        "previous_attestation_digest": previous_digest,
        "witness_receipt": None,
    }
    return record


def record_predecessor_digest(record: dict) -> str:
    """The digest the NEXT record must name as its predecessor.
    If a paid witness receipt (compact JWS) is attached, the protocol
    rule applies: SHA-256 over the base64url-decoded second segment.
    Otherwise, SHA-256 over this record's canonical bytes."""
    wr = record.get("witness_receipt")
    if wr and isinstance(wr, dict) and wr.get("compact_jws"):
        segments = wr["compact_jws"].split(".")
        if len(segments) == 3:
            return b64url(hashlib.sha256(b64url_decode(segments[1])).digest())
    return b64url(hashlib.sha256(canonical_json(record)).digest())


def write_record(dataset: Path, record: dict) -> Path:
    out_dir = dataset / RECEIPTS_DIR
    out_dir.mkdir(exist_ok=True)
    path = out_dir / f"episode_{record['episode_index']:06d}.receipt.json"
    path.write_bytes(canonical_json(record) + b"\n")
    return path


def record_dataset(dataset: Path) -> list[dict]:
    """Dry-run recording of every episode in order. Sends nothing,
    spends nothing."""
    if dataset_format(dataset) == "v3.0":
        from .v3 import record_dataset_v3
        return record_dataset_v3(dataset)
    episodes = episode_files(dataset)
    records = []
    previous = None
    for index in sorted(episodes):
        record = record_episode(dataset, index, episodes[index], previous)
        write_record(dataset, record)
        records.append(record)
        previous = record_predecessor_digest(record)
    return records


def load_records(dataset: Path) -> list[dict]:
    out_dir = dataset / RECEIPTS_DIR
    records = []
    if not out_dir.is_dir():
        return records
    for path in sorted(out_dir.glob("episode_*.receipt.json")):
        records.append(json.loads(path.read_bytes()))
    records.sort(key=lambda r: r["episode_index"])
    return records
