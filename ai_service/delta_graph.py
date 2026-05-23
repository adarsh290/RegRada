import os
import logging
from typing import TypedDict, Any, List

from langgraph.graph import StateGraph, START, END
from langchain_core.prompts import ChatPromptTemplate

from models import MeasurableActionPoint, DeltaReport, DeadlineChange, ClauseModification

logger = logging.getLogger(__name__)

class DeltaGraphState(TypedDict):
    old_maps: List[dict]
    new_maps: List[dict]
    delta_report: dict
    errors: list[str]

from graph import _build_llm

def generate_delta_node(state: DeltaGraphState) -> DeltaGraphState:
    errors = list(state.get("errors", []))
    old_maps = state.get("old_maps", [])
    new_maps = state.get("new_maps", [])

    provider = os.getenv("MODEL_PROVIDER", "fallback").lower()
    base_llm, mode = _build_llm(provider)
    if base_llm is None:
        errors.append("LLM unavailable for delta generation.")
        fallback_report = {
            "deadline_changes": [],
            "clause_modifications": [],
            "obligations_added": [],
            "obligations_removed": [],
            "generated_at": ""
        }
        return {**state, "delta_report": fallback_report, "errors": errors}

    try:
        prompt = ChatPromptTemplate.from_messages([
            ("system", "You are a regulatory compliance expert analyzing amendments between an old regulatory circular and a new circular. "
             "Compare the old mandatory action points (MAPs) with the new MAPs. "
             "Identify deadline changes (old deadline to new deadline), clause modifications (summary of what changed), "
             "obligations added (titles of new MAPs not in old), and obligations removed (titles of old MAPs not in new)."),
            ("human", "Old MAPs:\n{old_maps}\n\nNew MAPs:\n{new_maps}\n\nGenerate the structured delta report.")
        ])

        chain = prompt | base_llm.with_structured_output(DeltaReport)
        
        import datetime
        import json
        
        # BUG-AI-021: Truncate old_maps and new_maps to prevent LLM context window overflow
        result: DeltaReport = chain.invoke({
            "old_maps": json.dumps(old_maps[:30], indent=2),
            "new_maps": json.dumps(new_maps[:30], indent=2)
        })
        # BUG-AI-024: Use timezone-aware datetime for generated_at
        result.generated_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
        
        return {**state, "delta_report": result.model_dump(), "errors": errors}

    except Exception as e:
        logger.error(f"Delta generation failed: {e}")
        errors.append(str(e))
        # Return fallback empty structure on error
        fallback_report = {
            "deadline_changes": [],
            "clause_modifications": [],
            "obligations_added": [],
            "obligations_removed": [],
            "generated_at": ""
        }
        return {**state, "delta_report": fallback_report, "errors": errors}

def build_delta_graph():
    builder = StateGraph(DeltaGraphState)
    builder.add_node("generate_delta", generate_delta_node)
    builder.add_edge(START, "generate_delta")
    builder.add_edge("generate_delta", END)
    return builder.compile()

delta_graph = build_delta_graph()
