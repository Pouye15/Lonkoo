import hmac
import json
import logging
import os
from typing import Any, Dict, List, Tuple
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse

from gemini import GeminiClient
from prompts import AUDIT_SYSTEM_PROMPT, CHAT_SYSTEM_PROMPT, COMPLETE_SYSTEM_PROMPT, SKETCH_SYSTEM_PROMPT
from schemas import (
    AiFinding,
    AuditRequest,
    AuditResponse,
    ChatRequest,
    ChatResponse,
    CompleteRequest,
    FindingCategory,
    FindingSeverity,
    ProposalResponse,
    SketchRequest,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("agent_ia")

app = FastAPI(
    title="LONKOO Agent IA",
    description="Microservice interne dédié à l'IA pour LONKOO (esquisse, complétion, audit et assistant conversationnel Systalink)",
    version="1.2.0",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)

# Pas de CORS : seul le backend appelle ce service, jamais un navigateur.

# Jeton propre à ce service (jamais celui du temps réel : un secret par service).
SERVICE_TOKEN = os.getenv("AI_SERVICE_TOKEN", "")
if not SERVICE_TOKEN:
    logger.error("AI_SERVICE_TOKEN est vide : toutes les routes (sauf /health) répondront 503 tant qu'il n'est pas défini.")
gemini_client = GeminiClient()


OPEN_PATHS = {"/health"}


def token_failure(received: bytes):
    """None si l'appel porte le bon jeton, sinon (code, message). Sans jeton configuré, tout est refusé : jamais d'accès ouvert."""
    if not SERVICE_TOKEN:
        return 503, "Service non configuré : AI_SERVICE_TOKEN est vide."
    if not hmac.compare_digest(received, SERVICE_TOKEN.encode("utf-8")):
        return 403, "Accès interdit : jeton de service invalide"
    return None


class ServiceTokenMiddleware:
    """Refuse tout appel sans le bon jeton, sauf /health.

    Middleware ASGI et non dépendance de route : FastAPI lit et valide le corps de la requête avant d'exécuter les dépendances,
    donc un appel sans jeton recevait 422 (le détail des champs attendus, ou « JSON invalide ») au lieu de 403.
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http" and scope["path"] not in OPEN_PATHS:
            failure = token_failure(dict(scope["headers"]).get(b"x-service-token", b""))
            if failure:
                response = JSONResponse({"detail": failure[1]}, status_code=failure[0])
                await response(scope, receive, send)
                return
        await self.app(scope, receive, send)


app.add_middleware(ServiceTokenMiddleware)


@app.get("/health")
async def health():
    return {
        "status": "UP",
        "service": "agent_ia",
        "model": gemini_client.model,
    }


@app.post("/sketch", response_model=ProposalResponse)
async def sketch(req: SketchRequest):
    user_prompt = f"Voici le cahier des charges de l'application à concevoir :\n\n{req.brief}"
    result = await gemini_client.ask_for_canvas(SKETCH_SYSTEM_PROMPT, user_prompt)
    return ProposalResponse(**result)


@app.post("/complete", response_model=ProposalResponse)
async def complete(req: CompleteRequest):
    node_filter = f"\n\nBlocs ciblés par la demande : {', '.join(req.nodeIds)}" if req.nodeIds else ""
    user_prompt = (
        f"Voici l'état actuel de l'architecture du canvas (au format JSON) :\n"
        f"{_snapshot_json(req.snapshot)}"
        f"{node_filter}\n\n"
        f"Consigne d'évolution : {req.instruction or 'Complète et améliore logiquement cette architecture.'}"
    )
    result = await gemini_client.ask_for_canvas(COMPLETE_SYSTEM_PROMPT, user_prompt)
    return ProposalResponse(**result)


@app.post("/audit", response_model=AuditResponse)
async def audit(req: AuditRequest):
    snapshot = req.snapshot or {}
    user_prompt = f"Voici le canvas d'architecture à auditer (au format JSON) :\n{_snapshot_json(snapshot)}"

    messages = [
        {"role": "system", "content": AUDIT_SYSTEM_PROMPT},
        {"role": "user", "content": user_prompt},
    ]

    raw_output = await gemini_client.call_llm(messages, json_format=True)
    parsed = gemini_client._extract_json(raw_output)

    nodes = snapshot.get("nodes")
    existing_node_ids = {n.get("id") for n in nodes if isinstance(n, dict)} if isinstance(nodes, list) else set()

    findings, discarded = parse_findings(parsed, existing_node_ids)
    return AuditResponse(findings=findings, discarded=discarded, demo=False)


def _snapshot_json(snapshot: Dict[str, Any]) -> str:
    """L'instantané en vrai JSON (et non la représentation Python d'un dictionnaire : guillemets simples, True, None)."""
    return json.dumps(snapshot, ensure_ascii=False)


def _text(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def parse_findings(parsed: Any, existing_node_ids: set) -> Tuple[List[AiFinding], int]:
    """Garde les remarques complètes et valides ; les autres sont écartées et comptées, jamais corrigées ni complétées.

    Une réponse qui n'est pas une liste de remarques n'est pas un audit « sans remarque » : elle est refusée (502).
    """
    raw = parsed.get("findings") if isinstance(parsed, dict) else None
    if not isinstance(raw, list):
        logger.error("Audit : la réponse du fournisseur ne contient pas de liste de remarques")
        raise HTTPException(status_code=502, detail="Réponse invalide du fournisseur d'IA : aucune liste de remarques.")

    findings: List[AiFinding] = []
    discarded = 0
    for idx, item in enumerate(raw, start=1):
        finding = _finding_from(item, idx, existing_node_ids)
        if finding is None:
            discarded += 1
        else:
            findings.append(finding)
    return findings, discarded


def _finding_from(item: Any, idx: int, existing_node_ids: set):
    if not isinstance(item, dict):
        return None
    target = item.get("targetNodeId")
    title = _text(item.get("title"))
    if not isinstance(target, str) or target not in existing_node_ids or not title:
        return None
    try:
        severity = FindingSeverity(_text(item.get("severity")).upper())
        category = FindingCategory(_text(item.get("category")).upper())
    except ValueError:
        return None
    return AiFinding(
        id=_text(item.get("id")) or f"remarque_{idx}",
        severity=severity,
        category=category,
        title=title,
        targetNodeId=target,
        rationale=_text(item.get("rationale")),
        currentConfig=_text(item.get("currentConfig")),
        proposedConfig=_text(item.get("proposedConfig")),
    )


def _build_chat_messages(req: ChatRequest) -> List[Dict[str, str]]:
    system_instruction = CHAT_SYSTEM_PROMPT
    if req.snapshot:
        system_instruction += f"\n\n[Contexte facultatif] État actuel du canvas d'architecture de l'utilisateur :\n{json.dumps(req.snapshot, ensure_ascii=False)}"

    conversation_messages: List[Dict[str, str]] = [
        {"role": "system", "content": system_instruction}
    ]

    for m in req.messages:
        role = "assistant" if m.role == "assistant" else "user"
        conversation_messages.append({"role": role, "content": m.content})

    return conversation_messages


def _extract_suggestions(last_user_msg: str, reply: str) -> List[str]:
    lower_u = last_user_msg.lower().strip()
    lower_r = reply.lower()

    if lower_u in ["salut", "bonjour", "hello", "coucou", "yo", "hi", "bonsoir"]:
        return [
            "Concevoir une architecture pour mon projet",
            "Découvrir les offres Cloud Systalink",
            "Auditer mon architecture actuelle"
        ]

    suggested: List[str] = []
    if "systalink" in lower_r or "cloud" in lower_r or "déploy" in lower_r:
        suggested.append("Découvrir les offres Cloud Systalink (https://systalink.com/fr)")
    if "orion" in lower_r:
        suggested.append("Générer mon site avec Orion (Systalink)")
    if "mcp" in lower_r:
        suggested.append("Activer la Connexion MCP sur mon infrastructure")
    if "cache" in lower_r or "redis" in lower_r:
        suggested.append("Ajouter un composant Redis/Valkey pour le cache")

    if not suggested:
        suggested = [
            "Conseils pour mon architecture",
            "Plan de déploiement sur un serveur cloud",
            "Brancher des agents IA avec la Connexion MCP"
        ]

    return suggested[:3]


@app.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    messages = _build_chat_messages(req)

    reply = await gemini_client.call_llm(
        messages,
        json_format=False,
        temperature=0.5
    )

    last_user_msg = req.messages[-1].content if req.messages else ""
    suggested = _extract_suggestions(last_user_msg, reply)

    return ChatResponse(reply=reply, suggestedActions=suggested)


@app.post("/chat/stream")
async def chat_stream(req: ChatRequest):
    messages = _build_chat_messages(req)

    return StreamingResponse(
        gemini_client.stream_llm(messages, temperature=0.5),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )
