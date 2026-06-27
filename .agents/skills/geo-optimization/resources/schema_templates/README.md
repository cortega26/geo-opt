# Schema reference templates

These JSON files illustrate the connected Schema.org `@graph` shapes produced
by `generateSchemaData()`. They are documentation fixtures and are not loaded
at runtime.

The canonical implementations are:

- `src/schema.js` for JavaScript;
- `scripts/geo_optimizer.py` for Python.

Generated output depends on source content and explicit configuration. The
implementations do not infer author, publisher, publication date, price,
currency, or availability. The templates use `example.com` and descriptive
placeholder values only to show relationships between nodes.

When schema behavior changes, update both runtimes, their tests, and these
reference files.
