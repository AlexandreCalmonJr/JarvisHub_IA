from __future__ import annotations

import re
from pathlib import Path
from typing import TYPE_CHECKING

from packages.contracts.agent import AgentRole
from packages.contracts.security import AuditEventSeverity

from .audit_trail import AuditTrail
from .pipeline_types import (
    FindingSeverity,
    FindingStatus,
    PipelineGateResult,
    SecurityFinding,
    StackType,
)

if TYPE_CHECKING:
    from services.tool_gateway import ToolGateway

SECRET_PATTERNS = [
    (
        re.compile(
            r'(?i)(api[_-]?key|secret|password|passwd|token)\s*[:=]\s*["\']([^"\'\s]{8,})["\']'
        ),
        "HARDCODED_SECRET",
    ),
    (re.compile(r"sk-[a-zA-Z0-9]{20,}"), "OPENAI_API_KEY"),
    (re.compile(r"ghp_[a-zA-Z0-9]{36}"), "GITHUB_TOKEN"),
    (re.compile(r"-----BEGIN\s+PRIVATE\s+KEY-----"), "PRIVATE_KEY_EXPOSURE"),
]

# Amostra de dependências sabidamente vulneráveis ou desatualizadas para auditoria
KNOWN_VULNERABLE_PACKAGES = {
    "requests": ["2.20.0", "2.19.0"],
    "urllib3": ["1.24.1", "1.25.0"],
    "lodash": ["4.17.11"],
}


