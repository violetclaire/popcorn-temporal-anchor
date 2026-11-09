"""Command line: record and verify a LeRobot dataset's witness receipts.

Usage:
  python -m popcorn_lerobot record <dataset>
  python -m popcorn_lerobot verify <dataset> [--jwks <path-or-url>]

Recording is dry-run by default and always: it fingerprints episodes
and chains the records locally. It sends nothing and spends nothing.
Paid witness receipts are requested only through the witness module by
an operator who has satisfied the execution gate; see witness.py.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.request
from pathlib import Path

from .core import record_dataset
from .verify import verify_dataset


def load_jwks(source: str) -> dict:
    if source.startswith("http://") or source.startswith("https://"):
        with urllib.request.urlopen(source, timeout=30) as resp:
            return json.loads(resp.read())
    return json.loads(Path(source).read_bytes())


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="popcorn_lerobot")
    sub = parser.add_subparsers(dest="command", required=True)
    p_record = sub.add_parser("record", help="fingerprint and chain every episode (dry run)")
    p_record.add_argument("dataset")
    p_verify = sub.add_parser("verify", help="check a dataset against its receipts")
    p_verify.add_argument("dataset")
    p_verify.add_argument("--jwks", default=None,
                          help="JWKS file path or URL for witness signature checks")
    args = parser.parse_args(argv)

    dataset = Path(args.dataset)
    if not dataset.is_dir():
        print(f"not a directory: {dataset}")
        return 2
    if args.command == "record":
        records = record_dataset(dataset)
        print(f"recorded {len(records)} episode(s); nothing sent, nothing spent")
        return 0
    jwks = load_jwks(args.jwks) if args.jwks else None
    problems = verify_dataset(dataset, jwks)
    if problems:
        for problem in problems:
            print(f"FAIL {problem}")
        return 1
    print("OK: every episode matches its receipt and the chain is unbroken")
    return 0


if __name__ == "__main__":
    sys.exit(main())
