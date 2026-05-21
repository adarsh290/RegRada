import logging
import io
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
import uvicorn

from models import CircularExtraction, ValidationVerdict, DependencyResult, ReevaluationVerdict, ReevaluateRequest
from graph import extraction_graph
from validation_graph import validation_graph

# ── Logging ─────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s │ %(name)-18s │ %(levelname)-7s │ %(message)s",
)

app = FastAPI(
    title="RegRadar AI Service",
    description="AI-powered regulatory circular parser and compliance validator",
    version="3.0.0",
)


# ── Request Model ──────────────────────────────────────────
class TextIngestRequest(BaseModel):
    title: str
    source: str
    raw_text: str

class ScrapeRequest(BaseModel):
    url: str

class ParseRequest(BaseModel):
    text: str


# ── Health ──────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok", "service": "regradar-ai", "version": "3.0.0"}


# ── Parse Endpoint ──────────────────────────────────────────
@app.post("/parse", response_model=CircularExtraction)
async def parse_circular(payload: ParseRequest):
    """
    Accepts raw text of a regulatory circular and returns
    structured MAPs (Measurable Action Points) via the LangGraph pipeline.
    """
    if not payload.text or not payload.text.strip():
        raise HTTPException(
            status_code=400,
            detail="'text' field must be a non-empty string.",
        )

    graph_output = extraction_graph.invoke({
        "raw_text": payload.text,
        "extracted_data": {},
        "errors": [],
    })

    if graph_output.get("errors"):
        for err in graph_output["errors"]:
            logging.getLogger("parse").warning(f"Graph error: {err}")

    return graph_output["extracted_data"]


# ── Parse PDF Endpoint ──────────────────────────────────────
@app.post("/parse-pdf", response_model=CircularExtraction)
async def parse_circular_pdf(
    pdf_file: UploadFile = File(...),
):
    """
    Accepts a PDF upload of a regulatory circular.
    Extracts text via pdfplumber, then runs the same extraction pipeline.
    """
    if not pdf_file.filename or not pdf_file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")

    file_bytes = await pdf_file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded PDF is empty.")

    # Extract text from the PDF
    try:
        import pdfplumber
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            pages = [page.extract_text() or "" for page in pdf.pages]
            raw_text = "\n".join(pages).strip()
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"PDF text extraction failed: {e}")

    if not raw_text:
        raise HTTPException(
            status_code=422,
            detail="No extractable text found in the PDF. It may be scanned or image-only.",
        )

    logging.getLogger("parse-pdf").info(
        f"Extracted {len(raw_text)} chars from '{pdf_file.filename}' ({len(pdf.pages)} pages)"
    )

    graph_output = extraction_graph.invoke({
        "raw_text": raw_text,
        "extracted_data": {},
        "errors": [],
    })

    if graph_output.get("errors"):
        for err in graph_output["errors"]:
            logging.getLogger("parse-pdf").warning(f"Graph error: {err}")

    return graph_output["extracted_data"]


# ── Validate Endpoint ───────────────────────────────────────
@app.post("/validate", response_model=ValidationVerdict)
async def validate_proof(
    proof_files: list[UploadFile] = File(...),
    original_map_action: str = Form(...),
    original_map_department: str = Form(...),
):
    """
    Accepts one or more uploaded proof documents (PDF or TXT) and the original MAP mandate.
    Extracts text from all files and concatenates them into a single unified context,
    then runs validation_graph to evaluate combined compliance.
    """
    if not original_map_action.strip():
        raise HTTPException(status_code=400, detail="original_map_action must not be empty.")
    if not proof_files:
        raise HTTPException(status_code=400, detail="At least one proof file is required.")

    combined_bytes = b""
    combined_filename = ", ".join(f.filename or "proof" for f in proof_files)

    for proof_file in proof_files:
        file_bytes = await proof_file.read()
        if not file_bytes:
            continue
        combined_bytes += file_bytes + b"\n\n--- NEXT DOCUMENT ---\n\n"

    if not combined_bytes:
        raise HTTPException(status_code=400, detail="All uploaded files are empty.")

    graph_output = validation_graph.invoke({
        "original_map_action": original_map_action,
        "original_map_department": original_map_department,
        "proof_bytes": combined_bytes,
        "proof_filename": combined_filename,
        "proof_text": "",
        "verdict": {},
        "errors": [],
    })

    if graph_output.get("errors"):
        for err in graph_output["errors"]:
            logging.getLogger("validate").warning(f"Graph error: {err}")

    verdict_data = graph_output.get("verdict", {})
    if not verdict_data:
        raise HTTPException(status_code=500, detail="Validation graph returned no verdict.")

    return verdict_data


