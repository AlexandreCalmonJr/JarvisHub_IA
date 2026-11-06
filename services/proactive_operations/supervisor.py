import uuid
from datetime import datetime

from packages.contracts.security import AuditEventSeverity
from services.security_core import ApprovalEngine, AuditTrail

from .types import ProactiveFinding, ProactivePolicy


class ProactiveBudgetExceededError(Exception):
    pass


class ProactiveSupervisor:
    """
    Supervisor do Modo Autónomo Supervisionado.
    Executa varreduras de manutenção periódicas, respeita tetos orçamentais de recursos
    e garante o invariante inquebrável: NENHUMA alteração é aplicada sem aprovação humana.
    """

    def __init__(
        self,
        approval_engine: ApprovalEngine,
        policy: ProactivePolicy | None = None,
        audit_trail: AuditTrail | None = None,
    ):
        self.approval_engine = approval_engine
        self.policy = policy or ProactivePolicy()
        self.audit_trail = audit_trail
        self._findings: list[ProactiveFinding] = []

    def can_run_inspection(self) -> bool:
        if not self.policy.enabled:
            return False

        now = datetime.now()
        current_hour = now.hour
        if not (self.policy.allowed_start_hour <= current_hour <= self.policy.allowed_end_hour):
            return False

        return self.policy.current_inspections_today < self.policy.max_inspections_per_day

    def run_proactive_check(
        self,
        project_id: str,
        findings_to_report: list[dict[str, str]] | None = None,
    ) -> list[ProactiveFinding]:
        if not self.can_run_inspection():
            raise ProactiveBudgetExceededError(
                "Limite diário de inspeções proativas ou horário não permitido atingido."
            )

        self.policy.current_inspections_today += 1
        created_findings: list[ProactiveFinding] = []

        # Simula achados de manutenção (ex: dependências desatualizadas, melhorias de lint)
        samples = findings_to_report or [
            {
                "title": "Dependência Desatualizada Detetada",
                "description": "Biblioteca 'crypto' na versão 3.0.1 tem atualização de segurança recomendada 3.0.3.",
                "severity": "HIGH",
                "patch": "--- pubspec.yaml\n+++ pubspec.yaml\n-  crypto: ^3.0.1\n+  crypto: ^3.0.3",
            }
        ]

        for item in samples:
            finding_id = f"find-{uuid.uuid4().hex[:8]}"
            approval_id = None

            # Invariante estrita: se houver proposta de alteração de código, submete à aprovação humana
            if item.get("patch"):
                req = self.approval_engine.create_request(
                    task_id=f"proactive-{finding_id}",
                    agent_role="jarvis_master",
                    operation="PROACTIVE_CODE_PATCH_APPLICATION",
                    impact_summary=f"Aplicação proativa recomendada: {item['title']}",
                    affected_resources=[f"project:{project_id}"],
                    proposed_diff=item["patch"],
                    reversible=True,
                )
                approval_id = req.id

            finding = ProactiveFinding(
                id=finding_id,
                project_id=project_id,
                title=item["title"],
                description=item["description"],
                severity=item.get("severity", "MEDIUM"),
                proposed_patch=item.get("patch"),
                approval_request_id=approval_id,
            )
            self._findings.append(finding)
            created_findings.append(finding)

            if self.audit_trail:
                self.audit_trail.record_event(
                    operation="PROACTIVE_FINDING_REPORTED",
                    status="AWAITING_APPROVAL" if approval_id else "RECORDED",
                    parameters={"project_id": project_id, "finding_id": finding_id},
                    severity=AuditEventSeverity.WARNING if item.get("severity") == "HIGH" else AuditEventSeverity.INFO,
                    reason=f"Achado de manutenção gerado proativamente: {item['title']}",
                )

        return created_findings

    def list_findings(self, project_id: str | None = None) -> list[ProactiveFinding]:
        if project_id:
            return [f for f in self._findings if f.project_id == project_id]
        return self._findings
