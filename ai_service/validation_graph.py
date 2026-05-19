"""
LangGraph state machine for proof-of-compliance validation.

Graph:  START → extract_proof_text → validate_compliance → END

Uses the same MODEL_PROVIDER env var and three-mode pattern as graph.py:
  - "openai"   → ChatOpenAI (GPT)
  - "local"    → ChatOpenAI pointed at Ollama (llama3.1)
  - "fallback" → Deterministic heuristic verdict (no LLM call)

On any LLM failure, gracefully degrades to fallback mode.
"""

import os
import io
import logging
from typing import TypedDict, Any

from dotenv import load_dotenv
from langgraph.graph import StateGraph, START, END

from models import ValidationVerdict

load_dotenv()
logger = logging.getLogger(__name__)


# ── Graph State ─────────────────────────────────────────────
class ValidationState(TypedDict):
    original_map_action: str
    original_map_department: str
    proof_bytes: bytes          # raw file bytes (PDF or TXT)
    proof_filename: str
    proof_text: str             # extracted plain text — populated by node 1
    verdict: dict[str, Any]    # ValidationVerdict dict — populated by node 2
    errors: list[str]


# ── Validation System Prompt ─────────────────────────────────
VALIDATION_SYSTEM_PROMPT = (
    "You are a strict but fair AI compliance auditor for a regulated banking institution. "
    "You will be given:\n"
    "  1. A MANDATE: the exact regulatory action point that was assigned to a department.\n"
    "  2. A PROOF DOCUMENT: text extracted from the document the department submitted as evidence.\n\n"
    "Your task: determine whether the proof document credibly demonstrates that the mandate has been fulfilled.\n"
    "Be specific. If the proof is vague, generic, or does not directly address the mandate, mark it as rejected "
    "and list exactly what is missing. Do not be lenient — this is for regulatory compliance."
)


# ── Fallback Verdict ─────────────────────────────────────────
def _fallback_verdict(proof_text: str, map_action: str) -> ValidationVerdict:
    """
    Heuristic-based verdict when no LLM is available.
    Checks if any significant words from the mandate appear in the proof.
    """
    action_words = set(
        w.lower() for w in map_action.split() if len(w) > 4
    )
    proof_words = set(w.lower() for w in proof_text.split())
    overlap = action_words & proof_words
    coverage = len(overlap) / max(len(action_words), 1)

    if coverage >= 0.3 and len(proof_text.strip()) > 100:
        return ValidationVerdict(
            is_compliant=True,
            confidence=round(min(0.55 + coverage * 0.3, 0.80), 2),
            reasoning=(
                "Fallback heuristic: the proof document contains sufficient keyword overlap "
                f"with the mandate ({len(overlap)} matching terms). Manual review recommended."
            ),
            missing_items=[],
            verdict="verified",
        )
    else:
        missing = list(action_words - proof_words)[:5]
        return ValidationVerdict(
            is_compliant=False,
            confidence=0.40,
            reasoning=(
                "Fallback heuristic: the proof document has insufficient keyword overlap with "
                "the mandate or is too short to be credible. Manual review required."
            ),
            missing_items=missing if missing else ["Insufficient evidence provided"],
            verdict="rejected",
        )


# ── Node 1: Extract Text from File ──────────────────────────
def extract_proof_text(state: ValidationState) -> ValidationState:
    """
    Extracts plain text from the uploaded proof file.
    Supports PDF (via pdfplumber) and plain text files.
    """
    errors = list(state.get("errors", []))
    filename = state.get("proof_filename", "")
    proof_bytes = state.get("proof_bytes", b"")

    extracted = ""

    try:
        if filename.lower().endswith(".pdf"):
            import pdfplumber
            with pdfplumber.open(io.BytesIO(proof_bytes)) as pdf:
                pages = [page.extract_text() or "" for page in pdf.pages]
                extracted = "\n".join(pages).strip()
            logger.info(f"PDF extraction: {len(extracted)} chars from {len(pdf.pages)} pages")
        else:
            # Treat as plain text (TXT, DOC text fallback)
            extracted = proof_bytes.decode("utf-8", errors="replace").strip()
            logger.info(f"Text extraction: {len(extracted)} chars")

        if not extracted:
            extracted = "[Document appears to be empty or non-extractable]"
            errors.append("Proof document yielded no extractable text.")

    except Exception as e:
        error_msg = f"Text extraction failed: {e}"
        logger.error(error_msg)
        errors.append(error_msg)
        extracted = "[Extraction failed]"

    return {**state, "proof_text": extracted, "errors": errors}


