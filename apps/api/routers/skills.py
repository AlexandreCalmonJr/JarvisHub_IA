import logging
from fastapi import APIRouter, HTTPException

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


@router.get("/api/v1/skills")
async def list_skills_endpoint():
    return skills_catalog.list_all_skills()


@router.post("/api/v1/skills/{skill_id}/toggle")
async def toggle_skill_endpoint(skill_id: str):
    skill = skills_catalog.get_skill(skill_id)
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
async def assign_agents_endpoint(skill_id: str, payload: AssignAgentsRequest):
    try:
        updated = skills_catalog.assign_agents(skill_id, payload.agent_roles)
        return {"status": "updated", "skill": updated}
    except ValueError as ve:
        raise HTTPException(status_code=404, detail=str(ve))


@router.get("/api/v1/skills/ponytail")
async def get_ponytail_status_endpoint():
    level = db_manager.get_ponytail_level()
    return {
        "level": level,
        "active": level != "off",
        "description": "Diretrizes estritas de minimalismo técnico (YAGNI, DRY e Zero Dependências Desnecessárias).",
    }


@router.post("/api/v1/skills/ponytail")
async def set_ponytail_level_endpoint(payload: PonytailConfigRequest):
    valid_levels = ("off", "lite", "senior", "ultra")
    clean_level = payload.level.lower().strip()
    if clean_level not in valid_levels:
        clean_level = "senior"
    db_manager.set_ponytail_level(clean_level)
    return {"status": "updated", "level": clean_level}


@router.post("/api/v1/skills/create")
async def create_user_skill_endpoint(payload: CreateSkillRequest):
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
    db_manager.save_user_skill(skill_dict)
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
async def delete_user_skill_endpoint(skill_id: str):
    deleted = db_manager.delete_user_skill(skill_id)
    skills_catalog.revoke_skill(skill_id, reason="Removido pelo usuário")
    return {"status": "deleted" if deleted else "not_found", "skill_id": skill_id}


@router.post("/api/v1/skills/import-ecc")
async def import_ecc_skill_endpoint(payload: ImportEccSkillRequest):
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
    db_manager.save_user_skill(skill_dict)
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
