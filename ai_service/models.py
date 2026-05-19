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
