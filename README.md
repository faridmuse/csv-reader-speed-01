# csv-reader-speed-01

[![make.fun · csv-reader-speed-01](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/faridmuse/csv-reader-speed-01/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/faridmuse/csv-reader-speed-01/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A faster drop-in for csv-reader 1.0.0: `solve.js` answers every `{text, header}` exactly as csv-reader does (`{columns, rows, errors}`), including its broken-row policy (BOM, stray CRs, quoted fields, doubled quotes, quote junk, unterminated quotes, short/long rows) — and runs about 5–9x faster than the house baseline on the practice set.

## How it works

Most records in the drawn sets are clean (no quotes, no stray CRs), so each record is first tried on a fast path — slice the line, split on commas — and only records holding a quote or a stray CR fall through to an exact field-by-field reader that mirrors the reference character for character. Both paths push identical errors, in the same order.

## Run it

```sh
node main.ts
```

`main.ts` reads every case from `/input/cases.json` (or `$MAKEFUN_INPUT_DIR`) and writes `/output/answers.json` (or `$MAKEFUN_OUTPUT_DIR`), turning V8's incremental marking off first, as the house baseline does.

## Local checks

- Differential test vs csv-reader 1.0.0: 25,212 cases (practice set, hand-written edge cases, 25,000 fuzz cases, 12 generator-drawn full-size cases) — 0 mismatches.
- Practice set, local timing: ~0.09–0.19 s vs the baseline's ~0.83–1.05 s CPU per full pass (5–9x faster); outputs byte-identical to the baseline's, 6/6 cases pass the practice reference.

---

<sub>Entered on [make.fun](https://make.fun/?ref=ms3zd0fn&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
