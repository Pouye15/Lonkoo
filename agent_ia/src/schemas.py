"""Formes d'entrée et de sortie du microservice.

Le microservice se défend seul : même si le backend borne déjà les requêtes, toute
entrée est bornée ici (nombre de messages, longueur des textes, taille sérialisée de
l'instantané). Un dépassement est refusé par Pydantic, donc en HTTP 422, avec un
message en français.
"""

import json
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, field_validator

# Bornes d'entrée (alignées sur celles du backend).
MAX_TEXT_CHARS = 8000
MAX_MESSAGES = 20
MAX_MESSAGE_CHARS = 8000
MAX_NODE_IDS = 200
MAX_SNAPSHOT_BYTES = 1024 * 1024  # 1 Mio sérialisé


def _check_text(value: Optional[str], limit: int, label: str) -> Optional[str]:
    """Refuse un texte au-delà de la borne, avec un message en français."""
    if value is None:
        return value
    if len(value) > limit:
        raise ValueError(f"{label} : {limit} caractères au maximum")
    return value


def _check_snapshot(value: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Refuse un instantané de canvas dont la taille sérialisée dépasse 1 Mio."""
    if value is None:
        return value
    try:
        size = len(json.dumps(value, ensure_ascii=False).encode("utf-8"))
    except (TypeError, ValueError):
        raise ValueError("Instantané du canvas illisible : JSON attendu")
    if size > MAX_SNAPSHOT_BYTES:
        raise ValueError("Instantané du canvas trop volumineux : 1 Mio au maximum")
    return value


class SketchRequest(BaseModel):
    brief: str = Field(...)

    @field_validator("brief")
    @classmethod
    def _borne_brief(cls, value: str) -> str:
        return _check_text(value, MAX_TEXT_CHARS, "Cahier des charges trop long")


class CompleteRequest(BaseModel):
    snapshot: Dict[str, Any]
    nodeIds: List[str] = Field(default_factory=list)
    instruction: Optional[str] = Field(default="")

    @field_validator("snapshot")
    @classmethod
    def _borne_snapshot(cls, value):
        return _check_snapshot(value)

    @field_validator("instruction")
    @classmethod
    def _borne_instruction(cls, value: Optional[str]) -> Optional[str]:
        return _check_text(value, MAX_TEXT_CHARS, "Consigne trop longue")

    @field_validator("nodeIds")
    @classmethod
    def _borne_node_ids(cls, value: List[str]) -> List[str]:
        if len(value) > MAX_NODE_IDS:
            raise ValueError(f"Trop de blocs ciblés : {MAX_NODE_IDS} au maximum")
        return value


class AuditRequest(BaseModel):
    snapshot: Dict[str, Any]

    @field_validator("snapshot")
    @classmethod
    def _borne_snapshot(cls, value):
        return _check_snapshot(value)


class ChatMessage(BaseModel):
    role: str = Field(..., description="'user' ou 'assistant'")
    content: str

    @field_validator("content")
    @classmethod
    def _borne_content(cls, value: str) -> str:
        return _check_text(value, MAX_MESSAGE_CHARS, "Message trop long")


class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    snapshot: Optional[Dict[str, Any]] = None

    @field_validator("snapshot")
    @classmethod
    def _borne_snapshot(cls, value):
        return _check_snapshot(value)

    @field_validator("messages")
    @classmethod
    def _borne_messages(cls, value: List[ChatMessage]) -> List[ChatMessage]:
        if len(value) > MAX_MESSAGES:
            raise ValueError(f"Conversation trop longue : {MAX_MESSAGES} messages au maximum")
        return value


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
    # Champs facultatifs : renseignés uniquement si le modèle les fournit, jamais fabriqués.
    patch: Optional[Dict[str, Any]] = None
    impactScore: Optional[str] = None


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
