# RegRadar — Autonomous Agentic Compliance Platform

RegRadar is a full-stack, AI-driven regulatory compliance platform. It automates the entire lifecycle of regulatory adherence—from parsing complex legal circulars into actionable tasks, to autonomous validation of compliance proofs submitted by various departments—backed by role-based access control, automated notifications, and full audit trails.

---

## 🚀 Key Features

*   **AI-Powered Circular Parsing (Text & PDF):** Automatically ingests regulatory circulars (via raw text or PDF uploads) and uses LangGraph AI agents to extract Mandatory Action Points (MAPs) and assign them to respective departments.
*   **Department Portal & Multi-Document Proof Upload:** Departments (IT, Retail Banking, Legal, etc.) have dedicated portals to view their assigned MAPs and upload up to **5 proof-of-compliance documents** per submission (PDF, TXT, DOC, DOCX).
*   **Autonomous AI Validation:** Once a department uploads proof, an AI auditor automatically validates the combined document context against the original mandate. It generates a confidence score, detailed reasoning, and identifies any missing items.
*   **Rejection Workflow & AI Re-Assignment:** If a department disputes a task, they provide a reason. The AI autonomously re-evaluates and either re-assigns the task to the correct department or insists on the original assignment with a detailed explanation. Every action is recorded in the MAP's **Audit Trail**.
*   **Escalation to Compliance Officer:** If a department rejects a task twice, it escalates automatically to the Compliance Officer's **Action Required** queue for manual intervention.
*   **Compliance Officer (CO) Override Controls:** The CO has full override capability — they can force-assign escalated tasks to any department and override any AI validation verdict (Verified or Rejected).
*   **Deadline Monitoring & Automated Notifications:** The system autonomously monitors all pending MAPs. A daily cron job emails the CO with overdue and escalated MAP reports. Overdue alerts also surface prominently in the UI.
*   **Audit Reporting Dashboard:** Provides Compliance Officers with a high-level view of compliance health, including total evaluated, verified, rejected, and overdue MAPs, alongside deep-dive AI validation reports and the full audit trail.
*   **Role-Based Access Control (RBAC):** JWT-based authentication. The CO sees all dashboards and controls. Department users are locked to their own portal with no access to audit or CO-only views.
*   **Live Pipeline Visualization:** A React Flow-powered interactive graph that visualizes the flow of data from regulators (RBI, SEBI) through the AI agents and down to the departments.

---

## 🏗️ Architecture & Tech Stack

RegRadar is built using a modern, decoupled microservices architecture:

### 1. Frontend (React + Vite)
*   **Tech:** React, Vite, TypeScript, TailwindCSS
*   **Key Libraries:** `lucide-react` (icons), `@xyflow/react` (pipeline visualization), `axios` (API client), `react-router-dom`
*   **Location:** `/frontend`
*   **Run:** `npm run dev` (Runs on `http://localhost:5173`)

### 2. Node.js Backend (Express)
*   **Tech:** Node.js, Express, TypeScript, MongoDB (Mongoose)
*   **Key Libraries:** `multer` (file uploads), `bcrypt` (password hashing), `jsonwebtoken` (auth), `node-cron` (scheduled jobs), `nodemailer` (email), `form-data`, `cors`
*   **Location:** `/backend`
*   **Run:** `npm run dev` (Runs on `http://localhost:5000`)
*   **Role:** Primary API gateway, database interface, authentication server, and notification scheduler.

### 3. AI Service (Python + FastAPI)
*   **Tech:** Python, FastAPI, LangGraph, LangChain
*   **Key Libraries:** `pdfplumber` (PDF parsing), `pydantic` (structured output)
*   **Location:** `/ai_service`
*   **Run:** `uvicorn main:app --reload --port 8000` (Runs on `http://localhost:8000`)
*   **Role:** Hosts LangGraph state machines for extraction, validation, and re-evaluation of disputed tasks. Uses a local LLM via Ollama (OpenAI compatible).

---

## 📂 Project Structure

```text
RegRadar/
├── start.bat                   # ⚡ One-click launcher for ALL services
├── ai_service/                 # Python FastAPI AI Microservice
│   ├── main.py                 # FastAPI endpoints (/parse, /parse-pdf, /validate, /reevaluate, /detect-dependencies, /scrape-source)
│   ├── graph.py                # LangGraph circular extraction agent
│   ├── validation_graph.py     # LangGraph compliance validation agent
│   └── models.py               # Pydantic schemas (MAP, ValidationVerdict, ReevaluationVerdict, etc.)
│
├── backend/                    # Node.js + Express API Server
│   ├── src/
│   │   ├── controllers/        # Route logic (circularController, submissionController, authController, sourceController)
│   │   ├── middleware/         # authMiddleware.ts (JWT verify, requireCO guard)
│   │   ├── models/             # MongoDB Mongoose Schemas (Circular, Submission, User, Source)
│   │   ├── routes/             # API routing (circularRoutes, submissionRoutes, authRoutes, sourceRoutes)
│   │   ├── services/           # cronService.ts (daily email notifications)
│   │   ├── scripts/            # seedUsers.ts (seeds default accounts)
│   │   └── server.ts           # Express entry point
│   └── uploads/                # Local storage for uploaded proof files
│
└── frontend/                   # React UI Application
    ├── src/
    │   ├── components/         # React Components (AuditDashboard, DepartmentPortal, LoginPage, ProofUploadModal, etc.)
    │   ├── context/            # authContext.tsx (JWT auth state, login/logout)
    │   ├── services/           # api.ts (Axios API client)
    │   ├── App.tsx             # Auth-gated routing and layout wrapper
    │   └── main.tsx            # React DOM entry
    └── package.json
```