class QASecurityPipeline:
    """
    Pipeline automatizado de QA e Segurança.
    Executa testes, linter, análise de segredos (SAST/Gitleaks) e gates de risco.
    Vulnerabilidade crítica ou falha de teste bloqueia a entrega.
    """

    def __init__(
        self, tool_gateway: ToolGateway | None = None, audit_trail: AuditTrail | None = None
    ):
        self.tool_gateway = tool_gateway
        self.audit_trail = audit_trail

    def detect_stack(self, project_root: Path) -> StackType:
        if (project_root / "pubspec.yaml").exists():
            return StackType.FLUTTER
        if (project_root / "pyproject.toml").exists() or (
            project_root / "requirements.txt"
        ).exists():
            return StackType.PYTHON
        if (project_root / "package.json").exists():
            return StackType.REACT_TYPESCRIPT
        if any(project_root.glob("*.csproj")):
            return StackType.CSHARP
        return StackType.GENERIC

    def scan_for_secrets(self, project_root: Path) -> list[SecurityFinding]:
        findings: list[SecurityFinding] = []
        ignored_dirs = {".git", ".venv", "node_modules", "build", "dist", ".dart_tool"}

        for p in project_root.rglob("*"):
            if p.is_dir() or any(part in ignored_dirs for part in p.parts):
                continue
            if p.suffix.lower() not in (
                ".dart",
                ".py",
                ".ts",
                ".js",
                ".json",
                ".yaml",
                ".yml",
                ".env",
            ):
                continue

            try:
                lines = p.read_text(encoding="utf-8", errors="replace").splitlines()
            except OSError:
                continue

            for idx, line in enumerate(lines, start=1):
                for pattern, rule_id in SECRET_PATTERNS:
                    if pattern.search(line):
                        findings.append(
                            SecurityFinding(
                                rule_id=rule_id,
                                severity=FindingSeverity.CRITICAL,
                                status=FindingStatus.CONFIRMED,
                                file_path=p.relative_to(project_root).as_posix(),
                                line_number=idx,
                                description=f"Segredo ou credencial em texto claro detetada pela regra {rule_id}.",
                                snippet=line.strip()[:80],
                                remediation="Remova o segredo do código-fonte e utilize variáveis de ambiente ou Secrets Vault.",
                            )
                        )
        return findings

    async def run_pipeline(
        self,
        project_root: Path,
        project_id: str,
        skip_tests: bool = False,
    ) -> PipelineGateResult:
        stack = self.detect_stack(project_root)
        findings: list[SecurityFinding] = []
        evidence: list[str] = [f"Stack identificada: {stack.value}"]
        tests_passed = True
        lint_passed = True

        # 1. Varredura SAST / Segredos
        secret_findings = self.scan_for_secrets(project_root)
        findings.extend(secret_findings)
        if secret_findings:
            evidence.append(f"SAST: {len(secret_findings)} segredos detetados no repositório.")
        else:
            evidence.append("SAST: Nenhum segredo detetado no código.")

        # 2. Execução de Linter (se tool_gateway configurado)
        if self.tool_gateway:
            from services.tool_gateway import ToolExecutionRequest

            try:
                req_lint = ToolExecutionRequest(
                    tool_name="run_linter",
                    agent_role=AgentRole.QA_ENGINEER.value,
                    project_id=project_id,
                )
                lint_res = await self.tool_gateway.execute_tool(req_lint)
                lint_passed = lint_res.success
                evidence.append(f"Linter ({stack.value}): {'Sucesso' if lint_passed else 'Falha'}")
            except Exception as e:
                lint_passed = False
                findings.append(
                    SecurityFinding(
                        rule_id="LINTER_ERROR",
                        severity=FindingSeverity.MEDIUM,
                        description=f"Erro ao executar linter: {e}",
                    )
                )

        # 3. Execução de Testes (se tool_gateway configurado e não pulado)
        if self.tool_gateway and not skip_tests:
            try:
                req_test = ToolExecutionRequest(
                    tool_name="run_tests",
                    agent_role=AgentRole.QA_ENGINEER.value,
                    project_id=project_id,
                )
                test_res = await self.tool_gateway.execute_tool(req_test)
                tests_passed = test_res.success
                evidence.append(
                    f"Testes Unitários ({stack.value}): {'Sucesso' if tests_passed else 'Falha'}"
                )
                if not tests_passed:
                    findings.append(
                        SecurityFinding(
                            rule_id="TEST_FAILURE",
                            severity=FindingSeverity.CRITICAL,
                            description=f"A suíte de testes falhou (Exit Code {test_res.exit_code}).",
                            snippet=test_res.stderr or test_res.stdout[:200],
                            remediation="Corrija as falhas de teste antes de solicitar aprovação de entrega.",
                        )
                    )
            except Exception as e:
                tests_passed = False
                findings.append(
                    SecurityFinding(
                        rule_id="TEST_EXECUTION_ERROR",
                        severity=FindingSeverity.CRITICAL,
                        description=f"Não foi possível executar a suíte de testes: {e}",
                    )
                )

        # 4. Avaliação do Gate de Qualidade e Segurança
        critical_count = sum(1 for f in findings if f.severity == FindingSeverity.CRITICAL)
        high_count = sum(1 for f in findings if f.severity == FindingSeverity.HIGH)
        gate_passed = (critical_count == 0) and tests_passed

        summary = (
            f"Gate de QA e Segurança: {'APROVADO' if gate_passed else 'BLOQUEADO'}. "
            f"Críticos: {critical_count}, Altos: {high_count}, Testes: {'OK' if tests_passed else 'FALHA'}."
        )

        result = PipelineGateResult(
            project_id=project_id,
            stack=stack,
            passed=gate_passed,
            tests_passed=tests_passed,
            lint_passed=lint_passed,
            findings=findings,
            critical_count=critical_count,
            high_count=high_count,
            summary=summary,
            evidence=evidence,
        )

        if self.audit_trail:
            self.audit_trail.record_event(
                operation="QA_SECURITY_PIPELINE_RUN",
                status="GATE_PASSED" if gate_passed else "GATE_BLOCKED",
                project_id=project_id,
                parameters={"critical": critical_count, "high": high_count, "stack": stack.value},
                severity=AuditEventSeverity.INFO
                if gate_passed
                else AuditEventSeverity.SECURITY_ALERT,
                reason=summary,
            )

        return result
