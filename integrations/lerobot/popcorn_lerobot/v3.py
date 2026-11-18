"""LeRobot v3.0 dataset support for the POPCORN witness.

LeRobot v0.7.0 writes the v3.0 layout (meta/info.json carries
codebase_version "v3.0"). There are no per-episode files:

- data/chunk-XXX/file-YYY.parquet holds many episodes concatenated;
  one episode's rows are the slice [dataset_from_index,
  dataset_to_index) of its data file.
- meta/episodes/chunk-XXX/file-YYY.parquet holds one row per episode:
  episode_index, dataset_from_index, dataset_to_index,
  data/chunk_index, data/file_index, length, tasks, and per camera
  videos/<camera>/chunk_index, file_index, from_timestamp,
  to_timestamp.
- videos/<camera>/chunk-XXX/file-YYY.mp4 is shared across episodes.

The fingerprint commits to the episode's own content, never to its
position. The manifest lines (the same style as the v2.1 design) name:

- the canonical serialization "popcorn-canonical-rows/1" of the
  episode's data rows: a SHA-256 of bytes built only from the decoded
  values and the logical schema (see serialize_rows). The row range
  is used to FIND the rows; the range itself, the chunk/file indices,
  and all parquet file metadata are NOT committed. A dataset rewritten
  without a middle episode therefore still verifies for the surviving
  episodes, as long as their rows, identity fields, and video
  references are untouched.
- per camera: the SHA-256 and size of the whole shared video file,
  plus this episode's from/to timestamps inside it. (Consequence of
  the format: ANY change to a shared video file changes the
  fingerprint of every episode that references that file. The witness
  hashes the file; it never decodes it.)
- the identity fields from the episode's meta row: episode_index,
  length, tasks.

Records carry the same fields and chain by the same
previous_attestation_digest rule as the v2.1 records, plus two
descriptive fields (dataset_format and digest_commits_to) stating
what the digest commits to. Recording is a dry run: nothing is sent,
nothing is spent. pyarrow is imported lazily, inside these functions
only, so the v2.1 path keeps working under a plain python3 with no
pyarrow installed.
"""

from __future__ import annotations

import hashlib
import struct
from pathlib import Path

from .core import (RECORD_VERSION, b64url, canonical_json, file_sha256,
                   load_records, new_nonce, record_predecessor_digest,
                   sha256_hex, write_record)

SERIALIZATION_VERSION = "popcorn-canonical-rows/1"

DIGEST_COMMITS_TO = (
    "sha-256 over manifest lines naming: the canonical serialization "
    "popcorn-canonical-rows/1 of this episode's data rows (the "
    "[dataset_from_index, dataset_to_index) slice of its data file, "
    "all columns, stored order, values only); per camera, the "
    "sha-256 and size of the shared video file with this episode's "
    "from/to timestamps; and the episode_index, length and tasks "
    "from its meta/episodes row. Row positions and parquet file "
    "metadata are not committed."
)


def _pa():
    import pyarrow as pa
    return pa


def _pq():
    import pyarrow.parquet as pq
    return pq


# ---------------------------------------------------------------- meta

def episode_meta(dataset: Path) -> dict[int, dict]:
    """episode_index -> its meta/episodes row (plain Python values),
    with the row's source file attached as "_meta_file"."""
    pq = _pq()
    rows: dict[int, dict] = {}
    meta_dir = dataset / "meta" / "episodes"
    for path in sorted(meta_dir.rglob("*.parquet")):
        table = pq.read_table(path)
        for row in table.to_pylist():
            row = dict(row)
            row["_meta_file"] = str(path.relative_to(dataset))
            rows[int(row["episode_index"])] = row
    return rows


def _cameras(meta_row: dict) -> list[str]:
    cams = []
    for key in meta_row:
        if key.startswith("videos/") and key.endswith("/chunk_index"):
            cams.append(key[len("videos/"):-len("/chunk_index")])
    return sorted(cams)


def _data_rel(meta_row: dict) -> str:
    return (f"data/chunk-{int(meta_row['data/chunk_index']):03d}/"
            f"file-{int(meta_row['data/file_index']):03d}.parquet")


def _video_rel(meta_row: dict, camera: str) -> str:
    return (f"videos/{camera}/chunk-{int(meta_row[f'videos/{camera}/chunk_index']):03d}/"
            f"file-{int(meta_row[f'videos/{camera}/file_index']):03d}.mp4")


