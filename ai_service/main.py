import logging
import io
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
import uvicorn

from models import CircularExtraction, ValidationVerdict
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
    proof_file: UploadFile = File(...),
    original_map_action: str = Form(...),
    original_map_department: str = Form(...),
):
    """
    Accepts an uploaded proof document (PDF or TXT) and the original MAP mandate.
    Runs the two-node validation graph:
      1. extract_proof_text  — pulls text from the file
      2. validate_compliance — LLM compares proof vs mandate
    Returns a ValidationVerdict with is_compliant, confidence, reasoning, and missing_items.
    """
    if not original_map_action.strip():
        raise HTTPException(status_code=400, detail="original_map_action must not be empty.")

    # Read file bytes
    file_bytes = await proof_file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    graph_output = validation_graph.invoke({
        "original_map_action": original_map_action,
        "original_map_department": original_map_department,
        "proof_bytes": file_bytes,
        "proof_filename": proof_file.filename or "proof.txt",
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


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
