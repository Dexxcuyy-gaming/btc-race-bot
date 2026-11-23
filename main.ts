// Trend-follower for cbBTC vs USDC on a 24h minute-bar replay.
// Long only, all-in on a confirmed uptrend, all-out on a downtrend or a trailing stop.
// Speaks agent-fun/bars-replay/v1 through the kit SDK shim in vendor/.
//
// Rules (per bar, on its close; a fill lands at the next bar's open):
//   - Fast EMA(30) and slow EMA(120), each seeded as the mean of its first span of closes.
//     Slow spans keep 1-minute noise from whipsawing the bot; the trend is read over hours.
//   - Entry, when flat: fast EMA above slow EMA AND the close above the close 60 bars ago
//     (a 60-minute momentum confirmation, so a flat market does not trigger a buy).
//     Buys with all the cash, up to the weight cap.
//   - Exit, when holding: only a trailing stop — the close more than 3% under the highest
//     close since entry. A fast/slow cross down is not an exit: on 1-minute bars it fires
//     on every dip and whipsaws. Re-entry still needs the uptrend, so a downtrend is not
//     re-bought. Sells the whole position.
//   - max_slippage_bps 200 (2%) on every order: wide enough that a normal 1-minute move
//     never rejects the fill, tight enough to refuse a fill into a gap.
// Deterministic: float64 EMAs on the closes alone, no clock, no environment, no randomness.

import { runBars, type Bar, type BarsState, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';
const FAST_SPAN = 30;
const SLOW_SPAN = 120;
const MOMENTUM_BARS = 60;
const TRAIL_BPS = 300; // 3% below the peak since entry
const MAX_SLIPPAGE_BPS = 200;

interface Ema {
  span: number;
  warm: number[];
  value: number | null;
}

function stepEma(e: Ema, close: number): void {
  if (e.value !== null) {
    e.value += (2 / (e.span + 1)) * (close - e.value);
    return;
  }
  e.warm.push(close);
  if (e.warm.length === e.span) {
    e.value = e.warm.reduce((a, x) => a + x, 0) / e.span;
  }
}

const fast: Ema = { span: FAST_SPAN, warm: [], value: null };
const slow: Ema = { span: SLOW_SPAN, warm: [], value: null };
// Recent closes, oldest first, for the momentum filter.
const closes: number[] = [];
// Highest close since the current entry (trailing stop); null when flat.
let peak: number | null = null;

await runBars({
  onBatch(state: BarsState, batch: { bars: Bar[] }) {
    for (const bar of batch.bars) {
      if (bar.symbol !== SYMBOL) continue;
      const c = Number(bar.c);
      closes.push(c);
      if (closes.length > MOMENTUM_BARS + 1) closes.shift();
      stepEma(fast, c);
      stepEma(slow, c);
      if (peak !== null && c > peak) peak = c;
    }
    if (state.warmingUp) return [];
    const held = state.positions.get(SYMBOL);
    const close = state.close(SYMBOL);
    if (close === null) return [];
    const closeNum = Number(close);
    // Exit: only the trailing stop. A fast/slow EMA cross down is too noisy on 1-minute
// bars — it fires on every dip and whipsaws the bot. The trailing stop alone cuts a
// real reversal while letting the bot ride through shallow dips; re-entry still needs
// the uptrend (fast above slow and momentum positive), so a downtrend is not re-bought.
    if (held !== undefined) {
      const stopHit = peak !== null && closeNum * 10000 < peak * (10000 - TRAIL_BPS);
      if (stopHit) {
        peak = null;
        return [{ side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS } satisfies SellInput];
      }
      return [];
    }
    // Entry: uptrend confirmed by both EMAs and by 30-bar momentum.
    const trendUp = fast.value !== null && slow.value !== null && fast.value > slow.value;
    const momentumOk = closes.length > MOMENTUM_BARS && closeNum > closes[0];
    if (!trendUp || !momentumOk) return [];
    const room = state.weightRoom(SYMBOL);
    const spend = state.cash < room ? state.cash : room;
    if (spend < BigInt(state.hello.fees.min_notional_quote_units)) return [];
    peak = closeNum;
    return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: spend, max_slippage_bps: MAX_SLIPPAGE_BPS } satisfies BuyInput];
  },
});
