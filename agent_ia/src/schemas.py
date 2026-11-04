from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class SketchRequest(BaseModel):
    brief: str = Field(..., max_length=8000)


class CompleteRequest(BaseModel):
    snapshot: Dict[str, Any]
    nodeIds: List[str] = Field(default_factory=list)
    instruction: Optional[str] = Field(default="", max_length=8000)


class AuditRequest(BaseModel):
    snapshot: Dict[str, Any]


class ChatMessage(BaseModel):
    role: str = Field(..., description="'user' ou 'assistant'")
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    snapshot: Optional[Dict[str, Any]] = None


class FindingSeverity(str, Enum):
    CRITICAL = "CRITICAL"
    RECOMMENDED = "RECOMMENDED"
    OPTIMIZATION = "OPTIMIZATION"


class FindingCategory(str, Enum):
    RESILIENCE = "RESILIENCE"
    STACK = "STACK"
    SECURITY = "SECURITY"
    PERFORMANCE = "PERFORMANCE"


class AiFinding(BaseModel):
    id: str
    severity: FindingSeverity
    category: FindingCategory
    title: str
    targetNodeId: str
    rationale: str
    currentConfig: str
    proposedConfig: str


class ProposalResponse(BaseModel):
    canvas: Dict[str, Any]
    summary: str
    demo: bool = False


class AuditResponse(BaseModel):
    findings: List[AiFinding]
    discarded: int = 0
    demo: bool = False


class ChatResponse(BaseModel):
    reply: str
    suggestedActions: List[str] = Field(default_factory=list)
