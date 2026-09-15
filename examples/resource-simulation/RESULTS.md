# Resource simulation v2

All values are synthetic scenario inputs. Positive savings mean less consumption; positive total change means more consumption.

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

25,920 combinations evaluated. Grid frequencies are not probabilities. Per-completion metrics include resources spent on failed submissions. See README.md for equations and units.
