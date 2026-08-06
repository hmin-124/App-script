# BMaGvn — Open HTF

TradingView Pine Script v5 indicator: HTF Open levels + signal/reversal table.

## Install

1. Open [TradingView Pine Editor](https://www.tradingview.com/pine/)
2. Paste contents of `BMaGvn_Open_HTF.pine`
3. Add to chart (overlay)

## Features

- **Open levels** (H12 → 3M): solid horizontal lines, TF tags at right edge, price-scale labels
- **H1–H6**: table only (no chart lines)
- **W / 1M / 3M quarters**: dashed lines at open of 2nd quarter (`1/4 (2)`) and 3rd quarter (`1/2 TF`) — period split into 4 equal parts (W ≈ 42h per quarter)
- **Merged labels** when Open prices match (smallest TF leads price scale)
- **Table**: prior closed candle extremes, signal type, live reversal vs current HTF candle
- **Alerts**: touch each TF Open

## Timeframes

H1 · H3 · H4 · H6 · H12 · D1 · D2 · D3 · D5 · W1 · 1M · 3M

### Quarter marks (W · 1M · 3M)

| Segment | When | Label |
|--------|------|--------|
| 1/4 đầu | Period open | `W1` / `1M` / `3M` (existing Open) |
| 1/4 (2) | Open + dur/4 | `1/4 (2) W` … |
| 1/2 | Open + dur/2 | `1/2 W` … |
