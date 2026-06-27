# GeoOpt API Reference

Base URL: `https://api.geoopt.example.com/v1`

## Authentication

All requests require an API key passed in the `Authorization` header:

```
Authorization: Bearer YOUR_API_KEY
```

## Endpoints

### `POST /analyze`

Analyzes a single content file and returns a GEO score.

**Request body:**

| Field    | Type   | Required | Description               |
| -------- | ------ | -------- | ------------------------- |
| content  | string | yes      | Raw markdown or HTML text |
| profile  | string | no       | Content profile override  |
| language | string | no       | BCP-47 language tag       |

**Response:**

```json
{
  "score": 78,
  "breakdown": {
    "structure": { "score": 16, "max": 20 },
    "statistics": { "score": 14, "max": 20 },
    "quotations": { "score": 8, "max": 20 },
    "citations": { "score": 18, "max": 20 },
    "clarity": { "score": 20, "max": 20 }
  }
}
```

### `GET /history`

Returns the last 100 audit results for the authenticated account.

### `DELETE /history/:id`

Removes a specific audit result by its identifier.

## Error codes

| Code | Meaning                                |
| ---- | -------------------------------------- |
| 400  | Invalid request body                   |
| 401  | Missing or expired API key             |
| 429  | Rate limit exceeded — retry after 60 s |
| 500  | Internal server error                  |

## Rate limits

Free tier: 100 requests/hour. Pro tier: 10 000 requests/hour. Contact
[sales@geoopt.example.com](mailto:sales@geoopt.example.com) for enterprise limits.
