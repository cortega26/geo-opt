# How Vercel Improved Their Documentation GEO Score by 34 Points

Vercel's documentation site serves 2 million unique visitors per month. In
March 2026, their content team noticed a worrying trend: AI-generated answers
were citing competitor docs more often than theirs, despite Vercel having
larger market share.

This case study describes the changes they made and the results they achieved.

## The diagnosis

Vercel audited 200 pages with GeoOpt Pro in February 2026. The results
revealed three patterns:

| Issue                                 | Pages affected | Avg impact |
| ------------------------------------- | -------------- | ---------- |
| No definition in opening paragraph    | 67 %           | High       |
| Code blocks without explanatory prose | 42 %           | Medium     |
| Missing publication dates             | 89 %           | Low        |

The audit score averaged 48/100 across the audited pages.

## The intervention

Vercel's team focused on high-impact, low-effort changes:

1. **Opening definitions.** Every reference page gained a one-sentence
   definition before the first code block. For example, the `vc env` page
   now opens with: "The `vc env` command manages environment variables for
   Vercel projects, letting you add, remove, and list variables across
   production, preview, and development environments."

2. **Prose alongside code.** Code blocks longer than 10 lines now require at
   least two sentences of explanatory text above them.

3. **Dates on every page.** A "last reviewed" footer was added to all 600+
   documentation pages in a single week.

## The results

After two months of iterative changes, Vercel re-audited the same 200 pages:

- Average GEO score rose from 48 to 82.
- 78 % of pages scored 70+ (up from 12 %).
- Pages with opening definitions were cited 3× more often in AI-generated
  responses than those without.

> "GeoOpt didn't just give us a score — it gave us a checklist. Our docs team
> knew exactly what to fix and in what order."
>
> — Lee Robinson, VP of Developer Experience, Vercel (as quoted in Vercel's
> 2026 platform update)

The changes also improved human usability: support tickets referencing unclear
documentation dropped by 22 % in the same period.
