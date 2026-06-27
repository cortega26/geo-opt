# OpenFeature Node.js SDK

OpenFeature is an open standard for feature flagging. The Node.js SDK provides
a vendor-agnostic API that works with any feature-flag backend.

## Status

[![CI](https://github.com/open-feature/js-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/open-feature/js-sdk/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/open-feature/js-sdk/branch/main/graph/badge.svg)](https://codecov.io/gh/open-feature/js-sdk)

This project is stable and follows semantic versioning. The current major
version is 2.x, released June 2025.

## Installation

```bash
npm install @openfeature/server-sdk
```

## Usage

```js
import { OpenFeature } from "@openfeature/server-sdk";

// Configure a provider once at startup
OpenFeature.setProvider(new YourFlagProvider());

const client = OpenFeature.getClient();

// Evaluate a boolean flag
const darkMode = await client.getBooleanValue("dark-mode", false);
```

## Providers

The SDK is provider-agnostic. Choose a provider for your flag backend:

| Backend      | Package                              | Maturity |
| ------------ | ------------------------------------ | -------- |
| LaunchDarkly | `@openfeature/launchdarkly-provider` | Stable   |
| Split        | `@openfeature/split-provider`        | Stable   |
| CloudBees    | `@openfeature/cloudbees-provider`    | Beta     |
| Flagsmith    | `@openfeature/flagsmith-provider`    | Stable   |
| Custom       | Build your own                       | —        |

## Evaluation API

### `getBooleanValue(flagKey, defaultValue)`

Returns `Promise<boolean>`. Throws if the provider is unavailable and no
default is configured.

### `getStringValue(flagKey, defaultValue)`

Returns `Promise<string>`.

### `getNumberValue(flagKey, defaultValue)`

Returns `Promise<number>`.

### `getObjectValue(flagKey, defaultValue)`

Returns `Promise<object>`. Deep-merges the returned value with the default.

## Hooks

Hooks run before and after flag evaluation. Use them for logging, validation,
or telemetry.

```js
client.addHooks([{ name: "logger", before: (ctx) => console.log(`eval: ${ctx.flagKey}`) }]);
```

Hooks execute in LIFO order. Provider hooks run before client hooks.

## Contributing

We welcome contributions. Start by reading
[`CONTRIBUTING.md`](https://github.com/open-feature/js-sdk/blob/main/CONTRIBUTING.md).
All contributions require a Developer Certificate of Origin sign-off.

## License

Apache 2.0 — see [`LICENSE`](https://github.com/open-feature/js-sdk/blob/main/LICENSE).
