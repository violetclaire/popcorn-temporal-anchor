"""Acceptance tests for the POPCORN witness for LeRobot.
Mirrors the brief's acceptance list. Prints PASS/FAIL per test and
exits nonzero if anything fails."""
import json
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from popcorn_lerobot.core import record_dataset, load_records
from popcorn_lerobot.verify import verify_dataset, verify_jws_es256
from popcorn_lerobot.witness import fetch_challenge

ROOT = Path(__file__).resolve().parent.parent
WORK = ROOT / "tests" / "workdir"
results = []


def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))
    print(("PASS " if cond else "FAIL ") + name + (f" :: {detail}" if detail else ""))


def make_dataset(base: Path):
    if base.exists():
        shutil.rmtree(base)
    for i in range(3):
        d = base / "data" / "chunk-000"
        v = base / "videos" / "chunk-000" / "observation.images.top"
        d.mkdir(parents=True, exist_ok=True)
        v.mkdir(parents=True, exist_ok=True)
        (d / f"episode_{i:06d}.parquet").write_bytes(f"PARQUET-EPISODE-{i}-".encode() * 64)
        (v / f"episode_{i:06d}.mp4").write_bytes(f"VIDEO-EPISODE-{i}-".encode() * 64)
    (base / "meta").mkdir(exist_ok=True)
    (base / "meta" / "info.json").write_text('{"total_episodes": 3}')


# 1. clean dataset verifies
ds = WORK / "clean"
make_dataset(ds)
records = record_dataset(ds)
check("record writes 3 receipts", len(records) == 3)
check("first record starts a chain", records[0]["previous_attestation_digest"] is None)
check("chain links set", all(r["previous_attestation_digest"] for r in records[1:]))
problems = verify_dataset(ds)
check("clean dataset verifies", problems == [], str(problems))

# 2. one flipped byte names its episode
ds = WORK / "tampered"
make_dataset(ds)
record_dataset(ds)
victim = ds / "videos" / "chunk-000" / "observation.images.top" / "episode_000001.mp4"
data = bytearray(victim.read_bytes())
data[10] ^= 0xFF
victim.write_bytes(bytes(data))
problems = verify_dataset(ds)
check("tampered byte detected", any("episode 1" in p and "changed" in p for p in problems),
      str(problems))

# 3. deleted middle episode is caught
ds = WORK / "deleted"
make_dataset(ds)
record_dataset(ds)
(ds / "data" / "chunk-000" / "episode_000001.parquet").unlink()
(ds / "videos" / "chunk-000" / "observation.images.top" / "episode_000001.mp4").unlink()
problems = verify_dataset(ds)
check("deleted episode detected", any("episode 1" in p for p in problems), str(problems))

# 4. edited predecessor breaks the chain at that episode
ds = WORK / "chainedit"
make_dataset(ds)
record_dataset(ds)
rec_path = ds / "receipts" / "episode_000002.receipt.json"
rec = json.loads(rec_path.read_bytes())
rec["previous_attestation_digest"] = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
rec_path.write_text(json.dumps(rec, sort_keys=True, separators=(",", ":")) + "\n")
problems = verify_dataset(ds)
check("chain edit detected", any("episode 2" in p and "chain broken" in p for p in problems),
      str(problems))

# 5. the real production receipt verifies against the published keys
evidence = json.loads((ROOT / "fixtures" / "evidence.production.json").read_bytes())
jwks = json.loads((ROOT / "fixtures" / "jwks.json").read_bytes())
jws = evidence["witness_attestation"]["compact_jws"]
ok, payload, reason = verify_jws_es256(jws, jwks)
check("production receipt signature verifies", ok, reason)
if ok:
    commitment = payload.get("commitment", {})
    want = evidence["witness_receipt"]["commitment"]
    check("signed commitment matches the production record",
          commitment.get("payload_digest", {}).get("value") == want["payload_digest"]["value"]
          and commitment.get("nonce") == want["nonce"]
          and commitment.get("previous_attestation_digest") == want["previous_attestation_digest"])
    # tamper: change one character of the signature segment
    head, body, sig = jws.split(".")
    bad = ".".join([head, body, ("A" if sig[0] != "A" else "B") + sig[1:]])
    ok2, _, _ = verify_jws_es256(bad, jwks)
    check("forged signature rejected", not ok2)

# 6. the live node answers our request shape with its 402 challenge
ds = WORK / "clean"
records = load_records(ds)
challenge = fetch_challenge(records[0])
body = challenge.get("body", "")
check("live node returns 402 challenge", challenge.get("status") == 402,
      f"status={challenge.get('status')}")
check("challenge names the price", "1000" in body or "0.001" in body,
      body[:200].replace("\n", " "))

print()
failed = [r for r in results if not r[1]]
print(f"{len(results) - len(failed)}/{len(results)} passed")
sys.exit(1 if failed else 0)
