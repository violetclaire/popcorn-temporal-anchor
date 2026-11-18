"""Acceptance tests for LeRobot v3.0 support in the POPCORN witness.

Run with the build venv (pyarrow lives there):

    .venv/bin/python tests/run_acceptance_v3.py

Builds small synthetic v3.0 datasets under tests/workdir-v3/ (three
hand-made episodes, one camera, dummy video bytes; the package hashes
video bytes and never decodes them) and checks:

- the shipped v2.1 clean fixture re-records byte-for-byte identical
  payload_digests for episodes 0 and 1;
- a clean v3.0 dataset records and verifies clean;
- a one-byte change inside episode 1's data rows fails naming
  episode 1 (a raw byte flip in the PLAIN-encoded parquet; if no raw
  flip validates on readback, one value is changed and the file
  rewritten, and the run says so);
- a deleted middle episode fails naming episode 1 while episodes 0
  and 2 still pass (the rewrite removes its rows and its meta row
  and updates the surviving meta ranges; content untouched);
- episodes 0 and 2 with their row blocks swapped fail by name while
  episode 1 still passes;
- a hand-broken chain link fails by name.

Prints PASS/FAIL per check and exits nonzero if anything fails.
"""
import json
import shutil
import struct
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pyarrow as pa
import pyarrow.parquet as pq

from popcorn_lerobot.core import record_dataset, load_records
from popcorn_lerobot.verify import verify_dataset

ROOT = Path(__file__).resolve().parent.parent
WORK3 = ROOT / "tests" / "workdir-v3"
CAM = "observation.images.top"
FPS = 30
LENGTHS = {0: 3, 1: 4, 2: 3}
TASKS = {0: ["pick up the cup"], 1: ["open the drawer"], 2: ["wave"]}
# canonical (clean-layout) start row of each episode
STARTS = {}
_pos = 0
for _e in sorted(LENGTHS):
    STARTS[_e] = _pos
    _pos += LENGTHS[_e]

DATA_SCHEMA = pa.schema([
    ("index", pa.int64()),
    ("episode_index", pa.int64()),
    ("frame_index", pa.int64()),
    ("timestamp", pa.float32()),
    ("task_index", pa.int64()),
    ("action", pa.list_(pa.float32())),
    ("observation.state", pa.list_(pa.float32())),
])

META_SCHEMA = pa.schema([
    ("episode_index", pa.int64()),
    ("tasks", pa.list_(pa.string())),
    ("length", pa.int64()),
    ("dataset_from_index", pa.int64()),
    ("dataset_to_index", pa.int64()),
    ("data/chunk_index", pa.int64()),
    ("data/file_index", pa.int64()),
    (f"videos/{CAM}/chunk_index", pa.int64()),
    (f"videos/{CAM}/file_index", pa.int64()),
    (f"videos/{CAM}/from_timestamp", pa.float64()),
    (f"videos/{CAM}/to_timestamp", pa.float64()),
])

results = []


def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))
    print(("PASS " if cond else "FAIL ") + name + (f" :: {detail}" if detail else ""))


def episode_rows(e):
    """The canonical rows of one episode. Identical wherever the
    episode is written: its content never depends on its position."""
    rows = []
    for f in range(LENGTHS[e]):
        rows.append({
            "index": STARTS[e] + f,
            "episode_index": e,
            "frame_index": f,
            "timestamp": f / FPS,
            "task_index": 0,
            "action": [(e + 1) * 7.7 + f * 1.3, -((e + 1) * 3.3 + f * 0.7)],
            "observation.state": [e * 1.1 + f * 0.3, e * 2.2 + f * 0.6,
                                  9.9 - f * 0.9],
        })
    return rows


def video_span(e):
    """(from, to) timestamps of episode e in the shared video file,
    from the canonical layout. A data rewrite does not move them:
    the video file itself is not rewritten."""
    start_frame = STARTS[e]
    return start_frame / FPS, (start_frame + LENGTHS[e]) / FPS


