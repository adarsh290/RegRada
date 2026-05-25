import logging
import io
import os
import re
import asyncio
import socket
import ipaddress
import httpx
from urllib.parse import urlparse, urljoin
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
import chromadb
from chromadb.utils import embedding_functions

# ── Global configuration from env ─────────────────────────────
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434/v1")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.1")
OLLAMA_EMBEDDING_URL = os.getenv("OLLAMA_EMBEDDING_URL", "http://localhost:11434/api/embeddings")
OLLAMA_EMBEDDING_MODEL = os.getenv("OLLAMA_EMBEDDING_MODEL", "nomic-embed-text")

chroma_client = None
maps_collection = None
chroma_lock = asyncio.Lock()

# ── Logging ─────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s │ %(name)-18s │ %(levelname)-7s │ %(message)s",
)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    global chroma_client, maps_collection
    try:
        chroma_client = chromadb.PersistentClient(path="./chroma_db")
        embedding_fn = embedding_functions.OllamaEmbeddingFunction(
            url=OLLAMA_EMBEDDING_URL,
            model_name=OLLAMA_EMBEDDING_MODEL,
        )
        maps_collection = chroma_client.get_or_create_collection(
            name="regrada_maps",
            embedding_function=embedding_fn
        )
        logger.info("ChromaDB and embedding collection initialized successfully.")
    except Exception as e:
        logger.error(f"ChromaDB initialization failed: {e}")
    yield

_is_dev = os.getenv("MODEL_ENV", "production").lower() == "development"
app = FastAPI(
    title="RegRadar AI Service",
    description="AI-powered regulatory circular parser and compliance validator",
    version="3.0.0",
    lifespan=lifespan,
    # BUG-AI-012: Disable Swagger/OpenAPI docs in non-development environments
    docs_url="/docs" if _is_dev else None,
    redoc_url="/redoc" if _is_dev else None,
    openapi_url="/openapi.json" if _is_dev else None,
)

from models import CircularExtraction, ValidationVerdict, DependencyResult, ReevaluationVerdict, ReevaluateRequest
from graph import extraction_graph
from validation_graph import validation_graph

# ── Helpers ─────────────────────────────────────────────────
def sanitize_for_prompt(text: str, max_len: int = 2000) -> str:
    """Remove prompt injection patterns and truncate."""
    if not text:
        return ""
    # Strip common injection patterns
    text = re.sub(r'(?i)(ignore (previous|above|all) instructions?|system prompt|you are now)', '', text)
    # Remove markdown/code block injectors
    text = re.sub(r'```.*?```', '[CODE BLOCK REMOVED]', text, flags=re.DOTALL)
    return text[:max_len].strip()

async def validate_url_against_ssrf(url: str) -> tuple[bool, str]:
    """Robust async DNS-resolution based SSRF validation. Returns (is_safe, resolved_ip)."""
    try:
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https"):
            return False, ""
        
        hostname = parsed.hostname
        if not hostname:
            return False, ""
            
        # Basic check for known private IP strings and localhost
        SSRF_BLOCKLIST = ["169.254.", "10.", "192.168.", "172.16.", "127.", "localhost", "0.0.0.0"]
        hostname_lower = hostname.lower()
        if hostname_lower == "localhost":
            return False, ""
        for blocked in SSRF_BLOCKLIST:
            if hostname_lower.startswith(blocked):
                return False, ""
                
        # Resolve hostname to IPs using socket getaddrinfo (offloaded to thread)
        try:
            addr_info = await asyncio.to_thread(socket.getaddrinfo, hostname, None)
            valid_ip = None
            for family, _, _, _, sockaddr in addr_info:
                ip = sockaddr[0]
                addr = ipaddress.ip_address(ip)
                if addr.is_private or addr.is_loopback or addr.is_link_local:
                    return False, ""
                if not valid_ip:
                    valid_ip = ip
            if not valid_ip:
                return False, ""
            return True, valid_ip
        except socket.gaierror:
            return False, ""
    except Exception as e:
        logger.error(f"Error in URL validation: {e}")
        return False, ""

