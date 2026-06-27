# PostgreSQL 17 — Query Planner Improvements

PostgreSQL 17 introduces significant changes to query planning and execution,
building on the work begun in PostgreSQL 15. This document describes the
planner changes that are most likely to affect real-world workloads.

Release date: September 26, 2024.  
Current minor: 17.2 (February 13, 2025).

## Incremental sorts for window functions

PostgreSQL 15 introduced incremental sorts for `ORDER BY`. In PG17, the
optimizer can use incremental sorts for window function `PARTITION BY` and
`ORDER BY` clauses when the input is already partially sorted.

### When it triggers

Consider a table `events` with a composite index on `(user_id, event_time)`:

```sql
CREATE INDEX ON events (user_id, event_time);

SELECT
    user_id,
    event_time,
    event_type,
    row_number() OVER (
        PARTITION BY user_id
        ORDER BY event_time
    ) AS event_seq
FROM events
WHERE event_time >= now() - INTERVAL '30 days';
```

In PG16, the planner materializes and sorts all rows matching the filter
before evaluating the window function. In PG17, it recognizes that the
index provides presorted input per partition and skips the full sort. On
tables wider than memory, this reduces query time by 40–70 % depending on
filter selectivity.

### When it doesn't trigger

The optimization does not apply when:

- The `PARTITION BY` column differs from the leading index column.
- The `ORDER BY` clause sorts descending while the index is ascending
  (or vice versa) without a matching sort operator.
- The query includes multiple window functions with conflicting sort
  requirements.

## Merge join improvements

PG17 can now use a merge join when the inner relation is a `Memoize` node
fed by a parameterized path, which was previously rejected. This helps
correlated subqueries on large dimension tables.

Example from the regression suite:

```sql
EXPLAIN ANALYZE
SELECT c.name, (
    SELECT count(*)
    FROM orders o
    WHERE o.customer_id = c.id
      AND o.order_date >= '2025-01-01'
) AS recent_orders
FROM customers c
WHERE c.region = 'EMEA';
```

PG16 plan: Nested Loop with Memoize (inner executed once per outer row).  
PG17 plan: Merge Join with Memoize (inner materialized once, sorted, then
merged). Execution time drops from ~2.8 s to ~0.4 s on a 1 M row `orders`
table with a warm cache.

## Subquery removal for `NOT EXISTS`

The planner now removes `NOT EXISTS` subqueries when the subquery's
`WHERE` clause references only columns with `NOT NULL` constraints. This
was previously limited to `EXISTS` (added in PG16).

```sql
-- PG17 removes this subquery entirely if orders.id is NOT NULL
SELECT *
FROM customers c
WHERE NOT EXISTS (
    SELECT 1
    FROM orders o
    WHERE o.customer_id = c.id
      AND o.id IS NOT NULL
);
```

The rewritten plan is equivalent to an anti-join, which the optimizer can
reorder freely.

## Planner statistics for multicolumn MCV lists

`CREATE STATISTICS` with the `mcv` option now supports up to 8 columns per
group (raised from 5). This matters for star-schema queries where fact
tables are filtered by multiple dimension attributes simultaneously.

```sql
CREATE STATISTICS s (mcv)
ON region, product_category, channel, order_year, customer_tier, campaign_id
FROM orders;
```

With this statistic in place, the planner estimates row counts within 10 %
of actual for 6-column filter combinations that previously showed 50–200×
estimation errors.

## Backward compatibility

All improvements are planner-only. Queries that plan differently than in
PG16 produce identical results. If a workload regresses, disable individual
features:

```sql
SET enable_incremental_sort = off;        -- Window function sorts
SET enable_memoize = off;                  -- Merge-join Memoize
SET enable_parallel_hash = on;             -- Unchanged but note for perf
```

The PG17 query planner passes the full regression test suite with zero
plan changes that affect result correctness. Performance-only regressions
are tracked at the [PostgreSQL 17 open items list](https://wiki.postgresql.org/wiki/PostgreSQL_17_Open_Items).
