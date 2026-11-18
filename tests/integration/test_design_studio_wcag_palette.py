"""
Testes de Integração - FRENTE 09: Design-to-Code & Prototipagem Visual
Valida:
1. Geração de paletas de cores harmônicas (50 a 900), cor de destaque e variáveis CSS.
2. Auditoria estática de acessibilidade web (WCAG 2.1) com detecção de tags sem alt, botões vazios e inputs sem label.
3. Geração de boilerplates modernos de componentes em React com Tailwind CSS.
"""

from services.design_studio.color_extractor import DesignStudioService


def test_design_studio_color_palette_extraction():
    service = DesignStudioService()
    palette = service.extract_color_palette("#4f46e5", name="brand")

    assert palette["name"] == "brand"
    assert palette["primary"] == "#4f46e5"
    assert "accent" in palette
    assert len(palette["shades"]) == 10
    assert "50" in palette["shades"]
    assert "500" in palette["shades"]
    assert "900" in palette["shades"]
    assert "--color-brand-500: #4f46e5;" in palette["css_variables"]


def test_design_studio_wcag_accessibility_audit_inaccessible():
    service = DesignStudioService()
    bad_markup = (
        "<div>\n"
        '  <img src="banner.png" />\n'
        "  <button></button>\n"
        '  <input type="text" />\n'
        '  <a href="#">clique aqui</a>\n'
        "</div>"
    )

    audit = service.audit_wcag_accessibility(bad_markup)
    assert audit["status"] == "completed"
    assert audit["total_issues"] >= 4
    assert audit["score"] < 60

    rules = [f["rule"] for f in audit["findings"]]
    assert "WCAG_1.1.1_NON_TEXT_CONTENT" in rules
    assert "WCAG_4.1.2_NAME_ROLE_VALUE" in rules
    assert "WCAG_3.3.2_LABELS_OR_INSTRUCTIONS" in rules
    assert "WCAG_2.4.4_LINK_PURPOSE_IN_CONTEXT" in rules


def test_design_studio_wcag_accessibility_audit_accessible():
    service = DesignStudioService()
    good_markup = (
        '<main role="main">\n'
        '  <img src="logo.png" alt="Logotipo do JARVIS" />\n'
        '  <button aria-label="Confirmar alteração">Salvar</button>\n'
        '  <label for="username">Nome de usuário</label>\n'
        '  <input id="username" type="text" aria-label="Nome de usuário" />\n'
        '  <a href="/docs">Consulte a documentação técnica oficial</a>\n'
        "</main>"
    )

    audit = service.audit_wcag_accessibility(good_markup)
    assert audit["status"] == "completed"
    assert audit["total_issues"] == 0
    assert audit["score"] == 100


def test_design_studio_wcag_contrast_audit():
    service = DesignStudioService()

    # Preto (#000000) sobre Branco (#FFFFFF) tem contraste máximo ~21:1
    res_high = service.audit_color_contrast("#000000", "#ffffff")
    assert res_high["ratio"] >= 20.0
    assert res_high["passes_aa_normal"] is True
    assert res_high["passes_aaa_normal"] is True

    # Cinza claro (#888888) sobre Cinza escuro (#777777) tem contraste baixíssimo < 2:1
    res_low = service.audit_color_contrast("#888888", "#777777")
    assert res_low["ratio"] < 2.0
    assert res_low["passes_aa_normal"] is False
    assert res_low["passes_aa_large"] is False

    # Markup com estilo inline de baixo contraste deve ser detectado
    bad_contrast_markup = (
        '<div style="color: #888888; background-color: #777777;">Texto ilegível</div>'
    )
    audit = service.audit_wcag_accessibility(bad_contrast_markup)
    assert any(f["rule"] == "WCAG_1.4.3_CONTRAST_MINIMUM" for f in audit["findings"])


def test_design_studio_component_boilerplates():
    service = DesignStudioService()

    for comp in ["navbar", "feature_card", "stats_grid"]:
        tmpl = service.generate_component_boilerplate(comp)
        assert "filename" in tmpl
        assert "code" in tmpl
        assert "React" in tmpl["code"]
        assert "className" in tmpl["code"]
