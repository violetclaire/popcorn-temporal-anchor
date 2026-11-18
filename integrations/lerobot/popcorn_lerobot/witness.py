"""The paid door: POPCORN-WITNESS/2.0 at POST https://767-2676.com/v2/receipt.

This module assembles the exact request the live node accepts and can
fetch the unpaid 402 challenge so an operator can see the price before
deciding. It deliberately contains NO payment execution. Paying is a
separate act governed by the owner's execution gate: the terms must
match the final bytes, an authenticated approval must cover the digest,
the time evidence must be fresh, the whole interval must sit inside the
approval window, and the approval must not be revoked or superseded.
A receipt is evidence, not permission.
"""

from __future__ import annotations

import json
import urllib.request
import urllib.error

WITNESS_URL = "https://767-2676.com/v2/receipt"


def witness_request(record: dict) -> dict:
    """The request body for one episode record, in the node's format."""
    return {
        "payload_digest": record["payload_digest"],
        "nonce": record["nonce"],
        "previous_attestation_digest": record["previous_attestation_digest"],
    }


def fetch_challenge(record: dict) -> dict:
    """POST the request without payment and return the 402 challenge
    details (price, asset, payTo) exactly as the node states them.
    Sends the digest and nonce only; spends nothing."""
    body = json.dumps(witness_request(record)).encode("utf-8")
    req = urllib.request.Request(
        WITNESS_URL, data=body, method="POST",
        headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return {"status": resp.status,
                    "body": resp.read().decode("utf-8", "replace")}
    except urllib.error.HTTPError as err:
        try:
            raw = err.read()
        except Exception as read_err:  # gateway may truncate the body
            raw = getattr(read_err, "partial", b"") or b""
        return {"status": err.code,
                "headers": dict(err.headers.items()),
                "body": raw.decode("utf-8", "replace")}