---

## 🛠️ Setup & Installation

### Prerequisites
*   Node.js (v18+)
*   Python (3.9+)
*   MongoDB (Running locally or via MongoDB Atlas)
*   Ollama (For local AI models — `ollama pull llama3.1`)

### ⚡ Quick Start (Recommended)
The easiest way to run everything at once is the one-click launcher at the root of the project:

```bash
# From the RegRadar/ root folder — just double-click or run:
start.bat
```

This will automatically:
1. **Seed** the MongoDB database with default user accounts (skips if already done)
2. **Launch** Ollama, the Node Backend, the AI Service, and the React Frontend — each in their own terminal window.

### Manual Setup

#### 1. Seed the Database (first time only)
```bash
cd backend && npm install && npm run seed
```

#### 2. Start the Node.js Backend
```bash
cd backend && npm run dev   # http://localhost:5000
```

#### 3. Start the Python AI Service
```bash
cd ai_service
pip install -r requirements.txt
ollama run llama3.1         # In a separate terminal
uvicorn main:app --reload --port 8000
```

#### 4. Start the Frontend
```bash
cd frontend && npm install && npm run dev   # http://localhost:5173
```

---

## 🔑 Default Login Credentials

After seeding, use these to log in:

| Username              | Password          | Role / Department     |
|-----------------------|-------------------|-----------------------|
| `compliance.officer`  | `CO@RegRadar2026` | Compliance Officer    |
| `it.dept`             | `IT@RegRadar2026` | IT Dept               |
| `retail.banking`      | `RB@RegRadar2026` | Retail Banking        |
| `legal.dept`          | `Legal@RegRadar2026` | Legal Dept         |
| `operations`          | `Ops@RegRadar2026`| Operations            |

---

## 📡 API Endpoints

### Authentication (`/api/auth`)
*   `POST /login` — Login with username/password. Returns a JWT token.
*   `POST /register` — Register a new user (CO or Department).
*   `GET /me` — Returns the current authenticated user's profile.

### Circulars (`/api/circulars`)
*   `GET /` — Fetch all circulars.
*   `GET /overdue` — Fetch all unverified MAPs past their deadline.
*   `POST /` — Ingest raw text circular.
*   `POST /upload-pdf` — Upload and parse a PDF circular.
*   `POST /:circularId/maps/:mapId/reject` — Department rejects a MAP with a reason. Triggers AI re-evaluation.
*   `PUT /:circularId/maps/:mapId/assign` — CO force-assigns a MAP to a department.

### Submissions (`/api/submissions`)
*   `GET /` — Fetch submissions (optionally filtered by `?department=`).
*   `POST /` — Submit up to 5 proof files. Triggers AI validation synchronously.
*   `PUT /:id/override` — CO manually overrides an AI verdict.

### AI Service (`http://localhost:8000`)
*   `POST /parse` — Extract MAPs from raw regulatory text.
*   `POST /parse-pdf` — Extract MAPs from an uploaded PDF.
*   `POST /validate` — Validate one or more proof documents against a MAP mandate.
*   `POST /reevaluate` — Re-evaluate a rejected MAP given a department's rejection reason.
*   `POST /detect-dependencies` — Detect sequencing constraints between MAPs.
*   `POST /scrape-source` — Fetch and parse a circular directly from a regulatory URL.

---

## 🧑‍💻 Usage Flow

1.  **Login:** Navigate to the app. Log in as a `Compliance Officer` or a specific `Department` user.
2.  **Ingest (CO only):** Navigate to `Ingest Circular`. Upload a PDF from a regulatory body (e.g., RBI). The AI extracts action points, assigns deadlines, and routes them to departments.
3.  **Act:** Log in as a department (e.g., `IT Dept`). View your assigned MAPs.
4.  **Prove or Reject:** Upload up to 5 proof documents for a MAP, or reject the task with a reason. If rejected, the AI automatically re-evaluates the assignment.
5.  **Escalate:** If a task is rejected twice, it escalates to the CO's **Action Required** panel.
6.  **Override (CO only):** In `Audit Reporting`, the CO can force-assign escalated tasks or override any AI verdict.
7.  **Audit:** View AI reasoning, missing gaps, audit trails, and track overdue MAPs in `Audit Reporting`.

---

## 🔔 Automated Notifications

A background cron job runs **daily at 08:00 AM** and sends email alerts to the Compliance Officer for:
- Overdue MAPs (past deadline and unverified)
- Escalated MAPs (disputed twice, awaiting manual review)

Configure your SMTP settings in `backend/.env`:
```env
SMTP_HOST=smtp.yourmailserver.com
SMTP_PORT=587
SMTP_USER=your@email.com
SMTP_PASS=yourpassword
CO_EMAIL=co@yourcompany.com
```
> By default (in dev), emails are routed to **Ethereal** (a safe mail catcher) — no real emails are sent.
