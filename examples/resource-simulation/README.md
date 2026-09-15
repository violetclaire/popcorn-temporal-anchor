# POPCORN resource simulation

An inspectable model of when changes in model work, execution failures, verification overhead, and submitted demand could reduce or increase resource use. **All numeric inputs are synthetic assumptions. No resource measurements are loaded.**

[Equations, assumptions, and measurement method](EQUATIONS.md#equations) · [Full inputs and outputs](results.json) · [25,920-row sensitivity grid](grid.csv) · [Blank measurement template](measurement-template.csv)

## Execution instructions for authorized reviewers

From the repository root, with Node.js 20 or newer:

```sh
node examples/resource-simulation/check.cjs
node examples/resource-simulation/simulate.cjs
```

The first command runs **19 checks** of the model. The second regenerates eight scenarios and **25,920 combinations**, writing `results.json`, `grid.csv`, and `RESULTS.md` in this example directory. No package installation, network call, wallet, payment, or agent execution is required.

For the interactive view, [download index.html](https://github.com/violetclaire/popcorn-temporal-anchor/raw/refs/heads/main/examples/resource-simulation/index.html) and open the saved file in a browser. GitHub displays its source; the downloaded HTML runs offline and contains the same model as the command-line version. It has no external scripts, styles, fonts, or analytics. To rebuild it after a model change:

```sh
node examples/resource-simulation/build-view.cjs
```

## What is evidence, and what is a hypothesis?

The repository's [protocol verification checks](../verification-checks/README.md) inspect exact schedule bytes, signatures, malformed input, and saved signed receipts. The [saved witness outcomes](../witness/evaluation-outcomes.json) record the historical STOP and PROCEED examples. Their scope and limitations are documented alongside the [witness fixtures](../witness/README.md).

This resource simulation is a separate hypothesis model. Historical receipt verification does not establish a token reduction, a failure reduction, electricity savings, freshwater savings, current authorization, or actual task execution. Its 19 checks verify mathematical behavior and edge cases; they do not validate performance in a real workload.

To check the existing protocol behavior separately:

```sh
node examples/verification-checks/check.mjs
```

## Eight synthetic scenarios

Positive savings mean less use; negative savings mean more use. Total freshwater change compares each scenario's submitted demand with baseline demand. Per-completion accounting includes resources spent on failed submissions.

| Assumed scenario | Completion | Freshwater saved per completion | Electricity saved per completion | Total freshwater change |
|---|---:|---:|---:|---:|
| Earlier linear scenario | 99.99% | 56.65% | 56.65% | -56.31% |
| Same improvements, 40% fixed energy | 99.99% | 39.98% | 39.98% | -39.51% |
| Moderate assumptions | 99.87% | 19.98% | 19.98% | -19.44% |
| Moderate, only half of predicted energy savings realized | 99.87% | 9.43% | 9.43% | -8.82% |
| Overhead only | 99.20% | -5.00% | -5.00% | 5.00% |
| More tokens and more failures | 97.11% | -23.45% | -23.45% | 20.85% |
| Moderate, double submitted demand | 99.87% | 19.98% | 19.98% | 61.12% |
| Dry model site, water-intensive verifier | 99.87% | -801.27% | -0.67% | 807.36% |

The same assumed efficiency improvement can coexist with higher total use when demand increases. Verifier overhead and location can also reverse apparent savings. These are consequences of the entered assumptions, not forecasts. Grid frequencies are not probabilities or confidence intervals.

## Accounting boundary

The model separates fixed and token-sensitive energy, independent retries, false rejections, verifier overhead, realized workload energy reductions, model and verifier locations, and demand growth. It distinguishes onsite freshwater consumption from electricity-supply freshwater consumption. It also reports entered fees, sequential machine time, and human review separately.

The baseline has no separately parameterized verifier cost. A measured comparison must include controls the baseline already uses. The model excludes shared always-on infrastructure, manufacture, training, long-term capacity changes, correlated failures, and unauthorized execution outcomes. Zero denominators remain undefined. Read the [equations and limitations](EQUATIONS.md#equations) before substituting observations.

Use the [blank CSV template](measurement-template.csv) and [measurement method](EQUATIONS.md#test-the-hypotheses-against-observations) to compare matched useful tasks, count failed work and existing controls, and report observed uncertainty. There are no fabricated measurement rows in the template.

## Files and licensing

`model.cjs` is the single computation source for the CLI and generated browser view. `check.cjs` tests it; `simulate.cjs` produces the scenario files. `explorer-template.html` contains the view and its small local stylesheet; `build-view.cjs` embeds the model and license notice in `index.html`.

Copyright 2026 Violet Herod. This simulator is available for source inspection under [LICENSE](LICENSE); it is not included in the free sample/checker/client-use grant. The execution commands above describe how an authorized reviewer reproduces results. Public visibility does not grant code resale, redistribution or commercial hosting. See the [licensing boundaries](../../LICENSING.md). The simulator holds no issuer signing keys and issues or settles no receipts or payments.
