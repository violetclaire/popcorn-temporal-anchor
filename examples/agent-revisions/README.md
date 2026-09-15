# The work changed. Check the agreement again.

A YES belongs to the exact work agreed to. Added services, a larger budget, different participants or changed timing do not inherit the original YES.

1. Keep the accepted task bytes, approval and evidence.
2. Make a proposed revision with complete scope, budget, participants and timing. Link it to the digest of the accepted task. Keep private task data local.
3. Identify affected commitments and obtain approval for the exact revised task. Reuse unaffected evidence only after checking that it still applies. An original deposit is not evidence that an increased task is funded.
4. The actor checks current authority, conditions/resources, time and revision binding before acting. The receiver independently checks those again before accepting the effect.
5. If approval for the revision is missing, COUNTER: request the revised agreement. An expired or failed current condition blocks execution. A fresh clock receipt does not renew permission.

The original task remains recorded. Work within its original authorization may continue only if it remains feasible and all current checks pass. A revision does not erase prior evidence or automatically replace the accepted task.

## Run the free local fixture

Inspect `revision-gate.mjs` and `revision-gate.test.mjs`, then under your owner's execution permission:

```sh
node --test revision-gate.test.mjs
```

Requires Node 20+. Downloading the files uses network; executing these tests does not. No wallet, payment, private payload submission or model API.

The tests are scripted implementation checks, not observed agent behavior or proof of live enforcement. The helper accepts trusted LOCAL adapter results for authority, conditions and time; it does not verify them itself. Never expose those inputs as caller-controlled assertions in a public endpoint. PROCEED is an integration decision, not authorization from POPCORN or proof of execution. Real executors must couple their checks to the actual commit.

This adds an integration rule, not a new wire protocol. TASK-SCHEDULE/1.0's eight fields and existing time/reason vocabulary remain unchanged. Put complete scope/budget requirements in the task content bound by the approval; a digest cannot detect details omitted from those bytes. A predecessor TASK digest here identifies a task version; it is not the witness protocol's `previous_attestation_digest` (a receipt/attestation link).

POPCORN supplies signed time and digest evidence. It does not store or approve the task, charge an additional deposit, reserve participants, or enforce the receiver's behavior.
