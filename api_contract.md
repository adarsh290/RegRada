# RegRadar — API Contract

> Version: 1.1.0  
> Last Updated: 2026-05-23  

---

## Service Ports

| Service      | Port  | Base URL                  |
| ------------ | ----- | ------------------------- |
| Backend API  | 5000  | `http://localhost:5000`   |
| AI Service   | 8000  | `http://localhost:8000`   |

---

## Shared Schemas

### 1. MAP (Measurable Action Point) Schema

This represents a compliance mandate extracted from a circular.

| Field | Type | Description |
| --- | --- | --- |
| `map_id` | `string` | Unique identifier (e.g. `${circular._id.slice(-6)}-MAP-001`). |
| `action_title` | `string` | Actionable description of what must be done. |
| `department` | `string` | Responsible department (e.g. `"Compliance Officer"`, `"IT"`, `"Legal"`). |
| `deadline` | `string` | ISO 8601 date string for the compliance deadline. |
| `priority` | `string` | One of: `"high"`, `"medium"`, `"low"`. |
| `status` | `string` | One of: `"pending_review"`, `"pending"`, `"in_progress"`, `"submitted"`, `"verified"`, `"rejected"`, `"escalated"`. |
| `assigned_to` | `string` | The user name or team assigned to this MAP. |
| `rejection_count` | `number` | Counter representing how many times this MAP's proof has been rejected. |
| `needs_co_review` | `boolean` | Flag set if compliance officer review is necessary. |

### 2. Validation Verdict Schema

| Field | Type | Description |
| --- | --- | --- |
| `is_compliant` | `boolean` | True if the proof document satisfactorily demonstrates compliance. |
| `confidence` | `number` | Confidence score between `0.0` and `1.0`. |
| `reasoning` | `string` | A detailed text explanation behind the compliance decision. |
| `missing_items` | `string[]` | List of items or criteria missing from the submission. |
| `verdict` | `string` | Ultimate state of compliance: `"verified"` or `"rejected"`. |
| `evaluated_at` | `string` | ISO 8601 timestamp representing when the validation occurred. |

---

## AI Service Endpoints (`http://localhost:8000`)

> [!NOTE]
> All non-health check AI endpoints require internal authentication via the `X-Internal-Token` header.

### `GET /health`
Returns the health status of the AI service. No authentication required.

**Response** `200 OK`
```json
{
  "status": "ok",
  "service": "regradar-ai"
}
```

### `POST /parse`
Parses raw text and returns structured circular metadata and compliance action points.
* **Content-Type:** `application/json`

**Request Body:**
```json
{
  "text": "The raw text of the circular to parse..."
}
```

**Response** `200 OK`
```json
{
  "summary": "Concise summary of the guidelines...",
  "maps": [
    {
      "map_id": "MAP-001",
      "action_title": "Implement multi-factor authentication for digital transactions.",
      "department": "IT",
      "deadline": "2026-12-31",
      "priority": "high"
    }
  ],
  "extraction_mode": "llm_openai"
}
```

### `POST /parse-pdf`
Extracts raw text and parses compliance action points from a PDF file.
* **Content-Type:** `multipart/form-data`

**Request Payload:**
* `pdf_file` (Binary PDF File) - Mandatory. Limit 20 MB.

**Response** `200 OK`
```json
{
  "summary": "Concise summary of the circular guidelines...",
  "maps": [
    {
      "map_id": "MAP-001",
      "action_title": "Perform quarterly vulnerability assessment.",
      "department": "IT",
      "deadline": "2026-09-30",
      "priority": "medium"
    }
  ],
  "raw_text": "Full extracted plain text of the circular pdf document...",
  "extraction_mode": "llm_openai"
}
```

### `POST /validate`
Performs LLM-based evaluation of compliance proof documents against a target MAP constraint.
* **Content-Type:** `multipart/form-data`

**Request Payload:**
* `proof_files` (Binary File Array) - Max 5 files, total limit 50MB.
* `original_map_action` (string) - Mandated action description.
* `original_map_department` (string) - Mandated department.

**Response** `200 OK`
```json
{
  "is_compliant": true,
  "confidence": 0.95,
  "reasoning": "The uploaded SLA document contains the verified signatures...",
  "missing_items": [],
  "verdict": "verified"
}
```

### `POST /detect-amendments`
Compares a new circular against prior ones inside the database (semantic/regex match) and computes a delta report.
* **Content-Type:** `application/json`

