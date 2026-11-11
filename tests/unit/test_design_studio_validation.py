import pytest

from services.design_studio.color_extractor import DesignStudioService


def test_palette_rejects_invalid_hex_instead_of_returning_a_fallback():
    service = DesignStudioService()
    with pytest.raises(ValueError):
        service.extract_color_palette("not-a-color", "jarvis")


def test_palette_rejects_css_variable_name_injection():
    service = DesignStudioService()
    with pytest.raises(ValueError):
        service.extract_color_palette("#6366f1", "jarvis; color:red")


def test_palette_accepts_valid_short_and_long_hex_values():
    service = DesignStudioService()
    assert service.extract_color_palette("#abc", "jarvis")["primary"] == "#aabbcc"
    assert service.extract_color_palette("#6366f1", "jarvis")["primary"] == "#6366f1"


def test_unknown_component_type_is_not_silently_replaced_with_another_template():
    service = DesignStudioService()
    with pytest.raises(ValueError):
        service.generate_component_boilerplate("unknown_component")