# BUG-AI-001 / BUG-SEC-007: Never fall back to a hardcoded default — crash loudly on startup
INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY")
if not INTERNAL_API_KEY:
    raise RuntimeError("FATAL: INTERNAL_API_KEY environment variable must be set. Refusing to start with a hardcoded secret.")

@app.middleware("http")
async def check_internal_token(request: Request, call_next):
    if request.url.path in ("/health", "/docs", "/openapi.json", "/redoc"):
        return await call_next(request)
    
    token = request.headers.get("x-internal-token")
    if token != INTERNAL_API_KEY:
        return JSONResponse(
            status_code=401,
            content={"detail": "Unauthorized: Invalid or missing X-Internal-Token header."}
        )
    return await call_next(request)


@app.post("/clear")
async def clear_database():
    global maps_collection
    if maps_collection is not None:
        try:
            results = maps_collection.get()
            if results and results['ids']:
                maps_collection.delete(ids=results['ids'])
            logger.info("ChromaDB vector store cleared successfully.")
            return {"message": "ChromaDB cleared successfully"}
        except Exception as e:
            logger.error(f"Failed to clear ChromaDB: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to clear ChromaDB: {e}")
    return {"message": "ChromaDB was not initialized"}


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

    if len(payload.text) > 500000:
        raise HTTPException(
            status_code=400,
            detail="Payload text exceeds 500,000 character limit.",
        )

    try:
        graph_output = await asyncio.to_thread(
            extraction_graph.invoke,
            {
                "raw_text": payload.text,
                "extracted_data": {},
                "errors": [],
            }
        )
    except Exception as e:
        logger.error(f"Extraction graph invocation failed (/parse): {e}")
        raise HTTPException(
            status_code=500,
            detail="Regulatory extraction failed. Please try again."
        )

    if graph_output.get("errors"):
        for err in graph_output["errors"]:
            logging.getLogger("parse").warning(f"Graph error: {err}")

    return graph_output["extracted_data"]


# ── Parse PDF Endpoint ──────────────────────────────────────
def _extract_text_from_pdf_bytes(file_bytes: bytes) -> tuple[str, int]:
    import pdfplumber
    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        pages = [page.extract_text() or "" for page in pdf.pages]
        raw_text = "\n".join(pages).strip()
        num_pages = len(pdf.pages)
    return raw_text, num_pages

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
    if len(file_bytes) > 20 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large. Maximum size is 20MB.")
        
    # BUG-AI-016: Validate magic bytes for PDF
    if not file_bytes.startswith(b'%PDF'):
        raise HTTPException(status_code=400, detail="File is not a valid PDF.")

    # Extract text from the PDF in a thread pool
    try:
        raw_text, num_pages = await asyncio.to_thread(
            _extract_text_from_pdf_bytes, file_bytes
        )
    except Exception as e:
        logger.error(f"PDF text extraction failed: {e}")
        raise HTTPException(status_code=422, detail="PDF text extraction failed. Ensure the file is a valid, non-scanned PDF.")

    if not raw_text:
        raise HTTPException(
            status_code=422,
            detail="No extractable text found in the PDF. It may be scanned or image-only.",
        )

    logging.getLogger("parse-pdf").info(
        f"Extracted {len(raw_text)} chars from '{pdf_file.filename}' ({num_pages} pages)"
    )

    try:
        graph_output = await asyncio.to_thread(
            extraction_graph.invoke,
            {
                "raw_text": raw_text,
                "extracted_data": {},
                "errors": [],
            }
        )
    except Exception as e:
        logger.error(f"Extraction graph invocation failed (/parse-pdf): {e}")
        raise HTTPException(
            status_code=500,
            detail="Regulatory extraction failed. Please try again."
        )

    if graph_output.get("errors"):
        for err in graph_output["errors"]:
            logging.getLogger("parse-pdf").warning(f"Graph error: {err}")

    extracted_data = graph_output["extracted_data"]
    if isinstance(extracted_data, CircularExtraction):
        extracted_data.raw_text = raw_text
    elif isinstance(extracted_data, dict):
        extracted_data["raw_text"] = raw_text

    return extracted_data