**Request Body:**
```json
{
  "circular_id": "603d2e1c9e831f24d86b84ac",
  "circular_source": "RBI/2026-27/02",
  "circular_title": "Amended Digital Lending Rules",
  "raw_text": "Raw text of the amending circular...",
  "maps": [
    {
      "map_id": "MAP-001",
      "action_title": "Update KYC rules",
      "department": "Compliance",
      "deadline": "2026-10-15",
      "priority": "high"
    }
  ]
}
```

**Response** `200 OK`
```json
{
  "amends_circular_id": "603d2dfa9e831f24d86b84aa",
  "delta_report": {
    "deadline_changes": [
      {
        "map_id": "MAP-002",
        "old_deadline": "2026-08-15",
        "new_deadline": "2026-10-15"
      }
    ],
    "clause_modifications": [
      {
        "map_id": "MAP-001",
        "summary": "KYC checks now allow video call verification."
      }
    ],
    "obligations_added": ["MFA compliance check"],
    "obligations_removed": [],
    "generated_at": "2026-05-23T02:00:00Z"
  }
}
```

### `POST /detect-conflicts`
Checks for logical deadline, requirement, or jurisdictional overlaps between the current circular and existing ones.
* **Content-Type:** `application/json`

**Request Body:**
```json
{
  "circular_id": "603d2e1c9e831f24d86b84ac",
  "maps": [...]
}
```

**Response** `200 OK`
```json
{
  "conflicts": [
    {
      "map_id_a": "MAP-001",
      "circular_id_a": "603d2e1c9e831f24d86b84ac",
      "map_id_b": "MAP-003",
      "circular_id_b": "603d2dfa9e831f24d86b84aa",
      "conflict_type": "deadline_conflict",
      "explanation": "IT department has two contradictory implementation deadlines.",
      "severity": "high"
    }
  ]
}
```

### `POST /detect-dependencies`
Analyzes a list of MAPs and computes sequencing constraints (prerequisites) between them.
* **Content-Type:** `application/json`

**Request Body:**
```json
{
  "maps": [
    { "index": 0, "title": "Configure the server", "department": "IT" },
    { "index": 1, "title": "Run security audits on configure", "department": "Security" }
  ]
}
```

**Response** `200 OK`
```json
{
  "edges": [
    {
      "from_map_index": 0,
      "to_map_index": 1,
      "constraint": "Server configuration must be complete before auditing starts."
    }
  ]
}
```

### `POST /query-maps`
Performs hybrid semantic search & LLM-based query filtering over compliance obligations.
* **Content-Type:** `application/json`

**Request Body:**
```json
{
  "query": "Obligations regarding transaction limits in digital banking",
  "top_k": 5
}
```

**Response** `200 OK`
```json
{
  "results": [
    {
      "map_id": "MAP-002",
      "circular_id": "603d2dfa9e831f24d86b84aa",
      "circular_title": "Master Direction - Digital Payment Security Controls",
      "circular_source": "RBI/2025-26/18",
      "action_title": "Set limit of Rs 50,000 per transaction for retail users.",
      "department": "Retail Banking",
      "deadline": "2026-07-01",
      "priority": "high",
      "relevance_score": 0.98,
      "relevance_reason": "Matches transaction limits precisely for digital channel controls."
    }
  ]
}
```

### `POST /scrape-source`
Downloads and scrapes HTML/text contents securely from a trusted web source.
* **Content-Type:** `application/json`

**Request Body:**
```json
{
  "url": "https://www.rbi.org.in/Scripts/NotificationUser.aspx?Id=12543"
}
```

**Response** `200 OK`
```json
{
  "summary": "Guidelines on Digital Payments Security",
  "maps": [
    {
      "map_id": "MAP-001",
      "action_title": "Ensure secure network operations.",
      "department": "IT",
      "deadline": "2026-10-31",
      "priority": "high"
    }
  ],
  "extraction_mode": "llm_openai",
  "scraped_url": "https://www.rbi.org.in/Scripts/NotificationUser.aspx?Id=12543"
}
```

### `POST /reevaluate`
Re-evaluates a MAP that has been rejected by a department to decide whether to reassign it or insist on the current assignment.
* **Content-Type:** `application/json`

**Request Body:**
```json
{
  "action_title": "Update transaction processing rules",
  "current_department": "IT",
  "rejection_reason": "We do not handle transaction logic, this belongs to Operations."
}
```

