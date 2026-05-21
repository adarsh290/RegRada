"""
Pydantic models for the LLM structured output.

These models define the schema that LangChain's `.with_structured_output()`
will use to coerce the LLM response into validated, typed Python objects.
"""

from pydantic import BaseModel, Field
from typing import List, Literal


class MeasurableActionPoint(BaseModel):
    """A single compliance action extracted from a regulatory circular."""

    action_title: str = Field(
        description="Clear, actionable title describing what must be done."
    )
    department: str = Field(
        description="The department or team responsible for this action."
    )
    deadline: str = Field(
        description="Compliance deadline as an ISO 8601 date string, or 'Not specified' if absent."
    )
    priority: Literal["high", "medium", "low"] = Field(
        description="Priority level: 'high', 'medium', or 'low'."
    )


class CircularExtraction(BaseModel):
    """Structured extraction result from a regulatory circular."""

    summary: str = Field(
        description="A concise 2-3 sentence summary of the circular's purpose and key requirements."
    )
    maps: List[MeasurableActionPoint] = Field(
        description="List of Measurable Action Points extracted from the circular."
    )
    extraction_mode: str = Field(
        default="fallback",
        description="How the extraction was performed: 'llm_openai', 'llm_local', or 'fallback'.",
    )
    scraped_url: str = Field(
        default="",
        description="The URL of the circular if it was autonomously scraped."
    )


# ── Dependency Detection Models ─────────────────────────────

class DependencyEdge(BaseModel):
    """A single sequencing constraint between two MAPs."""
    from_map_index: int = Field(
        description="Zero-based index of the MAP that must be completed first."
    )
    to_map_index: int = Field(
        description="Zero-based index of the MAP that is blocked until the first is done."
    )
    constraint: str = Field(
        description="One clear sentence explaining why this sequencing constraint exists."
    )


class DependencyResult(BaseModel):
    """Structured list of sequencing dependencies between MAPs."""
    edges: List[DependencyEdge] = Field(
        default=[],
        description="All detected sequencing dependencies. Empty list if none exist."
    )


# ── Validation Models ───────────────────────────────────────

class ValidationVerdict(BaseModel):
    """AI verdict on whether an uploaded proof satisfies a MAP requirement."""

    is_compliant: bool = Field(
        description="True if the proof document satisfactorily demonstrates compliance with the mandate."
    )
    confidence: float = Field(
        description="Confidence score between 0.0 (no confidence) and 1.0 (certain).",
        ge=0.0,
        le=1.0,
    )
    reasoning: str = Field(
        description="A brief explanation (2-3 sentences) of why the verdict was reached."
    )
    missing_items: List[str] = Field(
        default_factory=list,
        description="List of specific items required by the mandate that were NOT found in the proof. Empty if compliant.",
    )
    verdict: Literal["verified", "rejected"] = Field(
        description="Final verdict: 'verified' if compliant, 'rejected' if not."
    )


class ReevaluationVerdict(BaseModel):
    """AI verdict after re-evaluating a rejected MAP."""

    assigned_department: str = Field(
        description="The department the task should be assigned to after re-evaluation."
    )
    reasoning: str = Field(
        description="A brief explanation (2-3 sentences) of why the task was assigned to this department."
    )

class ReevaluateRequest(BaseModel):
    """Input to the /reevaluate endpoint."""

    action_title: str
    current_department: str
    rejection_reason: str


class ValidationRequest(BaseModel):
    """Input to the /validate endpoint."""

    original_map_action: str = Field(
        description="The original mandate text from the regulatory circular."
    )
    original_map_department: str = Field(
        description="The department this MAP was assigned to."
    )
    proof_text: str = Field(
        description="Text extracted from the uploaded proof document."
    )
