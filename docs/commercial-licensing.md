# Commercial licensing

**Status:** implemented-behavior summary, not an offer
**Last verified:** 2026-06-27 at commit `f91fae7`

`geo-opt` is currently distributed under the Tooltician Community License 1.0
with a separate commercial path for customers that need branding-free injected
output or rights beyond the Community terms. The commercial path is not yet
generally available because the included terms still require qualified legal
review.

This page describes implemented behavior. It is not a product roadmap or an
offer to sell a license.

## Current distinction

| Capability                               | Community                  | Commercial entitlement                 |
| ---------------------------------------- | -------------------------- | -------------------------------------- |
| Local content audits                     | Included                   | Included                               |
| Recursive and JSON audit workflows       | Included                   | Included                               |
| JSON-LD generation and validation        | Included                   | Included                               |
| `robots.txt` and `llms.txt` tools        | Included                   | Included                               |
| Source access                            | Community License terms    | Applicable commercial terms            |
| Credit in injected output                | Required                   | May be omitted                         |
| `--no-branding`                          | Rejected                   | Enabled with a valid local entitlement |
| Local support reminders                  | Infrequent and disableable | Suppressed                             |
| Redistribution, embedding, or OEM rights | Community terms only       | Requires an explicit written grant     |

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

When no valid entitlement is available, the audit and generation workflows
remain usable. Only branding-free injection is rejected.

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

At commit `f91fae7`, the experimental v2 audit path also increments this
injection counter. That is a known implementation defect, not part of the
commercial contract, and is scheduled for removal in roadmap plan 029. It does
not add analytics or a network request.

## Legal status

The binding scope, term, support, price, refunds, and additional rights must be
stated in an issued order or written agreement. The
[commercial license terms](../COMMERCIAL-LICENSE.md) are a project draft and
must receive qualified legal review before paid licenses are issued.

For licensing inquiries, visit [Tooltician](https://tooltician.com/).
