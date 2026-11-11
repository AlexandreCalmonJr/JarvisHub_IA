import logging
from fastapi import APIRouter, Depends, HTTPException

from apps.api.auth import Principal, get_principal

from apps.api.schemas import (
    AssignAgentsRequest,
    PonytailConfigRequest,
    CreateSkillRequest,
    ImportEccSkillRequest,
)
from apps.api.deps import (
    skills_catalog,
    db_manager,
    SkillMetadata,
    SkillValidator,
)

logger = logging.getLogger("jarvis.api.skills")
router = APIRouter(tags=["skills"])


def _skill_owner(principal: Principal) -> str:
    if principal.kind == "device" and principal.subject_id.startswith("device:"):
        raise HTTPException(status_code=403, detail="Dispositivo sem associação a uma conta.")
    return principal.subject_id


@router.get("/api/v1/skills")
async def list_skills_endpoint(principal: Principal = Depends(get_principal)):
    owner = _skill_owner(principal)
    shared = [
        skill.model_dump()
        for skill in skills_catalog.list_all_skills()
        if getattr(skill, "origin", None) not in {"user_created", "imported_ecc"}
    ]
    return shared + db_manager.list_user_skills(owner_user_id=owner)


@router.post("/api/v1/skills/{skill_id}/toggle")
async def toggle_skill_endpoint(
    skill_id: str, principal: Principal = Depends(get_principal)
):
    owner = _skill_owner(principal)
    private_skill = db_manager.get_user_skill(skill_id, owner_user_id=owner)
    skill = skills_catalog.get_skill(skill_id)
    if private_skill:
        private_skill["is_approved"] = not bool(private_skill.get("is_approved", True))
        db_manager.save_user_skill(private_skill, owner_user_id=owner)
        if private_skill["is_approved"]:
            approved = skills_catalog.approve_skill(skill_id)
            return {"status": "approved", "skill": approved}
        revoked = skills_catalog.revoke_skill(skill_id, reason="Desativado pelo proprietário")
        return {"status": "revoked", "skill": revoked}
    if skill and principal.role != "admin":
        raise HTTPException(status_code=403, detail="Apenas administradores podem alterar skills globais.")
    if skill:
        revoked = skills_catalog.revoke_skill(skill_id, reason="Desativado via dashboard")
        return {"status": "revoked", "skill": revoked}
    else:
        try:
            approved = skills_catalog.approve_skill(skill_id)
            return {"status": "approved", "skill": approved}
        except ValueError as ve:
            raise HTTPException(status_code=404, detail=str(ve))


@router.post("/api/v1/skills/{skill_id}/assign-agents")
async def assign_agents_endpoint(
    skill_id: str, payload: AssignAgentsRequest,
    principal: Principal = Depends(get_principal),
):
    owner = _skill_owner(principal)
    private_skill = db_manager.get_user_skill(skill_id, owner_user_id=owner)
    if private_skill:
        private_skill["assigned_agents"] = payload.agent_roles
        db_manager.save_user_skill(private_skill, owner_user_id=owner)
        updated = skills_catalog.assign_agents(skill_id, payload.agent_roles)
        return {"status": "updated", "skill": updated}
    if principal.role != "admin":
        raise HTTPException(status_code=403, detail="Apenas administradores podem alterar skills globais.")
    try:
        updated = skills_catalog.assign_agents(skill_id, payload.agent_roles)
        return {"status": "updated", "skill": updated}
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))


@router.get("/api/v1/skills/ponytail")
async def get_ponytail_status_endpoint(principal: Principal = Depends(get_principal)):
    level = db_manager.get_ponytail_level()
    return {
        "level": level,
        "active": level != "off",
        "description": "Diretrizes estritas de minimalismo técnico (YAGNI, DRY e Zero Dependências Desnecessárias).",
    }


