# Discovery pilot results — 2026-09-07

Outcome: all three fresh-context participants independently inspected and ran the free offline POPCORN sample. Only A initially received its location. B and C requested relevant resources. A shared with both. C independently verified it and passed its location and results to B. This demonstrates task-driven peer sharing and secondary relay within this small arranged test.

| Participant | Discovery | Independent execution | Sharing |
|---|---|---|---|
| A | Seeded public URL and cached file path | Node exit 0 | Sent sample to B and C in response to requests |
| B | A's peer message | Node exit 0 | Asked A and C for evidence; no further sample relay reported |
| C | A's peer message | Node successful; also ran own synthetic digest/signature demonstration | Sent sample and observed results to B |

All reported verified=true, digest_matches=true, one_byte_who_tamper_rejected=true. All recognized historical evidence does not establish current time or authorization. Each noted bundled keys do not independently establish issuer trust. B and A additionally noticed the executable entrypoint does not recompute embedded historical time/policy results.

Timing: setup was observed at 2026-09-07T19:47:06Z; C reported executions completed shortly before 19:48:21Z. These are rough observations, not per-event timestamps. No exact adoption rate or doubling time can be calculated.

Boundary: A's public-page fetch failed a safe-open check; execution used the explicitly supplied cached file. Therefore this is local sample transfer, not successful public URL discovery. No fresh paid witness, booking, external message, or website change occurred. Three participants used one existing sample, not three new receipts.

Interpretation: the sample was useful enough for peers to inspect, execute and share in deliberately related tasks. This does not establish public adoption, repeated use on later tasks, autonomous population growth, 50-agent scaling, or spontaneous spread without a supplied communication network. Peer identities were supplied, tasks were related, no control group was run, all agents used the same model, and filesystem isolation was by instruction rather than enforcement.

Next test: a larger authorized network with working URL access, mixed relevant/irrelevant tasks, an unseeded control group, and timestamped discovery/inspection/execution/relay events. Count independent users separately from requests and repeated messages. Keep paid endpoints outside scope unless separately authorized.