# ------------------------------------------------- canonical row bytes

def _encode_cell(value, pa_type) -> bytes:
    """One framed cell: 0x00 for null, else 0x01 + 8-byte big-endian
    body length + body. Bodies depend only on the decoded value and
    the logical type:

    bool: one byte 0x00/0x01. Integers: ASCII decimal. Floats: the
    IEEE 754 big-endian bytes at the type's own width. Timestamps and
    dates: ASCII decimal of the int64 count in the type's own unit
    (the unit is named in the header's type string; the column is
    cast to int64 before values are read). Strings: UTF-8. Binary:
    raw bytes. Decimals: ASCII str. Lists: 8-byte element count, then
    each element as a framed cell. Structs: each field as a framed
    cell, in schema order. Dictionary arrays are decoded to their
    value type before any of this (see serialize_rows).
    """
    pa = _pa()
    if value is None:
        return b"\x00"
    t = pa_type
    if pa.types.is_boolean(t):
        body = b"\x01" if value else b"\x00"
    elif pa.types.is_signed_integer(t) or pa.types.is_unsigned_integer(t):
        body = str(int(value)).encode("ascii")
    elif pa.types.is_timestamp(t) or pa.types.is_date(t):
        body = str(int(value)).encode("ascii")
    elif pa.types.is_float16(t):
        body = struct.pack(">e", value)
    elif pa.types.is_float32(t):
        body = struct.pack(">f", value)
    elif pa.types.is_float64(t):
        body = struct.pack(">d", value)
    elif pa.types.is_string(t) or pa.types.is_large_string(t):
        body = value.encode("utf-8")
    elif (pa.types.is_binary(t) or pa.types.is_large_binary(t)
          or pa.types.is_fixed_size_binary(t)):
        body = bytes(value)
    elif (pa.types.is_list(t) or pa.types.is_large_list(t)
          or pa.types.is_fixed_size_list(t)):
        body = len(value).to_bytes(8, "big") + b"".join(
            _encode_cell(item, t.value_type) for item in value)
    elif pa.types.is_struct(t):
        body = b"".join(_encode_cell(value[field.name], field.type)
                        for field in t)
    elif pa.types.is_decimal(t):
        body = str(value).encode("ascii")
    else:
        raise ValueError(
            f"unsupported column type for canonical serialization: {t}")
    return b"\x01" + len(body).to_bytes(8, "big") + body


def serialize_rows(table) -> bytes:
    """Canonical bytes for a pyarrow Table slice: the
    popcorn-canonical-rows/1 serialization.

    Layout: the magic line, the column count, one canonical-JSON line
    per column naming [field name, logical type string], the row
    count, then every cell in row order (stored order), column order
    (schema order), framed as in _encode_cell. Length prefixes make
    the framing unambiguous. Nothing from the parquet file itself
    (footer, encodings, compression, row groups, statistics) enters:
    the same values in a differently written file serialize to the
    same bytes.
    """
    pa = _pa()
    out = bytearray()
    out += b"popcorn-canonical-rows/1\n"
    out += f"columns {table.num_columns}\n".encode("ascii")
    for field in table.schema:
        out += canonical_json([field.name, str(field.type)]) + b"\n"
    out += f"rows {table.num_rows}\n".encode("ascii")
    columns = []
    for i in range(table.num_columns):
        arr = table.column(i)
        t = arr.type
        if pa.types.is_dictionary(t):
            arr = arr.cast(t.value_type)
            t = t.value_type
        if pa.types.is_timestamp(t) or pa.types.is_date(t):
            values = arr.cast(pa.int64()).to_pylist()
        else:
            values = arr.to_pylist()
        columns.append((t, values))
    for r in range(table.num_rows):
        for t, values in columns:
            out += _encode_cell(values[r], t)
    return bytes(out)


def _read_episode_rows(dataset: Path, meta_row: dict):
    pq = _pq()
    table = pq.read_table(dataset / _data_rel(meta_row))
    start = int(meta_row["dataset_from_index"])
    end = int(meta_row["dataset_to_index"])
    if start < 0 or end < start or end > table.num_rows:
        raise ValueError(
            f"row range [{start}, {end}) outside data file "
            f"({table.num_rows} rows)")
    return table.slice(start, end - start)


# ------------------------------------------------------------ manifest

