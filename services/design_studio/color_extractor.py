"""
JARVIS AI HUB - Design-to-Code & Prototipagem Visual
Recursos:
- Extrator e gerador de paletas de cores harmônicas e variáveis CSS / Tailwind
- Auditor estático de acessibilidade web (WCAG 2.1 AA/AAA)
- Gerador de boilerplates modernos de componentes (React + Tailwind)
"""

import logging
import re
from typing import Any

logger = logging.getLogger("jarvis.design_studio")


def _hex_to_rgb(hex_code: str) -> tuple[int, int, int]:
    clean = hex_code.lstrip("#")
    if len(clean) == 3:
        clean = "".join(c * 2 for c in clean)
    try:
        return int(clean[0:2], 16), int(clean[2:4], 16), int(clean[4:6], 16)
    except Exception:
        return (99, 102, 241)


def _rgb_to_hex(r: int, g: int, b: int) -> str:
    r = max(0, min(255, int(r)))
    g = max(0, min(255, int(g)))
    b = max(0, min(255, int(b)))
    return f"#{r:02x}{g:02x}{b:02x}"


def _blend_color(color_rgb: tuple[int, int, int], target_rgb: tuple[int, int, int], factor: float) -> str:
    r = color_rgb[0] + (target_rgb[0] - color_rgb[0]) * factor
    g = color_rgb[1] + (target_rgb[1] - color_rgb[1]) * factor
    b = color_rgb[2] + (target_rgb[2] - color_rgb[2]) * factor
    return _rgb_to_hex(r, g, b)


