# Schema reference templates

These JSON files illustrate the connected Schema.org `@graph` shapes produced
by `generateSchemaData()`. They are documentation fixtures and are not loaded
at runtime.

The canonical implementations are:

- repository `src/schema.js` for canonical JavaScript behavior;
- `scripts/geo_optimizer.py` for the Python compatibility implementation.

Generated output depends on source content and explicit configuration. The
implementations do not infer author, publisher, publication date, price,
currency, or availability. The templates use `example.com` and descriptive
placeholder values only to show relationships between nodes.

When schema behavior changes, first update the capability decision in
`docs/architecture.md`. If schema generation remains a shared capability,
update both runtimes, their cross-runtime tests, and these reference files in
the same change. Templates illustrate output; runtime code and tests remain the
behavioral source of truth.
