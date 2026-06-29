# Commercial licensing

**Status:** implemented-behavior summary, not an offer
**Last verified:** 2026-06-29 at commit `5ee9c0c`

`geo-opt` is currently distributed under the Tooltician Community License 1.0
with a separate commercial path for customers that need batch and recursive
workflows, file generation and injection, CI/CD quality gates, branding-free
output, or rights beyond the Community terms. The commercial path is not yet
generally available because the included terms still require qualified legal
review.

This page describes implemented behavior. It is not a product roadmap or an
offer to sell a license.

## Current distinction

| Capability | Community | Commercial entitlement |
|---|---|---|
| Auditoría de un solo archivo (`audit <file>`) | Incluido | Incluido |
| Auditoría recursiva, multi-archivo y agregados | ❌ | Incluido |
| `audit --threshold` (CI/CD quality gate) | ❌ | Incluido |
| Generación JSON-LD por stdout (`schema`) | Incluido, con branding | Incluido |
| Validación JSON-LD (`validate`) | Incluido | Incluido |
| Inyección JSON-LD (`inject`) | ❌ | Incluido |
| `robots.txt` y `llms.txt` auditoría | Incluido | Incluido |
| `robots.txt` y `llms.txt` generación | ❌ | Incluido |
| `--no-branding` | ❌ | Incluido con titularidad válida |
| API de librería: funciones de lectura | Incluido | Incluido |
| API de librería: funciones de lote y escritura | ❌ | Incluido |
| Acceso al código fuente | Community License terms | Términos comerciales aplicables |
| Recordatorios de soporte | Infrecuentes y desactivables | Suprimidos |
| Redistribución, embedding u OEM | Solo términos Community | Requiere autorización escrita expresa |

La tabla comparativa completa está en [`docs/free-vs-pro.md`](free-vs-pro.md).

Commercial licensing does not change the audit score and does not promise
ranking, retrieval, inclusion, mention, or citation by an AI system.

## Entitlement behavior

The current source tree resolves a key from either:

1. `TOOLTICIAN_LICENSE_KEY`; or
2. `license.key` in `geo_config.json`.

The local check is a convenience gate rather than strong digital rights
management. Do not publish keys, place them in command history, or commit them
to source control.

```json
{
  "license": {
    "key": "your-issued-license-key"
  }
}
```

Cuando no hay una titularidad válida, las operaciones de lectura sobre un solo
archivo y la generación de schema por stdout permanecen utilizables. Las
operaciones de lote, escritura y generación de archivos requieren Pro. Consulta
[`docs/free-vs-pro.md`](free-vs-pro.md) para el desglose completo.

## Community reminder policy

The optional support reminder:

- becomes eligible after 10 successful Community injections;
- appears at most once every 7 days;
- appears only on an interactive terminal;
- is suppressed in continuous integration, pipes, dry runs, and commercial
  use;
- writes to `stderr`, never machine-readable `stdout`;
- performs no analytics or network request;
- can be disabled with `geo-opt config set reminders false`.

The state is stored in the operating system's user configuration directory.
`GEO_OPT_STATE_DIR` may override the location for testing or managed
environments.

## Legal status

The binding scope, term, support, price, refunds, and additional rights must be
stated in an issued order or written agreement. The
[commercial license terms](../COMMERCIAL-LICENSE.md) are a project draft and
must receive qualified legal review before paid licenses are issued.

For licensing inquiries, visit [Tooltician](https://tooltician.com/).
