# Project Context

This document serves as a permanent reference for the RegRadar codebase. It is intended for developers and AI agents — read this before making any changes to avoid redundant codebase scanning.

> Last updated: 2026-05-23 (reflects Phase 1-6 upgrades + Full Re-Audit Bug Fixes)

---

## Project Overview

RegRadar is a full-stack, AI-driven regulatory compliance platform built for banks. A bank purchases the software and gives it to its **Compliance Officer (CO)** to manage and monitor all regulatory obligations. Departments (IT, Retail Banking, Legal, Operations) interact with their own portals to view, complete, or dispute assigned tasks.

The platform automates the entire lifecycle: parsing legal circulars → assigning tasks (MAPs) to departments → validating proof submissions → monitoring deadlines → escalating disputes.

**Tech Stack:**
- **Frontend**: React 19, Vite, TypeScript, TailwindCSS v4
- **Backend**: Node.js, Express, TypeScript, MongoDB (Mongoose), JWT Auth, node-cron, nodemailer
- **AI Service**: Python 3.9+, FastAPI, LangGraph, LangChain, pdfplumber, Ollama (local LLM)

**Quick Start:**
```bash
# From project root — seeds users, starts all 4 services:
start.bat
```

Or manually:
```bash
cd backend && npm run seed       # First time only
cd backend && npm run dev        # http://localhost:5000
cd ai_service && uvicorn main:app --reload --port 8000
cd frontend && npm run dev       # http://localhost:5173
```

---

## Folder Structure

```
RegRadar/
├── start.bat                    # One-click launcher (seeds + starts all services)
├── project_context.md           # This file
├── README.md                    # User-facing documentation
├── api_contract.md              # API endpoint spec
│
├── ai_service/                  # Python FastAPI microservice
│   ├── main.py                  # All AI endpoints
│   ├── graph.py                 # LangGraph extraction agent
│   ├── validation_graph.py      # LangGraph validation agent
│   ├── models.py                # All Pydantic schemas
│   └── requirements.txt
│
├── backend/                     # Node.js/Express API server
│   ├── src/
│   │   ├── controllers/         # Business logic per domain
│   │   │   ├── authController.ts
│   │   │   ├── circularController.ts
│   │   │   ├── submissionController.ts
│   │   │   └── sourceController.ts
│   │   ├── middleware/
│   │   │   └── authMiddleware.ts  # JWT verify + role guard
│   │   ├── models/              # Mongoose schemas
│   │   │   ├── Circular.ts
│   │   │   ├── Submission.ts
│   │   │   ├── User.ts
│   │   │   └── Source.ts
│   │   ├── routes/              # Express routers
│   │   │   ├── authRoutes.ts
│   │   │   ├── circularRoutes.ts
│   │   │   ├── submissionRoutes.ts
│   │   │   └── sourceRoutes.ts
│   │   ├── services/
│   │   │   └── cronService.ts   # Daily email notifications
│   │   ├── scripts/
│   │   │   └── seedUsers.ts     # Seed default user accounts
│   │   └── server.ts            # Express entry point
│   └── uploads/                 # Local file storage for proof docs
│
└── frontend/                    # React UI
    └── src/
        ├── components/          # All page-level components
        │   ├── LoginPage.tsx
        │   ├── AuditDashboard.tsx
        │   ├── DepartmentPortal.tsx
        │   ├── ProofUploadModal.tsx
        │   ├── CircularSubmitForm.tsx
        │   ├── ComplianceInbox.tsx
        │   ├── PipelineGraph.tsx
        │   └── ObligationGraph.tsx
        ├── context/
        │   └── authContext.tsx   # JWT auth state + login/logout
        ├── services/
        │   └── api.ts            # Axios API client
        └── App.tsx               # Auth-gated routing + role-based layout
```

---

## Key Files

