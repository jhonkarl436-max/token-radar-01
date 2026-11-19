# Token Radar

Token Radar is a quantitative ranking system and interactive dashboard for pre-token protocols, powered by sealed snapshot data from DefiLlama (as of 2026-11-14).

[![Token Radar Status](https://make.fun/badge/token-radar-01.svg)](https://make.fun)
[![Token Radar Rank](https://make.fun/badge/token-radar-01/jhonkarl436-max/token-radar-01/rank.svg)](https://make.fun)
[![Token Radar Reward](https://make.fun/badge/token-radar-01/jhonkarl436-max/token-radar-01/reward.svg)](https://make.fun)

## How the Model Works

The radar evaluates pre-token protocols based on TVL, category-specific market-cap-to-TVL valuation multiples derived from tokened protocol medians, 7-day TVL momentum growth weights, and maturity age adjustments. Protocols are ranked deterministically to surface the highest-implied-value opportunities across decentralized finance.

## Running the Radar

To build the board and generate data assets:

```bash
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input ../token-radar-01-kit/input/snapshot.json
```