**Response** `200 OK`
```json
{
  "reassign": true,
  "suggested_department": "Operations",
  "reasoning": "Transaction logic processing rules typically fall under Operations rather than general IT infrastructure."
}
```

---

## Backend Endpoints (`http://localhost:5000`)

> [!IMPORTANT]
> All backend API endpoints (except health and specific auth routes) expect user credentials. Authentication is maintained via standard `httpOnly` secure session cookies (`token`) or bearer headers.

### Auth Module

#### `POST /api/auth/register`
Registers a new system user. CO only.
```json
{
  "username": "dept_head_operations",
  "password": "SecurePassword123!",
  "role": "DEPARTMENT",
  "department_name": "Operations"
}
```

#### `POST /api/auth/login`
Authenticates a user, returns user details, and sets an `httpOnly` cookie.
```json
{
  "username": "compliance_director",
  "password": "SecurePassword123!"
}
```

#### `POST /api/auth/logout`
Clears session cookie and invalidates authentication.

#### `GET /api/auth/me`
Retrieves details of the currently signed-in session user.

---

### Circulars Module

#### `GET /api/circulars`
Fetches a list of all ingested regulatory circulars in reverse chronological order.

#### `GET /api/circulars/:id`
Retrieves full details of a specific circular, including its MAPs and delta reports.

#### `POST /api/circulars`
Ingests a new circular using raw string content. CO only.
```json
{
  "title": "RBI digital security controls",
  "source": "RBI/2026-27/04",
  "raw_text": "Raw circular body text goes here..."
}
```

#### `POST /api/circulars/upload-pdf`
Ingests a circular by uploading a PDF document. CO only.
* **Content-Type:** `multipart/form-data`
* **Payload:** `pdf_file` (Binary PDF File)

#### `GET /api/circulars/overdue`
Fetches all MAPs that have exceeded their compliance deadline and are not yet `"verified"`.

#### `GET /api/circulars/conflicts`
Fetches all detected, unresolved conflicts across all active circulars.

#### `POST /api/circulars/query`
Sends a natural language search query to find compliance obligations.
```json
{ "query": "What are the rules regarding data backups?" }
```

#### `GET /api/circulars/:id/obligation-graph`
Computes and returns a DAG (Directed Acyclic Graph) of obligations representing sequencing constraints.

#### `PUT /api/circulars/:circularId/maps/:mapId/assign`
Assigns a specific department or handler to a MAP. CO only.
```json
{ "assigned_to": "IT Dept" }
```

#### `PUT /api/circulars/:circularId/maps/:mapId/approve`
Approves a MAP, marking it as 'verified'. CO only.

#### `POST /api/circulars/:circularId/maps/:mapId/reject`
Rejects a MAP obligation and escalates/signals back to compliance officer.
```json
{ "reason": "We do not handle public network server infrastructures." }
```

#### `PUT /api/circulars/:id/conflicts/:conflictIndex/resolve`
Resolves a conflict report at the specified index. CO only.
```json
{ "resolved_by_co": "compliance_director" }
```

---

### Sources Module

#### `GET /api/sources`
Fetches a list of all configured sources.

#### `POST /api/sources`
Adds a new source configuration. CO only.
```json
{
  "name": "RBI Notifications",
  "url": "https://www.rbi.org.in/..."
}
```

#### `POST /api/sources/:id/scrape`
Invokes the AI service to fetch and extract regulatory circulars from the specific source URL. CO only.

---

### Submissions Module

#### `POST /api/submissions`
Department uploads proof-of-compliance files. Automatically triggers AI validation against map constraints.
* **Content-Type:** `multipart/form-data`
* **Payload:**
  * `proof_files` (Binary File Array) - Limit 5 files.
  * `circular_id` (string)
  * `map_id` (string)
  * `notes` (string)

#### `GET /api/submissions`
Fetches a list of submissions. Optional query parameter `?department=` filters by assigned department.

#### `GET /api/submissions/circular/:circularId`
Fetches all submissions associated with a specific regulatory circular.

#### `PUT /api/submissions/:id/override`
Compliance officer overrides the AI verdict (verifying or rejecting proof manually). CO only.
```json
{
  "verdict": "verified",
  "comment": "Manually verified the physical firewalls listed in document..."
}
```

---

### Files Module

#### `GET /api/files/:filename`
Authenticates the user and streams the requested compliance document or proof directly from the secure uploads folder.