| File | What it does | Why it matters |
|---|---|---|
| `backend/src/server.ts` | Express app setup, registers all routes, starts cron | Entry point for backend |
| `backend/src/models/Circular.ts` | Mongoose schema for circulars and their embedded MAPs | Core data structure; MAP has `audit_trail`, `rejection_count`, `escalated` status |
| `backend/src/models/Submission.ts` | Schema for proof submissions | Has `proof_files[]` array, `overridden_by_co`, `co_comment` |
| `backend/src/models/User.ts` | Schema for auth users | Roles: `CO` or `DEPARTMENT`; stores `department_name` |
| `backend/src/controllers/circularController.ts` | All circular logic incl. reject & assign | Contains `rejectMAP` (triggers AI re-eval) and `assignMAP` (CO override) |
| `backend/src/controllers/submissionController.ts` | Proof submission + AI validation trigger | Contains `overrideSubmissionVerdict` (CO override) |
| `backend/src/controllers/authController.ts` | Register, login, getMe | Issues JWT tokens |
| `backend/src/middleware/authMiddleware.ts` | `authenticate` + `requireCO` guards | Applied to protected routes |
| `backend/src/services/cronService.ts` | Daily cron at 08:00 AM | Sends email alerts for overdue + escalated MAPs |
| `backend/src/scripts/seedUsers.ts` | Seeds 5 default accounts | Run via `npm run seed`; idempotent |
| `ai_service/main.py` | All FastAPI endpoints | Key: `/validate` (multi-doc), `/reevaluate` (dispute resolution) |
| `ai_service/models.py` | All Pydantic schemas | `ReevaluationVerdict` is new; used by `/reevaluate` |
| `frontend/src/context/authContext.tsx` | Auth state, persists to localStorage | Must wrap entire app |
| `frontend/src/App.tsx` | Auth gate + role-based routing | CO gets all routes; DEPARTMENT gets only their portal |
| `frontend/src/components/LoginPage.tsx` | Login screen | Shows default credentials for dev convenience |
| `frontend/src/components/AuditDashboard.tsx` | CO audit view | Has "Action Required" escalation panel + CO override buttons |
| `frontend/src/components/DepartmentPortal.tsx` | Department task view | Has "Reject Task" flow + audit trail display |
| `frontend/src/components/ProofUploadModal.tsx` | Multi-file upload modal | Supports up to 5 files with drag-and-drop file manager |

---

## Data Models / Types

### MAP (embedded in Circular)
```typescript
interface IMAP {
  map_id: string;              // e.g. "MAP-001"
  action_title: string;
  department: string;          // Current assigned dept
  assigned_to: string;         // May differ after re-assignment
  deadline: string;            // ISO date string
  priority: "high" | "medium" | "low";
  status: "pending" | "in_progress" | "submitted" | "verified" | "rejected" | "escalated";
  rejection_count: number;     // Triggers escalation at 2
  audit_trail: [{              // Full history of actions on this MAP
    action: string;            // e.g. "Rejected", "AI Re-evaluation", "Manual Override"
    by: string;                // Who did it
    comment: string;           // Reason / AI reasoning
    timestamp: Date;
  }];
}
```

### Submission
```typescript
interface ISubmission {
  circular_id: ObjectId;
  map_id: string;
  department: string;
  proof_files: [{ file_path, original_filename, file_size }]; // Array (up to 5)
  status: "submitted" | "verified" | "rejected";
  ai_verdict?: { is_compliant, confidence, reasoning, missing_items, verdict };
  overridden_by_co: boolean;   // True if CO manually overrode AI verdict
  co_comment: string;          // CO's reason for override
}
```

### User
```typescript
interface IUser {
  username: string;            // lowercase, unique
  password_hash: string;       // bcrypt hashed
  role: "CO" | "DEPARTMENT";
  department_name?: string;    // Required for DEPARTMENT role
  email?: string;
}
```

### AI Pydantic Models (`ai_service/models.py`)
- `MeasurableActionPoint`: `action_title`, `department`, `deadline`, `priority`
- `CircularExtraction`: `summary`, `maps[]`, `extraction_mode`
- `ValidationVerdict`: `is_compliant`, `confidence`, `reasoning`, `missing_items`, `verdict`
- `ReevaluationVerdict`: `assigned_department`, `reasoning` ← **NEW**
- `DependencyResult`: `edges[]` with `from_map_index`, `to_map_index`, `constraint`

---

## API / Functions / Routes

### Auth (`/api/auth`)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/login` | Login; returns `{ token, user }` |
| POST | `/register` | Create user |
| GET | `/me` | Current user (requires Bearer token) |

