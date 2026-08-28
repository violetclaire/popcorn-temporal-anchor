# Stale-action circuit breaker

This example deliberately evaluates the shared receipt after its conservative
monotonic validity has expired. The verifier returns
`request_new_temporal_anchor`; it never executes the protected action.

The point is not to centralize the action at 767-2676.com. The participant
keeps its own `task_payload`, policy, and `execution_window_utc`, then uses the
verified POPCORN interval as one narrow input to its local decision.
