# REST API Endpoints

## Overview

The GeoOpt REST API provides content analysis endpoints for Generative Engine
Optimization scoring. This reference covers v2 endpoints available at
`https://api.geoopt.example.com/v2`.

## Authentication

```
Authorization: Bearer <token>
```

Tokens are provisioned from the dashboard at
[https://geoopt.example.com/dashboard/keys](https://geoopt.example.com/dashboard/keys).

## Pagination

Collection endpoints accept `?page=` and `?per_page=` query parameters.
Maximum page size is 100 items. Responses include `Link` headers with `next`
and `prev` relation types when more pages are available.

## Endpoints

### Analyze

```
POST /v2/analyze
Content-Type: application/json
```

| Parameter  | Type   | Required | Constraints          |
| ---------- | ------ | -------- | -------------------- |
| `content`  | string | yes      | 1–100 000 characters |
| `profile`  | string | no       | See profile enum     |
| `language` | string | no       | BCP-47, default `en` |
| `model`    | string | no       | `v1` (default), `v2` |

#### Profile enum

`auto`, `documentation`, `open-source`, `editorial`, `commercial`,
`ecommerce`, `regulated`

#### Response `200`

```json
{
  "file": "inline",
  "total_score": 82,
  "breakdown": {},
  "recommendations": [],
  "findings": [],
  "reportVersion": "2.1.0",
  "modelVersion": "2.0.0",
  "generatedAt": "2026-06-27T10:00:00Z"
}
```

### Batch

```
POST /v2/batch
Content-Type: application/json
```

Accepts up to 50 files per request. Returns an array of per-file results with
the same shape as the single-file endpoint.

### History

```
GET /v2/history?page=1&per_page=20
```

Returns audit history for the authenticated account, ordered by recency.

## Error responses

All errors follow [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) (Problem
Details).

```json
{
  "type": "https://geoopt.example.com/errors/rate-limited",
  "title": "Rate limit exceeded",
  "status": 429,
  "detail": "You have exceeded the free-tier limit of 100 requests per hour.",
  "instance": "/v2/analyze"
}
```

## Rate limiting

| Tier       | Requests/hour | Burst  | Timeout |
| ---------- | ------------- | ------ | ------- |
| Free       | 100           | 10     | 60 s    |
| Pro        | 10 000        | 100    | —       |
| Enterprise | Custom        | Custom | —       |

Rate-limit headers are sent on every response:

- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset`
