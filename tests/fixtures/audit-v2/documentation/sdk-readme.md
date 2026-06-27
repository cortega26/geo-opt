# GeoOpt JavaScript SDK

[![npm version](https://badge.fury.io/js/geoopt.svg)](https://www.npmjs.com/package/geoopt)
[![CI](https://github.com/example/geoopt-js/actions/workflows/ci.yml/badge.svg)](https://github.com/example/geoopt-js/actions/workflows/ci.yml)

Programmatic access to the GeoOpt GEO audit engine. Works in Node.js 18+ and
modern browsers.

## Installation

```bash
npm install geoopt
```

## Quickstart

```js
import { GeoOpt } from "geoopt";

const client = new GeoOpt({ apiKey: process.env.GEOOPT_KEY });

const { score, report } = await client.analyze("# My Article\n\n...");
console.log(`GEO score: ${score}/100`);
```

## API

### `new GeoOpt(options)`

| Option    | Type   | Default                             | Description           |
| --------- | ------ | ----------------------------------- | --------------------- |
| `apiKey`  | string | —                                   | Required. API key     |
| `baseUrl` | string | `https://api.geoopt.example.com/v1` | Server URL            |
| `timeout` | number | `30000`                             | Request timeout in ms |
| `retries` | number | `3`                                 | Retries on 5xx errors |

### `client.analyze(content, options?)`

Returns `Promise<AuditResult>`.

### `client.auditFiles(paths, options?)`

Batch audit. Returns `Promise<AuditResult[]>`.

## Contributing

See [`CONTRIBUTING.md`](./CONTRIBUTING.md). PRs welcome — please add tests for
new functionality.

## License

MIT — see [`LICENSE`](./LICENSE).
