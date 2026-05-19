# RegRadar — Autonomous Agentic Compliance Platform

RegRadar is a full-stack, AI-driven regulatory compliance platform. It automates the entire lifecycle of regulatory adherence—from parsing complex legal circulars into actionable tasks, to autonomous validation of compliance proofs submitted by various departments.

## 🚀 Key Features

*   **AI-Powered Circular Parsing (Text & PDF):** Automatically ingests regulatory circulars (via raw text or PDF uploads) and uses LangGraph AI agents to extract Mandatory Action Points (MAPs) and assign them to respective departments.
*   **Department Portal & Proof Upload:** Departments (IT, Retail Banking, Legal, etc.) have dedicated portals to view their assigned MAPs and upload proof-of-compliance documents.
*   **Autonomous AI Validation:** Once a department uploads a proof document, an AI auditor automatically validates the document against the original mandate. It generates a confidence score, detailed reasoning, and identifies any missing items.
*   **Deadline Monitoring:** The system autonomously monitors all pending MAPs. If a deadline is breached, it prominently surfaces overdue alerts across the UI (including the interactive pipeline graph and the audit dashboard).
*   **Audit Reporting Dashboard:** Provides Compliance Officers with a high-level view of compliance health, including total evaluated, verified, rejected, and overdue MAPs, alongside deep-dive AI validation reports.
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
*   **Key Libraries:** `multer` (file uploads), `form-data`, `cors`
*   **Location:** `/backend`
*   **Run:** `npm run dev` (Runs on `http://localhost:5000`)
*   **Role:** Acts as the primary database interface and API gateway between the React frontend and the Python AI service.

### 3. AI Service (Python + FastAPI)
*   **Tech:** Python, FastAPI, LangGraph, LangChain
*   **Key Libraries:** `pdfplumber` (PDF parsing), `pydantic` (structured output)
*   **Location:** `/ai_service`
*   **Run:** `uvicorn main:app --reload --port 8000` (Runs on `http://localhost:8000`)
*   **Role:** Hosts the LangGraph state machines for `extraction_graph` (parsing circulars) and `validation_graph` (auditing proof documents). Uses a local LLM via Ollama (OpenAI compatible).

---

## 📂 Project Structure

```text
RegRadar/
├── ai_service/                 # Python FastAPI AI Microservice
│   ├── main.py                 # FastAPI endpoints (/parse, /parse-pdf, /validate)
│   ├── graph.py / extraction_graph.py # LangGraph circular extraction agent
│   ├── validation_graph.py     # LangGraph compliance validation agent
│   └── models.py               # Pydantic schemas for structured LLM output
│
├── backend/                    # Node.js + Express API Server
│   ├── src/
│   │   ├── controllers/        # Route logic (circularController, submissionController)
│   │   ├── models/             # MongoDB Mongoose Schemas (Circular, Submission)
│   │   ├── routes/             # API routing definitions
│   │   └── server.ts           # Express server entry point
│   ├── uploads/                # Temporary local storage for uploaded files
│   └── tsconfig.json
│
└── frontend/                   # React UI Application
    ├── src/
    │   ├── components/         # React Components (AuditDashboard, DepartmentPortal, etc.)
    │   ├── services/           # Axios API client (api.ts)
    │   ├── App.tsx             # Main routing and layout wrapper
    │   └── main.tsx            # React DOM entry
    ├── index.html
    ├── tailwind.config.js
    └── package.json
```

---

## 🛠️ Setup & Installation

### Prerequisites
*   Node.js (v18+)
*   Python (3.9+)
*   MongoDB (Running locally or via MongoDB Atlas)
*   Ollama (For local AI models, e.g., `llama3` or `mistral`)

### 1. Database Setup
Ensure MongoDB is running locally on the default port `27017`. The backend connects to `mongodb://localhost:27017/regradar` by default.

### 2. Start the Node.js Backend
```bash
cd backend
npm install
npm run dev
```
*The server will start on port 5000.*

### 3. Start the Python AI Service
```bash
cd ai_service
pip install fastapi uvicorn pydantic langgraph langchain pdfplumber python-multipart
# Ensure Ollama is running your chosen model (e.g., ollama run llama3)
uvicorn main:app --reload --port 8000
```
*The AI service will start on port 8000.*

### 4. Start the Frontend
```bash
cd frontend
npm install
npm run dev
```
*The frontend will start on port 5173.*

---

## 📡 API Endpoints

### Node Backend (`http://localhost:5000/api`)
*   **Circulars**
    *   `GET /circulars` - Fetch all circulars.
    *   `GET /circulars/overdue` - Fetch all unverified MAPs that have breached their deadline.
    *   `POST /circulars` - Ingest raw text circulars.
    *   `POST /circulars/upload-pdf` - Upload and parse a PDF circular.
*   **Submissions**
    *   `GET /submissions` - Fetch proof submissions (optionally filtered by department).
    *   `POST /submissions` - Submit proof documents. Triggers AI validation synchronously.

### AI Service (`http://localhost:8000`)
*   `POST /parse` - Accepts raw regulatory text, returns a structured JSON of extracted MAPs.
*   `POST /parse-pdf` - Accepts a multipart PDF, extracts text, and returns extracted MAPs.
*   `POST /validate` - Evaluates a proof document against a specific MAP requirement and returns a compliant/rejected verdict with reasoning.

---

## 🧑‍💻 Usage Flow

1.  **Ingest:** Navigate to `Ingest Circular`. Upload a PDF from a regulatory body (e.g., RBI). The AI Service extracts action points, assigns deadlines, and routes them to departments.
2.  **Act:** Navigate to the `Department Portal` (e.g., IT Dept). View assigned MAPs.
3.  **Prove:** Upload a proof-of-compliance document for a specific MAP.
4.  **Validate:** The backend forwards the proof to the AI Service. The AI validates the proof against the mandate and saves the verdict (Verified or Rejected).
5.  **Audit:** Navigate to `Audit Reporting`. View AI reasoning, missing gaps for rejected proofs, and track any MAPs that have exceeded their deadlines.
