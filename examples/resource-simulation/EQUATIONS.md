# Accounting method and equations

A local, reproducible scenario model. This package neither runs agents nor measures POPCORN performance. It makes no network calls or payments. Every numeric default and cooling regime is a synthetic assumption, not an industry average, a forecast, a measured value or a probability distribution.

Run from this directory:

```text
node check.cjs
node simulate.cjs
node build-view.cjs
```

`model.cjs` is the single computation source used by the command-line simulation and interactive view. `grid.csv` contains 25,920 scenario combinations. `results.json` preserves full inputs and outputs. `RESULTS.md` summarizes eight examples. `index.html` is the standalone generated browser view. `measurement-template.csv` is a blank observation template; it contains no fabricated measurements.

## What changed

- Fixed and token-sensitive model energy are separate. Token changes may increase or decrease work.
- Execution failure frequency can improve or worsen. False rejections lower completion.
- Realization of predicted energy reductions can range from zero to all of the allocated workload savings; increased work still incurs its cost.
- Model and verifier locations have separate PUE, onsite cooling water and upstream electricity-water intensities.
- Onsite freshwater share distinguishes freshwater from other cooling-water sources. Upstream intensity must already represent freshwater consumption.
- Verification energy, time, expense, optional paid receipts and human review are separate quantities.
- Per-delivered-success accounting includes failed work. Submitted-demand growth changes totals, not per-success efficiency.
- Missing denominators produce undefined results, not invented savings.

## Equations

Let `p0` be baseline execution success, `b` relative failure reduction (-0.5 means 50% more execution failures), `f` false rejection, `n` maximum attempts:

```text
p = max(0, 1 - (1-p0)*(1-b))
q = 1-f
s = q*p
A = sum((1-s)^i, i=0..n-1)
C = 1-(1-s)^n
expected executions = A*q
```

In this model retries are independent, equally costly conditional on execution, and permitted for the synthetic legitimate task. A refusal does not authorize retrying around a real participant's boundary. Persistent failures and actual multi-agent decisions need separate empirical characterization.

For token reduction `r`, fixed energy share `a`, and exponent `k`:

```text
execution energy factor = a+(1-a)*(1-r)^k
target model IT energy = fixed energy per submission + A*q*baseline execution IT energy*factor
```

Let `I0` be the baseline model IT energy per submission. Realization fraction `z` limits predicted reductions:

```text
if target < I0: model IT energy = I0-z*(I0-target)
otherwise: model IT energy = target
verifier IT energy = A*gateEnergyRatio*baseline execution IT energy
```

This is a sensitivity parameter for workload-associated energy; it is not a measured causal response of a data center. Shared always-on infrastructure, manufacture, training, long-term utilization and demand-induced capacity expansion are excluded. Do not interpret the result as the full facility's power bill.

For each component (model and verifier), with `I` IT kWh:

```text
facility kWh = I*PUE
onsite freshwater liters = I*WUE*onsite freshwater share
upstream freshwater liters = facility kWh*upstream freshwater liters per facility kWh
```

WUE here is consumptive onsite water per IT kWh. Both water components must measure consumption, not mix consumption with withdrawals. Do not insert a lifecycle or upstream-inclusive WUE and then add its upstream water again. Intensities vary by location and time. Zero onsite water does not mean zero upstream water. The cooling presets illustrate different inputs; they do not imply that software changes cooling hardware or that the selected PUE/WUE pairs describe a real site.

For any resource `X`:

```text
resource per delivered success = X_per_submission / C
total resource = submissions * X_per_submission
delivered successes = submissions * C
break-even submitted-demand multiplier = baseline X_per_submission / protocol X_per_submission
```

When there is no fixed submission cost, under independent equal-cost attempts `A/C=1/s`. That makes the retry cap cancel from per-success metrics. False rejection then cancels from model-only energy per success but increases gate overhead and reduces completion. These are mathematical consequences of the assumptions, not findings about agents.

`overheadBreakEvenForFreshwater` is the maximum verifier IT energy per attempt, expressed as a fraction of baseline execution IT energy, for equal freshwater per delivered success. Negative values mean there is no allowable nonnegative overhead that produces savings in that case. A null value means the threshold is undefined (for example no completed tasks or zero verifier water intensity).

Time is sequential machine elapsed work, not queueing latency or conditional latency of successful runs. Human review minutes are reported separately; they are not silently added to machine latency. Cost includes entered model, verifier, witness and human charges only. Do not double count electricity already covered by an API price. Gate energy must include client, witness service, transport and storage work within the stated accounting boundary; changing the receipt price does not change the assumed energy.

Heat-equivalent MJ = facility kWh*3.6. It is an energy-unit conversion under eventual heat dissipation, not an additional saving to add to electricity. No peak temperature, cooling-capacity, atmospheric warming or water-scarcity impact model is included. Aggregate liters in two regions are not equivalent in local social impact.

## Test the hypotheses against observations

Reviewer note: this version has no separately parameterized baseline verifier cost. A real baseline may already use clocks, signature checks or other deterministic controls. The empirical comparison must include those existing costs and must not assume the alternative workflow reasons through facts it already checks with code. Unauthorized execution outcomes and correlated failures are not simulated; measure them separately.

1. Define the same useful task, evidence requirements and authorization rules for both arms. Use a realistic existing verifier/control as a comparator, not an intentionally wasteful baseline.
2. Assign comparable tasks to baseline and POPCORN workflows; pair or randomize order. Do not infer efficacy from different tasks or weaker success criteria.
3. Count every input, output and cached token; every model attempt; verification calls; failed submissions; human review; actual fees; and wall time. Preserve task identifiers without collecting private payloads unnecessarily.
4. Measure model and verifier energy, or label estimates with their source, scope and uncertainty. Source cooling and electricity freshwater consumption separately for relevant locations and times. A provider token count does not directly measure liters.
5. Include malformed evidence, expired permission, participant refusal, false rejections, unchanged tasks and changed tasks. Measure authorized completion and unauthorized execution separately.
6. Report confidence intervals from actual observations. Grid frequencies and synthetic values are not uncertainty estimates. Predefine the task population and success criteria before fitting the model.

The prior handoff and conformance checks are evidence for their recorded behavior. They do not supply the energy, token reduction, failure reduction or water parameters automatically. This model gives a place to insert those measurements when available.

## Sources for accounting definitions, not numeric defaults

- DOE: PUE, cooling-water practices and energy/water relationships: https://www.energy.gov/cmei/femp/cooling-water-efficiency-opportunities-federal-data-centers
- Berkeley Lab, 2024 US Data Center Energy Usage Report, definitions of direct and indirect water consumption: https://bies.lbl.gov/publications/2024-lbnl-data-center-energy-usage-report
- DOE, Water and Energy Considerations During Federal Data Center Consolidations, cooling trade-offs: https://www1.eere.energy.gov/femp/pdfs/consolidation_guidelines.pdf

This is a finite sensitivity analysis. It does not establish economic valuation, societal survival, universal alignment, investor motives, or every possible mathematical hypothesis.