@router.post("/api/v1/skills/ponytail")
async def set_ponytail_level_endpoint(
    payload: PonytailConfigRequest, principal: Principal = Depends(get_principal)
):
    if principal.role != "admin":
        raise HTTPException(status_code=403, detail="Apenas administradores podem alterar a política global Ponytail.")
    valid_levels = ("off", "lite", "senior", "ultra")
    clean_level = payload.level.lower().strip()
    if clean_level not in valid_levels:
        clean_level = "senior"
    db_manager.set_ponytail_level(clean_level)
    return {"status": "updated", "level": clean_level}


@router.post("/api/v1/skills/create")
async def create_user_skill_endpoint(
    payload: CreateSkillRequest, principal: Principal = Depends(get_principal)
):
    skill_id = payload.id or payload.name.lower().replace(" ", "_").replace("-", "_")
    skill_dict = {
        "id": skill_id,
        "name": payload.name,
        "version": "1.0.0",
        "origin": "user_created",
        "domain": payload.domain,
        "description": payload.description,
        "instructions": payload.instructions,
        "assigned_agents": payload.assigned_agents,
        "is_approved": True,
    }
    owner = _skill_owner(principal)
    try:
        db_manager.save_user_skill(skill_dict, owner_user_id=owner)
    except PermissionError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    content_hash = SkillValidator.compute_hash(payload.instructions, {})
    meta = SkillMetadata(
        id=skill_id,
        name=payload.name,
        version="1.0.0",
        origin="user_created",
        license="MIT",
        description=payload.description,
        domain=payload.domain,
        allowed_tools=[],
        required_permissions=[],
        assigned_agents=payload.assigned_agents,
        content_hash=content_hash,
        is_approved=True,
        instructions=payload.instructions,
    )
    skills_catalog.register_skill(meta, auto_approve=True)
    return {"status": "created", "skill": meta.model_dump()}


@router.delete("/api/v1/skills/{skill_id}")
async def delete_user_skill_endpoint(
    skill_id: str, principal: Principal = Depends(get_principal)
):
    owner = _skill_owner(principal)
    if not db_manager.get_user_skill(skill_id, owner_user_id=owner):
        raise HTTPException(status_code=404, detail="Skill não encontrada.")
    deleted = db_manager.delete_user_skill(skill_id, owner_user_id=owner)
    skills_catalog.revoke_skill(skill_id, reason="Removido pelo proprietário")
    return {"status": "deleted" if deleted else "not_found", "skill_id": skill_id}


@router.post("/api/v1/skills/import-ecc")
async def import_ecc_skill_endpoint(
    payload: ImportEccSkillRequest, principal: Principal = Depends(get_principal)
):
    text = payload.content.strip()
    name = "Skill Importada ECC"
    desc = "Habilidade importada do ecossistema ECC"
    domain = "backend"
    instructions = text

    if text.startswith("---"):
        parts = text.split("---", 2)
        if len(parts) >= 3:
            header = parts[1]
            instructions = parts[2].strip()
            for line in header.split("\n"):
                if line.startswith("name:"):
                    name = line.replace("name:", "").strip()
                elif line.startswith("description:"):
                    desc = line.replace("description:", "").strip()
                elif line.startswith("domain:"):
                    domain = line.replace("domain:", "").strip()

    skill_id = name.lower().replace(" ", "_").replace("-", "_")[:32]
    skill_dict = {
        "id": skill_id,
        "name": name,
        "version": "1.0.0",
        "origin": "imported_ecc",
        "domain": domain,
        "description": desc,
        "instructions": instructions,
        "assigned_agents": ["jarvis_master"],
        "is_approved": True,
    }
    owner = _skill_owner(principal)
    try:
        db_manager.save_user_skill(skill_dict, owner_user_id=owner)
    except PermissionError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    meta = SkillMetadata(
        id=skill_id,
        name=name,
        version="1.0.0",
        origin="imported_ecc",
        license="MIT",
        description=desc,
        domain=domain,
        allowed_tools=[],
        required_permissions=[],
        assigned_agents=["jarvis_master"],
        content_hash=SkillValidator.compute_hash(instructions, {}),
        is_approved=True,
        instructions=instructions,
    )
    skills_catalog.register_skill(meta, auto_approve=True)
    return {"status": "imported", "skill": meta.model_dump()}