# ── Validate Endpoint ───────────────────────────────────────
def _extract_proof_text(filename: str, file_bytes: bytes) -> str:
    if filename.lower().endswith(".pdf"):
        import pdfplumber
        with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
            pages = [page.extract_text() or "" for page in pdf.pages]
            return "\n".join(pages).strip()
    else:
        return file_bytes.decode("utf-8", errors="replace").strip()

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

    # 5.4 Limit file count to 5
    if len(proof_files) > 5:
        raise HTTPException(status_code=400, detail="Maximum 5 files allowed.")

    combined_text_parts = []
    combined_filename = ", ".join(f.filename or "proof" for f in proof_files)
    total_bytes = 0

    for proof_file in proof_files:
        file_bytes = await proof_file.read()
        if not file_bytes:
            continue
        
        file_size = len(file_bytes)
        # 5.4 Limit per-file size to 20MB
        if file_size > 20 * 1024 * 1024:
            raise HTTPException(status_code=400, detail=f"File {proof_file.filename or 'uploaded'} exceeds 20MB limit.")

        total_bytes += file_size
        # 5.4 Limit total size to 50MB
        if total_bytes > 50 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="Total upload size exceeds 50MB limit.")

        # BUG-AI-017: Validate magic bytes or text encoding
        filename_lower = (proof_file.filename or "").lower()
        if filename_lower.endswith(".pdf"):
            if not file_bytes.startswith(b'%PDF'):
                raise HTTPException(status_code=400, detail=f"File {proof_file.filename} is not a valid PDF.")
        else:
            try:
                file_bytes.decode("utf-8")
            except UnicodeDecodeError:
                raise HTTPException(status_code=400, detail=f"File {proof_file.filename} is not valid UTF-8 text.")

        text_part = await asyncio.to_thread(
            _extract_proof_text, proof_file.filename or "", file_bytes
        )
        if text_part:
            combined_text_parts.append(text_part)

    if not combined_text_parts:
        raise HTTPException(status_code=400, detail="All uploaded files are empty.")

    combined_text = "\n\n--- NEXT DOCUMENT ---\n\n".join(combined_text_parts)

    try:
        # 5.11 Wrap validation graph invoke in thread pool
        graph_output = await asyncio.to_thread(
            validation_graph.invoke,
            {
                "original_map_action": original_map_action,
                "original_map_department": original_map_department,
                "proof_bytes": b"",
                "proof_filename": combined_filename,
                "proof_text": combined_text,
                "verdict": {},
                "errors": [],
            }
        )
    except Exception as e:
        logger.error(f"Validation graph invocation failed: {e}")
        raise HTTPException(status_code=500, detail="Proof validation failed internally. Please try again.")

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
    from langchain_core.prompts import ChatPromptTemplate
    from graph import _build_llm
    
    provider = os.getenv("MODEL_PROVIDER", "fallback").lower()
    base_llm, mode = _build_llm(provider)
    if base_llm is None:
        raise HTTPException(status_code=503, detail="LLM provider is unavailable.")
    
    # 5.3 Sanitize inputs to mitigate prompt injection
    sanitized_action = sanitize_for_prompt(req.action_title)
    sanitized_dept = sanitize_for_prompt(req.current_department)
    sanitized_reason = sanitize_for_prompt(req.rejection_reason)
    
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
        # 5.10 & 5.13 Configuration, timeout
        llm = base_llm.with_structured_output(ReevaluationVerdict)
        
        chain = prompt | llm
        
        # 5.11 Asynchronous offloading
        result = await asyncio.to_thread(
            chain.invoke,
            {
                "action_title": sanitized_action,
                "current_department": sanitized_dept,
                "rejection_reason": sanitized_reason
            }
        )
        return result
    except Exception as e:
        logging.getLogger("reevaluate").error(f"Re-evaluation failed: {e}")
        raise HTTPException(status_code=500, detail="Re-evaluation failed.")

