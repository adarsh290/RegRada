"""
Pydantic models for the LLM structured output.

These models define the schema that LangChain's `.with_structured_output()`
will use to coerce the LLM response into validated, typed Python objects.
"""

from pydantic import BaseModel, Field, model_validator
from typing import List, Literal, Optional
from enum import Enum


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
    action_confidence: float = Field(
        default=1.0,
        description="Confidence score (0.0-1.0) on how explicitly the action is stated. 1.0 = verbatim, 0.0 = inferred/vague.",
        ge=0.0,
        le=1.0,
    )
    dept_confidence: float = Field(
        default=1.0,
        description="Confidence score (0.0-1.0) on how clearly a specific department is named.",
        ge=0.0,
        le=1.0,
    )
    deadline_confidence: float = Field(
        default=1.0,
        description="Confidence score (0.0-1.0) on how precisely the deadline is stated. 1.0 = explicit date, 0.1 = 'as soon as possible'.",
        ge=0.0,
        le=1.0,
    )
    confidence: float = Field(
        default=1.0,
        description="Overall confidence, computed as min(action_confidence, dept_confidence, deadline_confidence).",
        ge=0.0,
        le=1.0,
    )
    confidence_flags: List[str] = Field(
        default_factory=list,
        description="List of free-text reasons for low confidence scores, if any."
    )

    @model_validator(mode='after')
    def compute_confidence(self) -> "MeasurableActionPoint":
        self.confidence = min(self.action_confidence, self.dept_confidence, self.deadline_confidence)
        return self


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
    raw_text: str = Field(
        default="",
        description="The raw text extracted from the PDF if available."
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


# ── Delta Detection Models ──────────────────────────────────

class DeadlineChange(BaseModel):
    map_id: str = Field(description="The map_id of the original obligation.")
    old_deadline: str
    new_deadline: str

class ClauseModification(BaseModel):
    map_id: str = Field(description="The map_id of the original obligation.")
    summary: str = Field(description="One sentence summarizing what changed.")

class DeltaReport(BaseModel):
    deadline_changes: List[DeadlineChange] = Field(default_factory=list)
    clause_modifications: List[ClauseModification] = Field(default_factory=list)
    obligations_added: List[str] = Field(default_factory=list, description="Titles of new obligations.")
    obligations_removed: List[str] = Field(default_factory=list, description="Titles of removed obligations.")
    generated_at: str = Field(default="", description="ISO timestamp of when the report was generated.")


# ── Conflict Detection Models ───────────────────────────────

class ConflictType(str, Enum):
    DEADLINE_CONFLICT = "deadline_conflict"
    CONTRADICTORY_REQUIREMENT = "contradictory_requirement"
    JURISDICTION_OVERLAP = "jurisdiction_overlap"

class ConflictReport(BaseModel):
    map_id_a: str
    circular_id_a: str
    map_id_b: str
    circular_id_b: str
    conflict_type: ConflictType
    explanation: str = Field(description="One sentence explaining the conflict to the CO.")
    severity: Literal["high", "medium", "low"]


# ── Natural Language Query Models ───────────────────────────

class QueryResult(BaseModel):
    map_id: str
    circular_id: str
    circular_title: str
    circular_source: str
    action_title: str
    department: str
    deadline: str
    priority: str
    relevance_score: float = Field(description="0.0-1.0 LLM-assigned score.")
    relevance_reason: str = Field(description="One sentence why this MAP matches the query.")
