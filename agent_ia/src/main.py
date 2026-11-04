import json
import logging
import os
from typing import Any, Dict, List
from fastapi import FastAPI, Header, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

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
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SERVICE_TOKEN = os.getenv("AI_SERVICE_TOKEN", os.getenv("REALTIME_SERVICE_TOKEN", ""))
gemini_client = GeminiClient()


def verify_service_token(x_service_token: str = Header(default="")):
    """Vérifie le jeton de service interne s'il est configuré."""
    if SERVICE_TOKEN and x_service_token != SERVICE_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès interdit : jeton de service invalide"
        )


@app.get("/health")
async def health():
    return {
        "status": "UP",
        "service": "agent_ia",
        "model": gemini_client.model,
    }


@app.post("/sketch", response_model=ProposalResponse)
async def sketch(req: SketchRequest, x_service_token: str = Header(default="")):
    verify_service_token(x_service_token)
    user_prompt = f"Voici le cahier des charges de l'application à concevoir :\n\n{req.brief}"
    result = await gemini_client.ask_for_canvas(SKETCH_SYSTEM_PROMPT, user_prompt)
    return ProposalResponse(**result)


@app.post("/complete", response_model=ProposalResponse)
async def complete(req: CompleteRequest, x_service_token: str = Header(default="")):
    verify_service_token(x_service_token)
    node_filter = f"\n\nBlocs ciblés par la demande : {', '.join(req.nodeIds)}" if req.nodeIds else ""
    user_prompt = (
        f"Voici l'état actuel de l'architecture du canvas (au format JSON) :\n"
        f"{req.snapshot}"
        f"{node_filter}\n\n"
        f"Consigne d'évolution : {req.instruction or 'Complète et améliore logiquement cette architecture.'}"
    )
    result = await gemini_client.ask_for_canvas(COMPLETE_SYSTEM_PROMPT, user_prompt)
    return ProposalResponse(**result)


@app.post("/audit", response_model=AuditResponse)
async def audit(req: AuditRequest, x_service_token: str = Header(default="")):
    verify_service_token(x_service_token)
    snapshot = req.snapshot or {}
    user_prompt = f"Voici le canvas d'architecture à auditer (au format JSON) :\n{snapshot}"

    messages = [
        {"role": "system", "content": AUDIT_SYSTEM_PROMPT},
        {"role": "user", "content": user_prompt},
    ]

    raw_output = await gemini_client.call_llm(messages, json_format=True)
    parsed = gemini_client._extract_json(raw_output)

    existing_node_ids = {n.get("id") for n in snapshot.get("nodes", []) if isinstance(n, dict)}

    findings: List[AiFinding] = []
    discarded = 0

    for idx, item in enumerate(parsed.get("findings", []), start=1):
        target = item.get("targetNodeId")
        if not target or target not in existing_node_ids:
            discarded += 1
            continue

        try:
            sev = FindingSeverity(item.get("severity", "RECOMMENDED").upper())
        except Exception:
            sev = FindingSeverity.RECOMMENDED

        try:
            cat = FindingCategory(item.get("category", "STACK").upper())
        except Exception:
            cat = FindingCategory.STACK

        patch = item.get("patch")
        if not patch or not isinstance(patch, dict):
            proposed = item.get("proposedConfig", "")
            patch = {
                "tech": proposed[:40] if proposed else "Stack Optimisée",
                "version": "ha-latest",
                "replicas": 2,
                "status": "Optimisé",
                "metricValue": "+35% RPS",
            }

        findings.append(
            AiFinding(
                id=item.get("id") or f"remarque_{idx}",
                severity=sev,
                category=cat,
                title=item.get("title") or "Remarque d'architecture",
                targetNodeId=target,
                rationale=item.get("rationale") or "",
                currentConfig=item.get("currentConfig") or "",
                proposedConfig=item.get("proposedConfig") or "",
                patch=patch,
                impactScore=item.get("impactScore") or "+14 pts Score IA",
            )
        )

    return AuditResponse(findings=findings, discarded=discarded, demo=False)


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
    if "base" in lower_r or "database" in lower_r or "postgres" in lower_r:
        suggested.append("Héberger PostgreSQL sur DBaaS Systalink (Dakar)")
    if "sécurité" in lower_r or "security" in lower_r or "ddos" in lower_r:
        suggested.append("Activer la protection anti-DDoS Systalink")
    if "cache" in lower_r or "redis" in lower_r:
        suggested.append("Ajouter un composant Redis/Valkey pour le cache")

    if not suggested:
        suggested = [
            "Conseils pour mon architecture",
            "Plan de déploiement sur VPS Dakar",
            "Piloter mon infrastructure avec Yokk & MCP"
        ]

    return suggested[:3]


@app.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest, x_service_token: str = Header(default="")):
    verify_service_token(x_service_token)
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
async def chat_stream(req: ChatRequest, x_service_token: str = Header(default="")):
    verify_service_token(x_service_token)
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