def write_data_file(base: Path, data_order):
    rows = []
    for e in data_order:
        rows.extend(episode_rows(e))
    table = pa.table(
        {name: [r[name] for r in rows] for name in DATA_SCHEMA.names},
        schema=DATA_SCHEMA)
    out = base / "data" / "chunk-000" / "file-000.parquet"
    out.parent.mkdir(parents=True, exist_ok=True)
    # PLAIN encoding, no compression: the values sit in the file as
    # themselves, so the tamper check can flip exactly one stored
    # byte. (The witness reads decoded values only; the encoding is
    # a fixture convenience, not part of the format contract.)
    pq.write_table(table, out, compression=None, use_dictionary=False)
    return out


def write_meta_files(base: Path, present):
    # ranges follow the layout of the present episodes, in canonical
    # order: exactly what a real rewrite produces after a deletion.
    rows = []
    pos = 0
    ranges = {}
    for e in sorted(present):
        ranges[e] = (pos, pos + LENGTHS[e])
        pos += LENGTHS[e]
    for e in sorted(present):
        frm, to = video_span(e)
        rows.append({
            "episode_index": e,
            "tasks": TASKS[e],
            "length": LENGTHS[e],
            "dataset_from_index": ranges[e][0],
            "dataset_to_index": ranges[e][1],
            "data/chunk_index": 0,
            "data/file_index": 0,
            f"videos/{CAM}/chunk_index": 0,
            f"videos/{CAM}/file_index": 0,
            f"videos/{CAM}/from_timestamp": frm,
            f"videos/{CAM}/to_timestamp": to,
        })
    table = pa.table(
        {name: [r[name] for r in rows] for name in META_SCHEMA.names},
        schema=META_SCHEMA)
    out = base / "meta" / "episodes" / "chunk-000" / "file-000.parquet"
    out.parent.mkdir(parents=True, exist_ok=True)
    pq.write_table(table, out)
    info = {
        "codebase_version": "v3.0",
        "robot_type": "synthetic-test",
        "total_episodes": len(present),
        "total_frames": sum(LENGTHS[e] for e in present),
        "total_tasks": len(present),
        "fps": FPS,
        "chunks_size": 1000,
        "data_path": "data/chunk-{chunk_index:03d}/file-{file_index:03d}.parquet",
        "video_path": "videos/{video_key}/chunk-{chunk_index:03d}/file-{file_index:03d}.mp4",
        "features": {
            "action": {"dtype": "float32", "shape": [2]},
            CAM: {"dtype": "video", "shape": [8, 8, 3]},
        },
    }
    (base / "meta" / "info.json").write_text(json.dumps(info, indent=2) + "\n")


def build_dataset(base: Path, present=(0, 1, 2)):
    if base.exists():
        shutil.rmtree(base)
    base.mkdir(parents=True)
    write_data_file(base, [e for e in (0, 1, 2) if e in present])
    write_meta_files(base, present)
    video = base / "videos" / CAM / "chunk-000" / "file-000.mp4"
    video.parent.mkdir(parents=True, exist_ok=True)
    video.write_bytes(b"SYNTHETIC-SHARED-VIDEO-" * 256)


# ---------------------------------------------------------------- (b)
# The shipped v2.1 clean fixture still re-records byte for byte.
src = ROOT / "tests" / "workdir" / "clean"
scratch = WORK3 / "v21-copy"
if scratch.exists():
    shutil.rmtree(scratch)
shutil.copytree(src, scratch)
stored = {}
for i in (0, 1):
    rec = json.loads((scratch / "receipts" / f"episode_{i:06d}.receipt.json")
                     .read_bytes())
    stored[i] = rec["payload_digest"]["value"]
shutil.rmtree(scratch / "receipts")
recs = record_dataset(scratch)
for i in (0, 1):
    got = recs[i]["payload_digest"]["value"]
    check(f"v2.1 fixture episode {i} payload_digest reproduces byte for byte",
          got == stored[i], f"{got} vs stored {stored[i]}")
shutil.rmtree(scratch)

# ---------------------------------------------------------------- clean
ds = WORK3 / "clean"
build_dataset(ds)
records = record_dataset(ds)
check("v3 record writes 3 receipts", len(records) == 3)
check("v3 first record starts a chain",
      records[0]["previous_attestation_digest"] is None)
check("v3 chain links set",
      all(r["previous_attestation_digest"] for r in records[1:]))
check("v3 records state their format and commitment",
      all(r.get("dataset_format") == "lerobot-v3.0"
          and r.get("digest_commits_to") for r in records))
problems = verify_dataset(ds)
check("v3 clean dataset verifies", problems == [], str(problems))