### Circulars (`/api/circulars`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | All circulars |
| GET | `/overdue` | MAPs past deadline, not verified |
| POST | `/` | Ingest raw text circular |
| POST | `/upload-pdf` | Ingest PDF circular |
| POST | `/:cId/maps/:mId/reject` | Dept rejects MAP; AI re-evaluates |
| PUT | `/:cId/maps/:mId/assign` | CO force-assigns MAP to dept |

### Submissions (`/api/submissions`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | All submissions (`?department=X` filter) |
| POST | `/` | Submit proof files (up to 5); triggers AI validation |
| GET | `/circular/:cId` | Submissions for a circular |
| PUT | `/:id/override` | CO overrides AI verdict |

### AI Service (`:8000`)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/parse` | Parse text circular → MAPs |
| POST | `/parse-pdf` | Parse PDF circular → MAPs |
| POST | `/validate` | Validate multi-doc proof vs MAP mandate |
| POST | `/reevaluate` | Re-evaluate rejected MAP assignment |
| POST | `/detect-dependencies` | Find sequencing constraints between MAPs |
| POST | `/scrape-source` | Scrape circular from URL |

---

## State Management / Architecture Patterns

- **Microservices**: Frontend → Node API (data + auth) → Python AI Service (inference only)
- **Auth flow**: Login → JWT → stored in `localStorage` → attached to all Axios requests via `axios.defaults.headers`
- **Role-based routing**: `AuthGate` in `App.tsx` renders `LoginPage` if unauthenticated, then routes CO vs DEPARTMENT to different views
- **Rejection workflow**: Department rejects → backend calls `/reevaluate` → AI re-assigns or insists → logged to `audit_trail` → if 2nd rejection → status=`escalated` → CO sees "Action Required"
- **AI validation**: Backend collects all proof files → POSTs them all as `proof_files[]` to `/validate` → AI concatenates text from all docs → runs `validation_graph`
- **Cron**: `startCronService()` called in `server.ts` after DB connect → runs daily at 08:00 → queries overdue + escalated → sends HTML emails via nodemailer

---

## External Dependencies & Why

| Package | Purpose |
|---|---|
| `LangGraph` + `LangChain` | Stateful AI agent workflows (extraction + validation) |
| `pdfplumber` | Extract raw text from PDF files in AI service |
| `mongoose` | MongoDB ODM in Node backend |
| `multer` | Multipart file upload handling in Express |
| `bcrypt` | Secure password hashing |
| `jsonwebtoken` | Stateless JWT auth tokens |
| `node-cron` | Daily scheduled notification job |
| `nodemailer` | HTML email dispatch (dev: Ethereal, prod: SMTP) |
| `@xyflow/react` | Interactive pipeline graph visualization |
| `axios` | HTTP client (frontend + backend→AI service) |

---

## Conventions & Coding Style

- **TypeScript**: All backend and frontend code. Controllers use `async/await` with explicit `return` to prevent Express response-after-send errors.
- **Python/Pydantic**: All AI service schemas use `.with_structured_output()` for type-safe LLM responses.
- **Consistent error format**: All API errors return `{ error: string }` JSON.
- **Idempotent seeding**: `seedUsers.ts` skips existing usernames — safe to re-run.
- **Audit trail pattern**: Every action on a MAP (rejection, re-assignment, override) appends to `audit_trail[]` — never overwrites.
- **No auth on AI service**: The Python service is internal only (no public exposure). Auth is enforced at the Node gateway.

---

## Known Issues / TODOs / Gotchas

- **Ollama Required**: The AI service needs `ollama run llama3.1` running before any parse/validate/reevaluate calls will work.
- **Full API Route Security**: The auth middleware (`authenticate` and `requireCO`) is rigorously applied across all routes. CO-only actions and departmental portals are fully isolated and protected against IDOR.
- **File storage is local**: Uploaded proof files live in `backend/uploads/`. No S3 or cloud storage. Files persist across restarts but are not backed up.
- **Multi-doc text concatenation**: All proof files are byte-concatenated before sending to the validation graph. Very large batches (e.g., 5 × 10MB PDFs) may cause context window issues with smaller local models.
- **Dependency detection cap**: Hard-capped at 10 MAPs to prevent context overflow.
- **Ethereal email in dev**: Cron emails go to Ethereal (fake inbox) by default. Set `SMTP_*` env vars in `backend/.env` for real delivery.
- **MongoDB must be running**: On default port `27017`. No connection pooling config — suitable for dev/staging, not production scale.
