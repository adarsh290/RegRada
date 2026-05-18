# RegRadar — API Contract

> Version: 1.0.0  
> Last Updated: 2026-05-15

---

## Service Ports

| Service      | Port  | Base URL                  |
| ------------ | ----- | ------------------------- |
| Backend API  | 5000  | `http://localhost:5000`   |
| AI Service   | 8000  | `http://localhost:8000`   |

---

## AI Service Endpoints (`http://localhost:8000`)

### `GET /health`

Returns the health status of the AI service.

**Response** `200 OK`

```json
{
  "status": "ok",
  "service": "regradar-ai"
}
```

---

### `POST /parse`

Accepts a regulatory circular (PDF or raw text) and returns structured **MAPs** (Measurable Action Points).

**Request**

- **Content-Type:** `multipart/form-data` (for PDF) or `application/json` (for raw text)

| Field   | Type           | Required | Description                                  |
| ------- | -------------- | -------- | -------------------------------------------- |
| `file`  | `file (PDF)`   | No*      | The PDF file of the regulatory circular.     |
| `text`  | `string`       | No*      | Raw text content of the circular.            |

> \* At least one of `file` or `text` must be provided.

**Response** `200 OK`

```json
{
  "source": "RBI/2026-27/01",
  "title": "Guidelines on Digital Lending",
  "date_published": "2026-05-15",
  "maps": [
    {
      "id": "MAP-001",
      "action": "Update KYC verification process for digital loan origination.",
      "department": "Compliance",
      "deadline": "2026-08-15",
      "priority": "high",
      "reference_section": "Section 4.2"
    }
  ]
}
```

#### MAP (Measurable Action Point) Schema

| Field               | Type     | Description                                           |
| ------------------- | -------- | ----------------------------------------------------- |
| `id`                | `string` | Unique identifier for the action point.               |
| `action`            | `string` | Clear, actionable description of what must be done.   |
| `department`        | `string` | Target department or team responsible.                 |
| `deadline`          | `string` | ISO 8601 date string for the compliance deadline.     |
| `priority`          | `string` | One of: `"high"`, `"medium"`, `"low"`.                |
| `reference_section` | `string` | Section/clause in the original circular.              |

---

## Backend Endpoints (`http://localhost:5000`)

### `GET /api/health`

Returns the health status of the backend service.

**Response** `200 OK`

```json
{
  "status": "ok",
  "service": "regradar-backend"
}
```

---

## Data Flow

```
┌─────────────┐      POST /parse       ┌──────────────┐
│   Backend    │ ─────────────────────► │  AI Service  │
│  (port 5000) │ ◄───────────────────── │  (port 8000) │
└─────────────┘      JSON (MAPs)       └──────────────┘
       │
       ▼
  ┌──────────┐
  │ MongoDB  │
  └──────────┘
```