# ---------------------------------------------------------------- tampered
ds = WORK3 / "tampered"
build_dataset(ds)
record_dataset(ds)
data_file = ds / "data" / "chunk-000" / "file-000.parquet"
original_rows = pq.read_table(data_file).to_pylist()
raw = data_file.read_bytes()
needle = struct.pack("<f", 2 * 7.7 + 1 * 1.3)  # episode 1, frame 1, action[0] = 16.7
flip_offset = None
start = 0
while True:
    at = raw.find(needle, start)
    if at < 0:
        break
    candidate = bytearray(raw)
    candidate[at] ^= 0x01
    tmp = WORK3 / "flip-probe.parquet"
    tmp.write_bytes(bytes(candidate))
    try:
        probed = pq.read_table(tmp).to_pylist()
    except Exception:
        start = at + 1
        continue
    diffs = [(r, c) for r, (a, b) in enumerate(zip(original_rows, probed))
             if a != b for c in a if a[c] != b[c]]
    if len(diffs) == 1 and original_rows[diffs[0][0]]["episode_index"] == 1:
        flip_offset = at
        data_file.write_bytes(bytes(candidate))
        break
    start = at + 1
if (WORK3 / "flip-probe.parquet").exists():
    (WORK3 / "flip-probe.parquet").unlink()
if flip_offset is None:
    # fallback: change one value in episode 1 and rewrite the file
    table = pq.read_table(data_file)
    cols = {name: table.column(name).to_pylist() for name in table.schema.names}
    row = STARTS[1] + 1
    cols["action"][row] = [16.8, cols["action"][row][1]]
    pq.write_table(pa.table(cols, schema=DATA_SCHEMA), data_file,
                   compression=None, use_dictionary=False)
    print("NOTE tamper method: VALUE-REWRITE (no raw byte flip validated)")
else:
    print(f"NOTE tamper method: RAW BYTE FLIP at file offset {flip_offset}")
problems = verify_dataset(ds)
check("v3 tampered byte detected, naming episode 1",
      any("episode 1" in p and "changed" in p for p in problems), str(problems))
check("v3 tamper names no other episode",
      not any(("episode 0" in p or "episode 2" in p) for p in problems),
      str(problems))

# ---------------------------------------------------------------- deleted
ds = WORK3 / "deleted"
build_dataset(ds)
record_dataset(ds)
# the real-rewrite deletion: episode 1's rows and meta row removed,
# surviving ranges updated to their new positions, content untouched,
# receipts and the shared video file left exactly as recorded.
write_data_file(ds, [0, 2])
write_meta_files(ds, present=(0, 2))
problems = verify_dataset(ds)
check("v3 deleted episode detected, naming episode 1",
      any("episode 1" in p and "missing" in p for p in problems), str(problems))
check("v3 deleted: episodes 0 and 2 still pass",
      not any(("episode 0" in p or "episode 2" in p) for p in problems),
      str(problems))

# ---------------------------------------------------------------- reordered
ds = WORK3 / "reordered"
build_dataset(ds)
record_dataset(ds)
write_data_file(ds, [2, 1, 0])  # row blocks of episodes 0 and 2 swapped
problems = verify_dataset(ds)
check("v3 reorder names episode 0",
      any("episode 0" in p and "changed" in p for p in problems), str(problems))
check("v3 reorder names episode 2",
      any("episode 2" in p and "changed" in p for p in problems), str(problems))
check("v3 reorder: episode 1 still passes",
      not any("episode 1" in p for p in problems), str(problems))

# ---------------------------------------------------------------- chain edit
ds = WORK3 / "chainedit"
build_dataset(ds)
record_dataset(ds)
rec_path = ds / "receipts" / "episode_000002.receipt.json"
rec = json.loads(rec_path.read_bytes())
rec["previous_attestation_digest"] = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
rec_path.write_text(json.dumps(rec, sort_keys=True, separators=(",", ":")) + "\n")
problems = verify_dataset(ds)
check("v3 chain edit detected, naming episode 2",
      any("episode 2" in p and "chain broken" in p for p in problems),
      str(problems))

print()
failed = [r for r in results if not r[1]]
print(f"{len(results) - len(failed)}/{len(results)} passed")
sys.exit(1 if failed else 0)
