"""
LangGraph state machine for regulatory circular extraction.

Defines a single-node graph:  START → extract_maps_node → END

Supports three MODEL_PROVIDER modes:
  - "openai"   → ChatOpenAI with OPENAI_API_KEY
  - "local"    → ChatOpenAI pointed at Ollama (localhost:11434)
  - "fallback" → Hardcoded realistic data (no LLM call)

If any LLM call fails at runtime, the node catches the exception
and degrades gracefully to fallback mode.
"""

import os
import logging
from typing import TypedDict, Any

from dotenv import load_dotenv
from langgraph.graph import StateGraph, START, END

from models import CircularExtraction, MeasurableActionPoint

load_dotenv()
logger = logging.getLogger(__name__)


# ── Graph State ─────────────────────────────────────────────
class GraphState(TypedDict):
    raw_text: str
    extracted_data: dict[str, Any]
    errors: list[str]


# ── System Prompt ───────────────────────────────────────────
SYSTEM_PROMPT = """You are a senior banking compliance officer. Your job is to read regulatory circulars and extract Measurable Action Points (MAPs). For each action required by the bank, output the exact action, the department responsible (e.g., IT, Retail Banking, Legal, Compliance), a strict deadline, and the priority (High, Medium, Low). Ignore filler text. ONLY extract explicit mandates.
Additionally, you must self-score your extraction confidence:
- action_confidence: how explicitly the action is stated (1.0 = verbatim, 0.0 = inferred/vague)
- dept_confidence: how clearly a specific department is named (1.0 = clearly named, 0.0 = vague)
- deadline_confidence: how precisely the deadline is stated (1.0 = explicit date, 0.1 = 'as soon as possible')
If any score is low, add a brief reason to confidence_flags (e.g. 'deadline ambiguous')."""


# ── Fallback Data ───────────────────────────────────────────
FALLBACK_EXTRACTION = CircularExtraction(
    summary=(
        "This circular mandates enhanced due diligence requirements for "
        "digital lending platforms, focusing on KYC verification, interest "
        "rate disclosure, and grievance redressal mechanisms. Compliance is "
        "required by all regulated entities within 90 days."
    ),
    maps=[
        MeasurableActionPoint(
            action_title="Implement video-KYC verification for all digital loan originations above ₹50,000",
            department="Compliance",
            deadline="2026-08-15",
            priority="high",
        ),
        MeasurableActionPoint(
            action_title="Update loan agreement templates to include annualized interest rate disclosures",
            department="Legal",
            deadline="2026-07-01",
            priority="high",
        ),
        MeasurableActionPoint(
            action_title="Establish a dedicated grievance redressal portal for digital lending complaints",
            department="Operations",
            deadline="2026-09-30",
            priority="medium",
        ),
        MeasurableActionPoint(
            action_title="Submit quarterly compliance reports on digital lending metrics to the regulator",
            department="Risk Management",
            deadline="2026-10-15",
            priority="low",
        ),
    ],
    extraction_mode="fallback",
)


# ── LLM Node ───────────────────────────────────────────────
_llm_cache = {}

def _build_llm(provider: str):
    """
    Build the LangChain LLM based on the provider string.
    Caches the instance to avoid re-initialization per request.
    Returns (llm_instance, mode_label) or (None, "fallback").
    """
    if provider in _llm_cache:
        return _llm_cache[provider]

    if provider == "openai":
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            logger.warning("MODEL_PROVIDER=openai but OPENAI_API_KEY is not set.")
            return None, "fallback"
        try:
            from langchain_openai import ChatOpenAI
            llm = ChatOpenAI(
                model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
                temperature=0,
                api_key=api_key,
                timeout=60,
            )
            _llm_cache[provider] = (llm, "llm_openai")
            return _llm_cache[provider]
        except Exception as e:
            logger.error(f"Failed to initialize OpenAI LLM: {e}")
            return None, "fallback"

    elif provider == "local":
        try:
            from langchain_openai import ChatOpenAI
            llm = ChatOpenAI(
                model=os.getenv("OLLAMA_MODEL", os.getenv("LOCAL_MODEL", "llama3.1")),
                temperature=0,
                base_url=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434/v1"),
                api_key="ollama",
                timeout=60,
            )
            _llm_cache[provider] = (llm, "llm_local")
            return _llm_cache[provider]
        except Exception as e:
            logger.error(f"Failed to initialize local LLM: {e}")
            return None, "fallback"

    else:
        # "fallback" or any unrecognized value
        return None, "fallback"


def extract_maps_node(state: GraphState) -> GraphState:
    """
    LangGraph node: extracts MAPs from raw circular text.

    Reads MODEL_PROVIDER from env to decide which LLM backend to use.
    On any failure, degrades to fallback mode and records the error.
    """
    provider = os.getenv("MODEL_PROVIDER", "fallback").lower()
    raw_text = state["raw_text"]
    errors = list(state.get("errors", []))

    llm, mode = _build_llm(provider)

    # ── Fallback path ─────────────────────────────────────
    if llm is None:
        if provider != "fallback":
            errors.append(f"Requested provider '{provider}' unavailable — degraded to fallback.")
        logger.info(f"Using fallback extraction (provider={provider}).")
        return {
            "raw_text": raw_text,
            "extracted_data": FALLBACK_EXTRACTION.model_dump(),
            "errors": errors,
        }

    # ── LLM path ──────────────────────────────────────────
    try:
        from langchain_core.prompts import ChatPromptTemplate

        prompt = ChatPromptTemplate.from_messages([
            ("system", SYSTEM_PROMPT),
            ("human", "Extract compliance action points from the following regulatory circular:\n\n{text}"),
        ])

        chain = prompt | llm.with_structured_output(CircularExtraction)
        result: CircularExtraction = chain.invoke({"text": raw_text})

        # Stamp the extraction mode onto the result
        result.extraction_mode = mode
        logger.info(f"LLM extraction successful ({mode}) — {len(result.maps)} MAPs extracted.")

        return {
            "raw_text": raw_text,
            "extracted_data": result.model_dump(),
            "errors": errors,
        }

    except Exception as e:
        error_msg = f"LLM extraction failed ({mode}): {e}"
        logger.error(error_msg)
        errors.append(error_msg)

        fallback = FALLBACK_EXTRACTION.model_copy(deep=True)
        fallback.extraction_mode = "fallback"

        return {
            "raw_text": raw_text,
            "extracted_data": fallback.model_dump(),
            "errors": errors,
        }


# ── Build the Graph ─────────────────────────────────────────
def build_graph():
    """Compile the LangGraph state machine."""
    builder = StateGraph(GraphState)
    builder.add_node("extract_maps_node", extract_maps_node)
    builder.add_edge(START, "extract_maps_node")
    builder.add_edge("extract_maps_node", END)
    return builder.compile()


# Module-level compiled graph — import this from main.py
extraction_graph = build_graph()
logger.info("LangGraph extraction pipeline compiled: START → extract_maps_node → END")