# ── Reevaluate Endpoint ─────────────────────────────────────
@app.post("/reevaluate", response_model=ReevaluationVerdict)
async def reevaluate_map(req: ReevaluateRequest):
    """
    Accepts a rejected MAP's details and the department's rejection reason.
    Uses LLM to decide whether to assign to a new department or insist on the current one.
    """
    from langchain_openai import ChatOpenAI
    from langchain_core.prompts import ChatPromptTemplate
    
    prompt = ChatPromptTemplate.from_messages([
        ("system", 
         "You are a regulatory compliance routing expert. "
         "A department has rejected a compliance task. Evaluate their rejection reason against the task description. "
         "If their rejection is valid, determine the correct department. If it is invalid, assign it back to them with clear reasoning. "
         "Provide the assigned_department and reasoning."
        ),
        ("human", 
         "Task: {action_title}\n"
         "Rejecting Department: {current_department}\n"
         "Rejection Reason: {rejection_reason}"
        )
    ])
    
    try:
        llm = ChatOpenAI(
            base_url="http://localhost:11434/v1",
            api_key="ollama",
            model="llama3.1",
            temperature=0,
        ).with_structured_output(ReevaluationVerdict)
        
        chain = prompt | llm
        result = chain.invoke({
            "action_title": req.action_title,
            "current_department": req.current_department,
            "rejection_reason": req.rejection_reason
        })
        return result
    except Exception as e:
        logging.getLogger("reevaluate").error(f"Re-evaluation failed: {e}")
        raise HTTPException(status_code=500, detail="Re-evaluation failed.")


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)


# ── Dependency Detection Endpoint ─────────────────────────

class MAPSummary(BaseModel):
    index: int
    title: str
    department: str

class DependencyRequest(BaseModel):
    maps: list[MAPSummary]

@app.post("/detect-dependencies", response_model=DependencyResult)
async def detect_dependencies(req: DependencyRequest):
    """
    Accepts a compact list of MAPs (index, title, department).
    Uses LLM structured reasoning to detect sequencing constraints:
    which MAP must be completed before another can begin.
    Bounded to 10 MAPs max to prevent context overflow.
    """
    maps = req.maps[:10]  # hard cap
    if len(maps) < 2:
        return DependencyResult(edges=[])

    from langchain_openai import ChatOpenAI
    from langchain_core.prompts import ChatPromptTemplate

    # Build a compact numbered list for the LLM
    map_list = "\n".join(
        f"{m.index}. [{m.department}] {m.title}" for m in maps
    )

    prompt = ChatPromptTemplate.from_messages([
        ("system",
         """You are a regulatory compliance sequencing expert. 
         Given a list of compliance action points from a banking circular, identify ONLY real, logical sequencing dependencies.
         A dependency exists when completing Action A is a necessary prerequisite before Action B can begin — not just thematically related.
         Return ONLY genuine blocking relationships. If there are none, return an empty edges list.
         Be conservative: when in doubt, do not add an edge."""),
        ("human",
         f"""Here are the compliance action points from a regulatory circular:

{map_list}

Identify all sequencing constraints. For each: which action (by index) must be completed BEFORE which other action can begin, and why.""")
    ])

    try:
        llm = ChatOpenAI(
            base_url="http://localhost:11434/v1",
            api_key="ollama",
            model="llama3.1",
            temperature=0,
        ).with_structured_output(DependencyResult)

        chain = prompt | llm
        result = chain.invoke({})
        logging.getLogger("dependencies").info(
            f"Detected {len(result.edges)} dependency edges from {len(maps)} MAPs"
        )
        return result
    except Exception as e:
        logging.getLogger("dependencies").warning(f"Dependency detection failed: {e}. Returning empty graph.")
        return DependencyResult(edges=[])


