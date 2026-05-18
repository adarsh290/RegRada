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
        description="How the extraction was performed: 'llm_openai', 'llm_local', or 'fallback'."
    )