from models import DeltaReport, ConflictReport, QueryResult, ConflictType
from delta_graph import delta_graph

class MapPayload(BaseModel):
    map_id: str
    action_title: str
    department: str
    deadline: str
    priority: str

class DetectAmendmentsRequest(BaseModel):
    circular_id: str
    circular_source: str
    circular_title: str
    raw_text: str = Field(..., max_length=500000) # BUG-AI-018: CPU exhaustion prevention
    maps: list[MapPayload]

class DetectAmendmentsResponse(BaseModel):
    amends_circular_id: str | None = None
    delta_report: dict | None = None

@app.post("/detect-amendments", response_model=DetectAmendmentsResponse)
async def detect_amendments(req: DetectAmendmentsRequest):
    if maps_collection is None:
        raise HTTPException(status_code=503, detail="ChromaDB service is unavailable.")

    # Step 1: regex search for prior circular source
    matches = re.findall(r'RBI/\d{4}-\d{2,4}/\d+', req.raw_text)
    prior_circular_id = None
    prior_maps = []
    
    if matches:
        try:
            # BUG-AI-005: No lock needed for read-only ChromaDB .get() operations
            results = await asyncio.to_thread(
                maps_collection.get,
                where={"circular_source": matches[0]}
            )
            # BUG-AI-019: Safe check for results.get('metadatas')
            if results and results.get('ids') and len(results['ids']) > 0 and results.get('metadatas') and len(results['metadatas']) > 0:
                prior_circular_id = results['metadatas'][0]['circular_id']
                prior_maps = results['metadatas']
        except Exception as e:
            logger.warning(f"ChromaDB regex lookup failed: {e}")
    
    # Step 2: Semantic fallback if no regex match
    if not prior_circular_id and req.maps:
        first_map = req.maps[0]
        query_text = f"{first_map.action_title} | {first_map.department} | {first_map.deadline}"
        try:
            # BUG-AI-005: No lock needed for read-only ChromaDB .query() operations
            results = await asyncio.to_thread(
                maps_collection.query,
                query_texts=[query_text],
                n_results=3
            )
            if results and results.get('distances') and len(results['distances']) > 0 and len(results['distances'][0]) > 0:
                best_match_idx = 0
                distance = results['distances'][0][best_match_idx]
                
                # 5.12 Semantic distance threshold (lower L2 distance is a better match)
                SIMILARITY_THRESHOLD = 0.85
                if distance < SIMILARITY_THRESHOLD:
                    best_meta = results['metadatas'][0][best_match_idx]
                    if best_meta['circular_id'] != req.circular_id:
                        prior_circular_id = best_meta['circular_id']
                        # BUG-AI-005: No lock needed for read-only .get()
                        prior_results = await asyncio.to_thread(
                            maps_collection.get,
                            where={"circular_id": prior_circular_id}
                        )
                        if prior_results and prior_results.get('metadatas'):
                            prior_maps = prior_results['metadatas']
        except Exception as e:
            logger.warning(f"ChromaDB semantic lookup failed: {e}")

    delta_report = None
    # 5.6 Move ChromaDB upsert to only run AFTER delta_graph completes successfully
    if prior_circular_id and prior_maps:
        old_maps = prior_maps
        new_maps = [m.model_dump() for m in req.maps]
        try:
            # 5.11 Offload graph invoke to thread pool
            graph_output = await asyncio.to_thread(
                delta_graph.invoke,
                {
                    "old_maps": old_maps,
                    "new_maps": new_maps,
                    "delta_report": {},
                    "errors": []
                }
            )
            # 5.7 delta_graph silent failure checking
            if graph_output.get("errors"):
                logger.warning(f"Delta graph completed with errors: {graph_output['errors']}")
            
            if graph_output.get("delta_report"):
                delta_report = graph_output["delta_report"]
        except Exception as e:
            logger.error(f"Delta graph invocation failed: {e}")
            raise HTTPException(status_code=500, detail="Delta analysis failed internally. Please try again.")

    # Step 4: upsert all new maps into chromadb
    if req.maps:
        ids = []
        documents = []
        metadatas = []
        for m in req.maps:
            ids.append(f"{req.circular_id}_{m.map_id}")
            documents.append(f"{m.action_title} | {m.department} | {m.deadline}")
            metadatas.append({
                "circular_id": req.circular_id,
                "circular_title": req.circular_title,
                "circular_source": req.circular_source,
                "map_id": m.map_id,
                "action_title": m.action_title,
                "department": m.department,
                "deadline": m.deadline,
                "priority": m.priority
            })
        
        try:
            # 5.14 Concurrency Lock around ChromaDB modification
            async with chroma_lock:
                await asyncio.to_thread(
                    maps_collection.upsert,
                    ids=ids,
                    documents=documents,
                    metadatas=metadatas
                )
            logger.info(f"Successfully indexed {len(ids)} MAPs in ChromaDB.")
        except Exception as e:
            logger.error(f"ChromaDB upsert failed: {e}")
            raise HTTPException(status_code=500, detail="Failed to index MAPs in vector store. Please try again.")

    return DetectAmendmentsResponse(
        amends_circular_id=prior_circular_id,
        delta_report=delta_report
    )

