import logging
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn

from models import CircularExtraction
from graph import extraction_graph

# ── Logging ─────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s │ %(name)-18s │ %(levelname)-7s │ %(message)s",
)

app = FastAPI(
    title="RegRadar AI Service",
    description="AI-powered regulatory circular parser — extracts Measurable Action Points (MAPs) via LangGraph",
    version="2.0.0",
)


# ── Request Model ──────────────────────────────────────────
class ParseRequest(BaseModel):
    text: str


# ── Health ──────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok", "service": "regradar-ai", "version": "2.0.0"}


# ── Parse Endpoint ──────────────────────────────────────────
@app.post("/parse", response_model=CircularExtraction)
async def parse_circular(payload: ParseRequest):
    """
    Accepts raw text of a regulatory circular and returns
    structured MAPs (Measurable Action Points) via the LangGraph pipeline.

    The response includes `extraction_mode` indicating whether the data
    came from an LLM ("llm_openai" / "llm_local") or the fallback.
    """
    if not payload.text or not payload.text.strip():
        raise HTTPException(
            status_code=400,
            detail="'text' field must be a non-empty string.",
        )

    # Invoke the LangGraph state machine
    graph_output = extraction_graph.invoke({
        "raw_text": payload.text,
        "extracted_data": {},
        "errors": [],
    })

    # Log any errors that occurred during extraction
    if graph_output.get("errors"):
        for err in graph_output["errors"]:
            logging.getLogger("parse").warning(f"Graph error: {err}")

    # Return the extracted data (validated through the response_model)
    return graph_output["extracted_data"]


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
