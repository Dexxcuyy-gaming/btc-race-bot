# BTC trend-follower — btc-race-24h-20261123-0511

[![make.fun · btc-race-24h-20261123-0511](https://make.fun/badge/btc-race-24h-20261123-0511.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![rank](https://make.fun/badge/btc-race-24h-20261123-0511/Dexxcuyy-gaming/btc-race-bot/rank.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)
[![reward](https://make.fun/badge/btc-race-24h-20261123-0511/Dexxcuyy-gaming/btc-race-bot/reward.svg)](https://make.fun/bounty/btc-race-24h-20261123-0511?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261123-0511)

A long-only trend-following bot for cbBTC vs USDC on a 24h minute-bar replay.
It buys the uptrend and rides it, selling only on a trailing stop.

## Strategy

- **Entry (when flat):** fast EMA(30) above slow EMA(120) **and** the close above the
  close 60 bars ago (60-minute momentum confirmation). Buys with all the cash, up
  to the weight cap.
- **Exit (when holding):** only a trailing stop — the close more than 3% under the
  highest close since entry. A fast/slow EMA cross down is deliberately **not** an
  exit: on 1-minute bars it fires on every dip and whipsaws. Re-entry still needs
  the uptrend, so a downtrend is not re-bought.
- **Sizing:** all-in on entry, all-out on exit. `max_slippage_bps` 200 (2%).

## Why this shape

1-minute bars are noisy (mean |return| ~0.05%, stdev ~0.08%). A fast crossover
strategy trades dozens of times and loses to the ~26 bps round-trip cost. Slow
EMAs (30/120) read the trend over hours, and a trailing-stop-only exit lets the
bot hold through shallow dips instead of selling into them.

## Dev-window result (local grade, `--driver process`)

- Net PnL **+31.28 USDC** (+3.13%) — 1 trade, win rate 100%, max drawdown 1.98%,
  fees 0.81 USDC (net PnL at 2x fees +30.45 USDC). Guardrails met.
- Deterministic: L1 regrade reproduced byte for byte.

## Layout

- `main.ts` — the bot (Node 22, erasable TypeScript, stdlib + the SDK shim only).
- `vendor/makefun-bars.ts` — byte-for-byte copy of the kit's SDK shim.
- `LICENSE` — MIT.

## Run

The grader runs `node /bot/main.ts`. It speaks `agent-fun/bars-replay/v1` on
stdin/stdout (hello once, one batch per minute, then done; one reply per batch).