class DetectConflictsRequest(BaseModel):
    circular_id: str
    maps: list[MapPayload]

class DetectConflictsResponse(BaseModel):
    conflicts: list[dict]

@app.post("/detect-conflicts", response_model=DetectConflictsResponse)
async def detect_conflicts(req: DetectConflictsRequest):
    conflicts = []
    if not req.maps:
        return DetectConflictsResponse(conflicts=conflicts)

    if maps_collection is None:
        raise HTTPException(status_code=503, detail="ChromaDB service is unavailable.")

    from langchain_core.prompts import ChatPromptTemplate
    from graph import _build_llm
    
    provider = os.getenv("MODEL_PROVIDER", "fallback").lower()
    base_llm, mode = _build_llm(provider)
    if base_llm is None:
        raise HTTPException(status_code=503, detail="LLM provider is unavailable.")
        
    llm = base_llm
    
    candidate_pairs = []
    for m in req.maps:
        query_text = f"{m.action_title} | {m.department} | {m.deadline}"
        # BUG-AI-005: No lock needed for read-only .query() operations
        results = await asyncio.to_thread(
            maps_collection.query,
                query_texts=[query_text],
                n_results=5
            )
        if results and results['metadatas'] and len(results['metadatas'][0]) > 0:
            for meta in results['metadatas'][0]:
                if meta['circular_id'] != req.circular_id:
                    candidate_pairs.append((m, meta))
    
    if not candidate_pairs:
        return DetectConflictsResponse(conflicts=conflicts)
        
    class ConflictReportList(BaseModel):
        conflicts: list[ConflictReport]
        
    prompt = ChatPromptTemplate.from_messages([
        ("system", "You are a regulatory compliance expert. Given pairs of mandatory action points (MAPs), determine if there is a genuine conflict between them. "
         "Conflicts can be: deadline_conflict (different deadlines for same task), contradictory_requirement (do X vs don't do X), or jurisdiction_overlap. "
         "Return a list of conflicts found. Ensure you preserve the map_id and circular_id of both items exactly as given. If none, return empty list."),
        ("human", "Evaluate these candidate pairs for conflicts:\n{pairs}")
    ])
    
    chain = prompt | llm.with_structured_output(ConflictReportList)
    
    pairs_text = ""
    for i, (m, meta) in enumerate(candidate_pairs):
        # Prompt injection prevention: sanitize metadata values
        san_action_a = sanitize_for_prompt(m.action_title)
        san_dept_a = sanitize_for_prompt(m.department)
        san_deadline_a = sanitize_for_prompt(m.deadline)
        
        san_action_b = sanitize_for_prompt(meta['action_title'])
        san_dept_b = sanitize_for_prompt(meta['department'])
        san_deadline_b = sanitize_for_prompt(meta['deadline'])
        
        pairs_text += f"Pair {i+1}:\n"
        pairs_text += f"  MAP A [map_id_a={m.map_id}, circular_id_a={req.circular_id}]: {san_action_a} | Dept: {san_dept_a} | Deadline: {san_deadline_a}\n"
        pairs_text += f"  MAP B [map_id_b={meta['map_id']}, circular_id_b={meta['circular_id']}]: {san_action_b} | Dept: {san_dept_b} | Deadline: {san_deadline_b}\n\n"

    try:
        # Offload LLM call to thread
        result = await asyncio.to_thread(chain.invoke, {"pairs": pairs_text})
        for c in result.conflicts:
            conflicts.append(c.model_dump())
    except Exception as e:
        logger.error(f"Conflict detection failed: {e}")
        # BUG-AI-013: Return 500 so callers know detection failed vs. "no conflicts found"
        raise HTTPException(status_code=500, detail="Conflict detection failed internally. Please try again.")

    return DetectConflictsResponse(conflicts=conflicts)