# ── Node 2: Validate Compliance via LLM ─────────────────────
def validate_compliance(state: ValidationState) -> ValidationState:
    """
    Sends the extracted proof text + original mandate to the LLM
    and returns a structured ValidationVerdict.
    """
    errors = list(state.get("errors", []))
    proof_text = state.get("proof_text", "")
    map_action = state.get("original_map_action", "")
    map_dept = state.get("original_map_department", "")

    provider = os.getenv("MODEL_PROVIDER", "fallback").lower()

    # ── Build LLM ───────────────────────────────────────────
    llm = None
    mode = "fallback"

    if provider == "openai":
        api_key = os.getenv("OPENAI_API_KEY")
        if api_key:
            try:
                from langchain_openai import ChatOpenAI
                llm = ChatOpenAI(
                    model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
                    temperature=0,
                    api_key=api_key,
                )
                mode = "llm_openai"
            except Exception as e:
                errors.append(f"OpenAI init failed: {e}")
        else:
            errors.append("MODEL_PROVIDER=openai but OPENAI_API_KEY not set.")

    elif provider == "local":
        try:
            from langchain_openai import ChatOpenAI
            llm = ChatOpenAI(
                model=os.getenv("LOCAL_MODEL", "llama3.1"),
                temperature=0,
                base_url="http://localhost:11434/v1",
                api_key="ollama",
            )
            mode = "llm_local"
        except Exception as e:
            errors.append(f"Local LLM init failed: {e}")

    # ── Fallback path ────────────────────────────────────────
    if llm is None:
        logger.info(f"Using fallback validation (provider={provider}).")
        verdict = _fallback_verdict(proof_text, map_action)
        return {**state, "verdict": verdict.model_dump(), "errors": errors}

    # ── LLM path ─────────────────────────────────────────────
    try:
        from langchain_core.prompts import ChatPromptTemplate

        prompt = ChatPromptTemplate.from_messages([
            ("system", VALIDATION_SYSTEM_PROMPT),
            ("human",
             "MANDATE (assigned to {department}):\n{mandate}\n\n"
             "PROOF DOCUMENT (extracted text):\n{proof}\n\n"
             "Evaluate whether the proof satisfies the mandate."),
        ])

        chain = prompt | llm.with_structured_output(ValidationVerdict)
        result: ValidationVerdict = chain.invoke({
            "department": map_dept,
            "mandate": map_action,
            "proof": proof_text[:6000],  # cap tokens
        })

        logger.info(f"Validation complete ({mode}): {result.verdict} (confidence={result.confidence})")
        return {**state, "verdict": result.model_dump(), "errors": errors}

    except Exception as e:
        error_msg = f"LLM validation failed ({mode}): {e}"
        logger.error(error_msg)
        errors.append(error_msg)

        # Degrade to fallback on LLM error
        verdict = _fallback_verdict(proof_text, map_action)
        return {**state, "verdict": verdict.model_dump(), "errors": errors}


# ── Build the Graph ──────────────────────────────────────────
def build_validation_graph():
    """Compile the validation LangGraph state machine."""
    builder = StateGraph(ValidationState)
    builder.add_node("extract_proof_text", extract_proof_text)
    builder.add_node("validate_compliance", validate_compliance)
    builder.add_edge(START, "extract_proof_text")
    builder.add_edge("extract_proof_text", "validate_compliance")
    builder.add_edge("validate_compliance", END)
    return builder.compile()


# Module-level compiled graph — import from main.py
validation_graph = build_validation_graph()
logger.info("LangGraph validation pipeline compiled: START → extract_proof_text → validate_compliance → END")