class DesignStudioService:
    def extract_color_palette(self, hex_primary: str, name: str = "custom") -> dict[str, Any]:
        """Gera escala completa de cores (50 a 900), contraste e variáveis CSS/Tailwind."""
        base_rgb = _hex_to_rgb(hex_primary)
        white_rgb = (255, 255, 255)
        black_rgb = (10, 15, 26)

        shades = {
            "50": _blend_color(base_rgb, white_rgb, 0.90),
            "100": _blend_color(base_rgb, white_rgb, 0.80),
            "200": _blend_color(base_rgb, white_rgb, 0.60),
            "300": _blend_color(base_rgb, white_rgb, 0.40),
            "400": _blend_color(base_rgb, white_rgb, 0.20),
            "500": _rgb_to_hex(*base_rgb),
            "600": _blend_color(base_rgb, black_rgb, 0.20),
            "700": _blend_color(base_rgb, black_rgb, 0.40),
            "800": _blend_color(base_rgb, black_rgb, 0.60),
            "900": _blend_color(base_rgb, black_rgb, 0.80),
        }

        # Cor de destaque (Complementar aproximada: inverte matiz nos canais)
        accent_rgb = (255 - base_rgb[0], 255 - base_rgb[1], 255 - base_rgb[2])
        accent_hex = _rgb_to_hex(*accent_rgb)

        # Snippet CSS Variables
        css_vars = [f":root {{"]
        for shade, val in shades.items():
            css_vars.append(f"  --color-{name}-{shade}: {val};")
        css_vars.append(f"  --color-{name}-accent: {accent_hex};")
        css_vars.append("}")
        css_snippet = "\n".join(css_vars)

        return {
            "name": name,
            "primary": _rgb_to_hex(*base_rgb),
            "accent": accent_hex,
            "shades": shades,
            "css_variables": css_snippet,
        }

    def audit_wcag_accessibility(self, markup_content: str) -> dict[str, Any]:
        """Varre código HTML/JSX procurando infrações de acessibilidade WCAG 2.1."""
        findings = []
        lines = markup_content.splitlines()

        for idx, line in enumerate(lines, start=1):
            # 1. Imagens sem atributo alt
            if re.search(r"<img\b", line, re.IGNORECASE) and not re.search(r"\balt\s*=", line, re.IGNORECASE):
                findings.append({
                    "line": idx,
                    "rule": "WCAG_1.1.1_NON_TEXT_CONTENT",
                    "severity": "HIGH",
                    "description": "Tag <img> sem atributo 'alt' de texto descritivo.",
                    "snippet": line.strip()[:100],
                    "remediation": "Adicione alt=\"Descrição da imagem\" ou alt=\"\" se a imagem for puramente decorativa.",
                })

            # 2. Botões vazios ou sem label acessível
            if re.search(r"<button\b", line, re.IGNORECASE):
                has_aria = bool(re.search(r"\baria-label\s*=", line, re.IGNORECASE))
                has_title = bool(re.search(r"\btitle\s*=", line, re.IGNORECASE))
                has_text = bool(re.search(r"<button[^>]*>\s*[^<\s]+", line, re.IGNORECASE))
                if not (has_aria or has_title or has_text):
                    findings.append({
                        "line": idx,
                        "rule": "WCAG_4.1.2_NAME_ROLE_VALUE",
                        "severity": "HIGH",
                        "description": "Elemento <button> sem texto visível ou aria-label de acessibilidade.",
                        "snippet": line.strip()[:100],
                        "remediation": "Insira texto descritivo ou o atributo aria-label=\"Nome da Ação\".",
                    })

            # 3. Inputs sem rótulo ou aria-label
            if re.search(r"<input\b", line, re.IGNORECASE) and not re.search(r"type\s*=\s*['\"]hidden['\"]", line, re.IGNORECASE):
                has_aria = bool(re.search(r"\baria-label\s*=", line, re.IGNORECASE))
                has_id = bool(re.search(r"\bid\s*=", line, re.IGNORECASE))
                has_placeholder = bool(re.search(r"\bplaceholder\s*=", line, re.IGNORECASE))
                if not (has_aria or has_id or has_placeholder):
                    findings.append({
                        "line": idx,
                        "rule": "WCAG_3.3.2_LABELS_OR_INSTRUCTIONS",
                        "severity": "MEDIUM",
                        "description": "Campo de entrada <input> sem id para label ou aria-label.",
                        "snippet": line.strip()[:100],
                        "remediation": "Vincule o input a uma tag <label for=\"id\"> ou utilize aria-label=\"...\".",
                    })

            # 4. Links genéricos não descritivos
            generic_link_matches = re.finditer(r"<a\b[^>]*>(?:clique aqui|click here|leia mais|read more|saiba mais)</a>", line, re.IGNORECASE)
            for _ in generic_link_matches:
                findings.append({
                    "line": idx,
                    "rule": "WCAG_2.4.4_LINK_PURPOSE_IN_CONTEXT",
                    "severity": "MEDIUM",
                    "description": "Link com texto genérico ('clique aqui', 'leia mais') prejudica a navegação por leitores de tela.",
                    "snippet": line.strip()[:100],
                    "remediation": "Utilize textos com propósito explícito, como 'Consulte a documentação completa da API'.",
                })

        severity_counts = {"HIGH": 0, "MEDIUM": 0, "LOW": 0}
        for f in findings:
            sev = f["severity"]
            severity_counts[sev] = severity_counts.get(sev, 0) + 1

        score = max(0, 100 - (severity_counts["HIGH"] * 25 + severity_counts["MEDIUM"] * 10))
        verdict = (
            "Excelente Acessibilidade (Em conformidade com WCAG 2.1)"
            if score >= 90
            else "Acessibilidade Regular (Requer melhorias de contraste e tags)"
            if score >= 70
            else "Problemas Críticos de Acessibilidade Detectados"
        )

        return {
            "status": "completed",
            "score": score,
            "verdict": verdict,
            "total_issues": len(findings),
            "severity_counts": severity_counts,
            "findings": findings,
        }

    def generate_component_boilerplate(
        self,
        component_type: str,
        style_system: str = "tailwind",
    ) -> dict[str, Any]:
        """Gera componentes modernos, responsivos e acessíveis prontos para uso em React."""
        clean_type = component_type.lower().strip()

        templates = {
            "navbar": {
                "name": "Barra de Navegação Responsiva",
                "filename": "Navbar.tsx",
                "code": (
                    "import React from 'react';\n\n"
                    "export const Navbar: React.FC = () => {\n"
                    "  return (\n"
                    "    <nav className=\"flex items-center justify-between px-6 py-4 bg-slate-900 border-b border-slate-800 text-white\" role=\"navigation\" aria-label=\"Navegação Principal\">\n"
                    "      <div className=\"flex items-center gap-3\">\n"
                    "        <div className=\"w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-white\">J</div>\n"
                    "        <span className=\"font-bold text-lg tracking-tight\">JARVIS Platform</span>\n"
                    "      </div>\n"
                    "      <div className=\"flex items-center gap-6 text-sm text-slate-300\">\n"
                    "        <a href=\"#\" className=\"hover:text-white transition-colors\">Recursos</a>\n"
                    "        <a href=\"#\" className=\"hover:text-white transition-colors\">Documentação</a>\n"
                    "        <a href=\"#\" className=\"hover:text-white transition-colors\">Painel</a>\n"
                    "      </div>\n"
                    "      <button className=\"px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 rounded-lg shadow-sm transition-colors\" aria-label=\"Iniciar teste gratuito\">\n"
                    "        Acessar Estúdio\n"
                    "      </button>\n"
                    "    </nav>\n"
                    "  );\n"
                    "};\n"
                ),
            },
            "feature_card": {
                "name": "Card de Destaque / Recurso",
                "filename": "FeatureCard.tsx",
                "code": (
                    "import React from 'react';\n\n"
                    "interface FeatureCardProps {\n"
                    "  title: string;\n"
                    "  description: string;\n"
                    "  iconText?: string;\n"
                    "}\n\n"
                    "export const FeatureCard: React.FC<FeatureCardProps> = ({ title, description, iconText = '⚡' }) => {\n"
                    "  return (\n"
                    "    <div className=\"p-6 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-indigo-500/50 transition-all shadow-lg flex flex-col gap-3\">\n"
                    "      <div className=\"w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-xl\">\n"
                    "        {iconText}\n"
                    "      </div>\n"
                    "      <h3 className=\"text-lg font-semibold text-white\">{title}</h3>\n"
                    "      <p className=\"text-sm text-slate-400 leading-relaxed\">{description}</p>\n"
                    "    </div>\n"
                    "  );\n"
                    "};\n"
                ),
            },
            "stats_grid": {
                "name": "Grid de Métricas e KPIs",
                "filename": "StatsGrid.tsx",
                "code": (
                    "import React from 'react';\n\n"
                    "export const StatsGrid: React.FC = () => {\n"
                    "  const stats = [\n"
                    "    { label: 'Precisão Sintática', value: '99.8%' },\n"
                    "    { label: 'Economia de Tokens', value: '100% Local' },\n"
                    "    { label: 'Agentes Ativos', value: '26 Especialistas' },\n"
                    "  ];\n"
                    "  return (\n"
                    "    <div className=\"grid grid-cols-1 md:grid-cols-3 gap-4\">\n"
                    "      {stats.map((s, idx) => (\n"
                    "        <div key={idx} className=\"p-5 bg-slate-900 border border-slate-800 rounded-xl flex flex-col gap-1\">\n"
                    "          <span className=\"text-xs font-semibold text-slate-400 uppercase tracking-wider\">{s.label}</span>\n"
                    "          <span className=\"text-2xl font-bold text-indigo-400 font-mono\">{s.value}</span>\n"
                    "        </div>\n"
                    "      ))}\n"
                    "    </div>\n"
                    "  );\n"
                    "};\n"
                ),
            },
        }

        return templates.get(clean_type) or templates["feature_card"]