# ── Scrape Endpoint ─────────────────────────────────────────
@app.post("/scrape-source", response_model=CircularExtraction)
async def scrape_circular_source(req: ScrapeRequest):
    """
    Accepts a base URL (e.g., RBI notifications page).
    Uses deterministic discovery to fetch the page, filters links
    for keywords (circular, notification, pdf), picks the first one,
    downloads the payload, and pipes it into the extraction graph.
    """
    if not req.url.startswith("http"):
        raise HTTPException(status_code=400, detail="Invalid URL provided.")

    import requests
    from bs4 import BeautifulSoup
    from urllib.parse import urljoin
    import io

    logging.getLogger("scrape").info(f"Fetching source URL: {req.url}")
    try:
        # 1. Deterministic Discovery
        headers = {"User-Agent": "Mozilla/5.0 (compatible; RegRadarBot/1.0)"}
        resp = requests.get(req.url, headers=headers, timeout=15)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch source: {e}")

    # 2. Heuristic Filtering
    valid_links = []
    keywords = ["circular", "notification", "master direction", "master circular"]
    for a in soup.find_all('a', href=True):
        text = a.get_text().strip().lower()
        href = a['href'].strip()
        if not href or href.startswith("javascript:") or href.startswith("mailto:"):
            continue

        lower_href = href.lower()
        if any(k in text or k in lower_href for k in keywords) or lower_href.endswith(".pdf"):
            abs_url = urljoin(req.url, href)
            # Avoid duplicates while preserving order
            if abs_url not in valid_links:
                valid_links.append(abs_url)

    if not valid_links:
        raise HTTPException(status_code=404, detail="No regulatory circulars found on this page using deterministic heuristics.")

    # 3. AI Selection Bypass (Take Top 1)
    target_url = valid_links[0]
    logging.getLogger("scrape").info(f"Selected target circular: {target_url}")

    # 4. Extraction
    try:
        payload_resp = requests.get(target_url, headers=headers, timeout=15)
        payload_resp.raise_for_status()
        
        raw_text = ""
        # Check if it's a PDF
        if target_url.lower().endswith(".pdf") or "application/pdf" in payload_resp.headers.get("Content-Type", ""):
            import pdfplumber
            with pdfplumber.open(io.BytesIO(payload_resp.content)) as pdf:
                pages = [page.extract_text() or "" for page in pdf.pages]
                raw_text = "\n".join(pages).strip()
        else:
            # HTML payload
            payload_soup = BeautifulSoup(payload_resp.text, "html.parser")
            # Basic cleanup
            for script in payload_soup(["script", "style", "nav", "footer", "header"]):
                script.extract()
            raw_text = payload_soup.get_text(separator="\n", strip=True)
            
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to download payload from {target_url}: {e}")

    if len(raw_text) < 50:
        raise HTTPException(status_code=422, detail="Extracted payload text is too short or empty.")

    # Run through the map extraction graph
    graph_output = extraction_graph.invoke({
        "raw_text": raw_text,
        "extracted_data": {},
        "errors": [],
    })

    if graph_output.get("errors"):
        for err in graph_output["errors"]:
            logging.getLogger("scrape").warning(f"Graph error: {err}")

    # Inject the scraped_url into the output
    extracted_data = graph_output["extracted_data"]
    if isinstance(extracted_data, dict):
        extracted_data["scraped_url"] = target_url
    else:
        # Assuming it's a Pydantic object
        extracted_data.scraped_url = target_url

    return extracted_data
