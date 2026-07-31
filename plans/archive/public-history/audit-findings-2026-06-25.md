# Deep Audit Findings — 2026-06-25

**Commit**: `9e29ecd` | **Branch**: `advisor/008-modernization` | **Lines audited**: 2,315
**Fixed**: 2026-06-25 | **Status**: 17 findings fixed, 3 remaining (directional only)

## Fixed ✅ (17)

| # | Finding | Cat | Files changed |
|---|---------|-----|---------------|
| 1 | SEC-03: `</script>` breakout en JSON-LD | security | `src/schema.js`, `geo_optimizer.py` |
| 2 | SEC-01: Python sin path traversal guard | security | `geo_optimizer.py` |
| 3 | SEC-02: Python sin escapeo HTML de firma | security | `geo_optimizer.py` |
| 4 | CORRECT-01: Falta `return` tras `process.exit()` (11 sitios) | correctness | `scoring.js`, `schema.js`, `config.js`, `robots.js` |
| 5 | CORRECT-02: Backup antes del path guard (TOCTOU) | correctness | `bin/cli.js` |
| 6 | CORRECT-04: Product schema sin `price` | correctness | `src/schema.js`, `geo_optimizer.py` |
| 7 | CORRECT-06: `--threshold` trunca floats | correctness | `bin/cli.js` |
| 8 | CORRECT-03: HTML-detection usa raw content | correctness | `scoring.js`, `geo_optimizer.py` |
| 9 | CORRECT-07: Multi-line User-agent false negatives | correctness | `robots.js`, `geo_optimizer.py` |
| 10 | CORRECT-05: `cleanMarkdownToPlainText` corrompe inline code | correctness | `src/text.js`, `geo_optimizer.py` |
| 11 | PERF-01: Doble lectura en `injectSchema` | performance | `src/schema.js`, `geo_optimizer.py` |
| 12 | DEBT-01: `src/optimizer.js` wrapper innecesario | tech-debt | deleted `src/optimizer.js` |
| 13 | DEBT-02: `aiAgents` array nunca usado (JS + Python) | tech-debt | `robots.js`, `geo_optimizer.py` |
| 14 | DEBT-04: CLAUDE.md métricas obsoletas | dx | `CLAUDE.md` |
| 15 | Python test fix: temp files inside CWD | tests | `test_optimizer.py` |
| 16 | GAP-01: Verbal statistics port a Python | sync | `geo_optimizer.py` |
| 17 | GAP-01: dry-run, backup, threshold, batch port a Python | sync | `geo_optimizer.py` |

## Remaining (directional, not bugs)

| # | Finding | Why not fixed now |
|---|---------|-------------------|
| DIR-01 | Comando `init` para scaffolding | Feature nuevo, requiere diseño |
| DIR-02 | Batch audit aggregation (JSON array) | Feature nuevo, requiere diseño |
| DIR-03 | JSON-LD validation/extract | Feature nuevo, requiere diseño |

## Verification

```
npm run check  → lint 0/0, format clean, 15/15 JS tests pass
python3 test_optimizer.py  → 6/6 Python tests pass
```

10 files changed, +242/-96 lines.