class QueryMapsRequest(BaseModel):
    query: str
    top_k: int = Field(default=10, ge=1, le=100)

class QueryMapsResponse(BaseModel):
    results: list[dict]

@app.post("/query-maps", response_model=QueryMapsResponse)
async def query_maps(req: QueryMapsRequest):
    if maps_collection is None:
        raise HTTPException(status_code=503, detail="ChromaDB service is unavailable.")

    # BUG-AI-005: No lock needed for read-only .query() — chroma_lock only for writes
    results = await asyncio.to_thread(
        maps_collection.query,
        query_texts=[req.query],
        n_results=req.top_k * 2
    )
    
    if not results or not results['metadatas'] or len(results['metadatas'][0]) == 0:
        return QueryMapsResponse(results=[])
        
    candidates = results['metadatas'][0]
    
    from langchain_core.prompts import ChatPromptTemplate
    from graph import _build_llm
    
    provider = os.getenv("MODEL_PROVIDER", "fallback").lower()
    base_llm, mode = _build_llm(provider)
    if base_llm is None:
        raise HTTPException(status_code=503, detail="LLM provider is unavailable.")
        
    llm = base_llm
    
    class FilteredResults(BaseModel):
        results: list[QueryResult]
        
    prompt = ChatPromptTemplate.from_messages([
        ("system", "You are a compliance assistant. Given a user query and a list of candidate MAPs from a semantic search, "
         "filter and rank the most relevant ones. Exclude irrelevant ones. Assign a relevance score (0.0-1.0) and a brief reason. "
         "Preserve map_id, circular_id, circular_title, circular_source, action_title, department, deadline, priority from the metadata."),
        ("human", "Query: {query}\n\nCandidate MAPs:\n{candidates}")
    ])
    
    chain = prompt | llm.with_structured_output(FilteredResults)
    
    # Prompt injection prevention: sanitize search query and candidate metadata
    sanitized_query = sanitize_for_prompt(req.query)
    cands_text = ""
    for c in candidates:
        sanitized_c = {k: sanitize_for_prompt(str(v)) for k, v in c.items()}
        cands_text += str(sanitized_c) + "\n"
        
    try:
        # Performance: offload blocking LLM chains to thread with a 15s timeout
        async def run_chain():
            return await asyncio.to_thread(
                chain.invoke,
                {
                    "query": sanitized_query,
                    "candidates": cands_text
                }
            )
        result = await asyncio.wait_for(run_chain(), timeout=15.0)
        sorted_res = sorted(result.results, key=lambda x: x.relevance_score, reverse=True)
        return QueryMapsResponse(results=[r.model_dump() for r in sorted_res[:req.top_k]])
    except Exception as e:
        logger.warning(f"⚠️ Query maps filtering failed or timed out ({e}), falling back to direct ChromaDB results.")
        fallback_results = []
        for c in candidates:
            fallback_results.append(QueryResult(
                map_id=c.get("map_id", ""),
                circular_id=c.get("circular_id", ""),
                circular_title=c.get("circular_title", ""),
                circular_source=c.get("circular_source", ""),
                action_title=c.get("action_title", ""),
                department=c.get("department", ""),
                deadline=c.get("deadline", ""),
                priority=c.get("priority", ""),
                relevance_score=0.8,
                relevance_reason="Direct semantic match from database"
            ))
        return QueryMapsResponse(results=[r.model_dump() for r in fallback_results[:req.top_k]])

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
    maps = req.maps
    if len(maps) > 50:
        logger.warning("Truncating dependency detection to top 50 MAPs to avoid context overflow.")
        maps = maps[:50]
    if len(maps) < 2:
        return DependencyResult(edges=[])

    from langchain_core.prompts import ChatPromptTemplate
    from graph import _build_llm
    
    provider = os.getenv("MODEL_PROVIDER", "fallback").lower()
    base_llm, mode = _build_llm(provider)
    if base_llm is None:
        raise HTTPException(status_code=503, detail="LLM provider is unavailable.")

    # Prompt injection prevention: sanitize map title and department
    sanitized_map_items = []
    for m in maps:
        title_san = sanitize_for_prompt(m.title)
        dept_san = sanitize_for_prompt(m.department)
        sanitized_map_items.append(f"{m.index}. [{dept_san}] {title_san}")

    # Build a compact numbered list for the LLM
    map_list = "\n".join(sanitized_map_items)

    prompt = ChatPromptTemplate.from_messages([
        ("system",
         """You are a regulatory compliance sequencing expert. 
         Given a list of compliance action points from a banking circular, identify ONLY real, logical sequencing dependencies.
         A dependency exists when completing Action A is a necessary prerequisite before Action B can begin — not just thematically related.
         Return ONLY genuine blocking relationships. If there are none, return an empty edges list.
         Be conservative: when in doubt, do not add an edge."""),
        ("human",
         """Here are the compliance action points from a regulatory circular:

{map_list}

Identify all sequencing constraints. For each: which action (by index) must be completed BEFORE which other action can begin, and why.""")
    ])

    try:
        llm = base_llm.with_structured_output(DependencyResult)

        chain = prompt | llm
        
        # Offload LLM call to thread pool
        result = await asyncio.to_thread(chain.invoke, {"map_list": map_list})
        
        # Validate DependencyEdge indexes returned by LLM (AI-NEW-014)
        valid_edges = []
        for edge in result.edges:
            if 0 <= edge.from_map_index < len(maps) and 0 <= edge.to_map_index < len(maps) and edge.from_map_index != edge.to_map_index:
                valid_edges.append(edge)
            else:
                logger.warning(f"Discarding out-of-bounds LLM dependency edge: {edge}")
                
        result.edges = valid_edges
        
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
    # Security: SSRF validation check on request URL
    is_safe, safe_ip = await validate_url_against_ssrf(req.url)
    if not is_safe:
        raise HTTPException(
            status_code=400,
            detail="Provided source URL failed SSRF validation."
        )

    from bs4 import BeautifulSoup
    import io

    # BUG-AI-003: Restrict discovered links to same origin only to prevent SSRF via discovered page links
    from urllib.parse import urlparse as _parse
    _origin = f"{_parse(req.url).scheme}://{_parse(req.url).netloc}"
    logging.getLogger("scrape").info(f"Fetching source URL: {req.url} (origin: {_origin})")
    try:
        # Performance/Security: Async client, block redirects, set timeout
        parsed_url = urlparse(req.url)
        target_port = f":{parsed_url.port}" if parsed_url.port else ""
        target_host_url = f"{parsed_url.scheme}://{safe_ip}{target_port}{parsed_url.path}"
        if parsed_url.query:
            target_host_url += f"?{parsed_url.query}"
            
        headers = {"User-Agent": "Mozilla/5.0 (compatible; RegRadarBot/1.0)", "Host": parsed_url.hostname or ""}
        async with httpx.AsyncClient(follow_redirects=False, timeout=15) as client:
            resp = await client.get(target_host_url, headers=headers)
        resp.raise_for_status()
        
        # Performance: offload BeautifulSoup parsing to thread
        soup = await asyncio.to_thread(BeautifulSoup, resp.text, "html.parser")
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
            # BUG-AI-003: Only follow same-origin links to prevent SSRF via page-discovered links
            if not abs_url.startswith(_origin):
                logging.getLogger("scrape").debug(f"Skipping cross-origin link: {abs_url}")
                continue
            # Avoid duplicates while preserving order
            if abs_url not in valid_links:
                valid_links.append(abs_url)

    if not valid_links:
        raise HTTPException(status_code=404, detail="No regulatory circulars found on this page using deterministic heuristics.")

    # 3. AI Selection Bypass (Take Top 1)
    target_url = valid_links[0]
    
    is_safe_target, safe_ip_target = await validate_url_against_ssrf(target_url)
    if not is_safe_target:
        raise HTTPException(
            status_code=400,
            detail="Target circular URL failed SSRF validation."
        )
        
    logging.getLogger("scrape").info(f"Selected target circular: {target_url}")

    # 4. Extraction
    try:
        # Performance/Security: Fetch payload asynchronously, no redirects
        parsed_target = urlparse(target_url)
        target_port = f":{parsed_target.port}" if parsed_target.port else ""
        target_host_url = f"{parsed_target.scheme}://{safe_ip_target}{target_port}{parsed_target.path}"
        if parsed_target.query:
            target_host_url += f"?{parsed_target.query}"
        
        # BUG-AI-020: Create new headers dict instead of mutating the old one
        target_headers = {"User-Agent": "Mozilla/5.0 (compatible; RegRadarBot/1.0)", "Host": parsed_target.hostname or ""}
        async with httpx.AsyncClient(follow_redirects=False, timeout=15) as client:
            payload_resp = await client.get(target_host_url, headers=target_headers)
        payload_resp.raise_for_status()
        
        raw_text = ""
        # Check if it's a PDF
        is_pdf = target_url.lower().endswith(".pdf") or "application/pdf" in payload_resp.headers.get("Content-Type", "")
        
        if is_pdf:
            def extract_pdf():
                import pdfplumber
                with pdfplumber.open(io.BytesIO(payload_resp.content)) as pdf:
                    pages = [page.extract_text() or "" for page in pdf.pages]
                    return "\n".join(pages).strip()
            
            # Performance: offload blocking PDF text extraction to thread
            raw_text = await asyncio.to_thread(extract_pdf)
        else:
            def extract_html():
                # HTML payload
                payload_soup = BeautifulSoup(payload_resp.text, "html.parser")
                # Basic cleanup
                for script in payload_soup(["script", "style", "nav", "footer", "header"]):
                    script.extract()
                return payload_soup.get_text(separator="\n", strip=True)
                
            # Performance: offload blocking HTML parsing to thread
            raw_text = await asyncio.to_thread(extract_html)
            
    except Exception as e:
        logger.error(f"Failed to download circular content from target: {e}")
        raise HTTPException(status_code=502, detail="Failed to download circular content. The source may be unavailable.")

    if len(raw_text) < 50:
        raise HTTPException(status_code=422, detail="Extracted payload text is too short or empty.")

    # Run through the map extraction graph
    try:
        # Performance: offload LangGraph invoke to thread pool, handle exceptions (BUG-002)
        graph_output = await asyncio.to_thread(
            extraction_graph.invoke,
            {
                "raw_text": raw_text,
                "extracted_data": {},
                "errors": [],
            }
        )
    except Exception as e:
        logger.error(f"Extraction graph invocation failed for scraped target: {e}")
        raise HTTPException(
            status_code=500,
            detail="Regulatory extraction failed. Please try again."
        )

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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