def episode_components(dataset: Path, meta_row: dict) -> tuple[bytes, list[str]]:
    """(manifest bytes, files read) standing for one v3.0 episode.
    The payload digest commits to these manifest bytes; a verifier
    rebuilds them from the dataset alone."""
    idx = int(meta_row["episode_index"])
    table = _read_episode_rows(dataset, meta_row)
    rows_digest = sha256_hex(serialize_rows(table))
    tasks = list(meta_row.get("tasks") or [])
    lines = [
        f"format lerobot-v3.0 {SERIALIZATION_VERSION}",
        f"episode_index {idx}",
        f"length {int(meta_row['length'])}",
        "tasks " + canonical_json(tasks).decode("utf-8"),
    ]
    data_rel = _data_rel(meta_row)
    lines.append(f"data {data_rel} {rows_digest} {table.num_rows}")
    files = [data_rel, meta_row["_meta_file"]]
    for cam in _cameras(meta_row):
        rel = _video_rel(meta_row, cam)
        path = dataset / rel
        frm = float(meta_row[f"videos/{cam}/from_timestamp"])
        to = float(meta_row[f"videos/{cam}/to_timestamp"])
        lines.append(
            f"video {cam} {rel} {file_sha256(path)} "
            f"{path.stat().st_size} {frm!r} {to!r}")
        files.append(rel)
    return ("\n".join(lines) + "\n").encode("utf-8"), sorted(files)


# ------------------------------------------------------------- records

def record_episode_v3(dataset: Path, meta_row: dict,
                      previous_digest: str | None) -> dict:
    manifest, files = episode_components(dataset, meta_row)
    return {
        "record_version": RECORD_VERSION,
        "dataset_format": "lerobot-v3.0",
        "episode_index": int(meta_row["episode_index"]),
        "files": files,
        "digest_commits_to": DIGEST_COMMITS_TO,
        "payload_digest": {"algorithm": "sha-256",
                           "value": b64url(hashlib.sha256(manifest).digest())},
        "nonce": new_nonce(),
        "previous_attestation_digest": previous_digest,
        "witness_receipt": None,
    }


def record_dataset_v3(dataset: Path) -> list[dict]:
    """Dry-run recording of every v3.0 episode in order. Sends
    nothing, spends nothing."""
    meta = episode_meta(dataset)
    records = []
    previous = None
    for idx in sorted(meta):
        record = record_episode_v3(dataset, meta[idx], previous)
        write_record(dataset, record)
        records.append(record)
        previous = record_predecessor_digest(record)
    return records


# -------------------------------------------------------------- verify

def verify_dataset_v3(dataset: Path, jwks: dict | None = None) -> list[str]:
    """The v3.0 counterpart of verify_dataset, with the same problem
    wordings. One deliberate difference from the v2.1 verifier: the
    chain is checked over the records themselves, so a record whose
    episode content is missing still advances previous_record and the
    NEXT episode is not falsely reported as chain-broken. (In the
    v2.1 verifier a missing episode also breaks the following link;
    that behavior is unchanged there by design rule.)"""
    from .verify import verify_jws_es256
    problems: list[str] = []
    records = load_records(dataset)
    if not records:
        return ["no receipts found in this dataset"]
    try:
        meta = episode_meta(dataset)
    except Exception as exc:  # metadata unreadable: fail loudly
        for record in records:
            problems.append(
                f"episode {record['episode_index']}: episode metadata "
                f"unreadable ({exc})")
        return problems
    previous_record = None
    for record in records:
        idx = record["episode_index"]
        row = meta.get(idx)
        if row is None:
            problems.append(f"episode {idx}: recorded but missing from dataset")
        else:
            try:
                manifest, files = episode_components(dataset, row)
            except Exception as exc:
                problems.append(f"episode {idx}: content unreadable ({exc})")
            else:
                digest = b64url(hashlib.sha256(manifest).digest())
                if digest != record["payload_digest"]["value"]:
                    problems.append(
                        f"episode {idx}: bytes changed after recording "
                        f"(digest {digest} != recorded "
                        f"{record['payload_digest']['value']})")
                if files != record["files"]:
                    problems.append(
                        f"episode {idx}: file set changed "
                        f"(recorded {record['files']}, present {files})")
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
                    problems.append(
                        f"episode {idx}: witness receipt failed: {reason}")
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
    for idx in sorted(meta):
        if idx not in recorded:
            problems.append(
                f"episode {idx}: present in dataset but has no receipt")
    return problems
