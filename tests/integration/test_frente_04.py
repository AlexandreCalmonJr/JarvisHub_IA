from unittest.mock import AsyncMock, patch
import pytest
from httpx import AsyncClient, ASGITransport
from apps.api.main import app, db_manager, model_manager
from services.hardware.performance_manager import HardwarePerformanceManager
from services.model_runtime.adapter import OllamaAdapter
from services.model_runtime.types import InferenceRequest


def test_frente_04_performance_manager_modes_and_clamping():
    """Valida clamping de threads e transições de modo do HardwarePerformanceManager."""
    perf_mgr = HardwarePerformanceManager(db_manager=db_manager, model_manager=model_manager)

    # 1. Modo Turbo forçado
    res_turbo = perf_mgr.set_performance_profile(mode="turbo", cpu_threads=8)
    assert res_turbo["mode"] == "turbo"
    assert res_turbo["effective_mode"] == "turbo"
    assert res_turbo["effective_threads"] >= 4

    # 2. Modo Eco/Silencioso forçado
    res_eco = perf_mgr.set_performance_profile(mode="eco", cpu_threads=6)
    assert res_eco["mode"] == "eco"
    assert res_eco["effective_mode"] == "eco"
    assert res_eco["effective_threads"] <= 4
    assert res_eco["model_override"] == "llama3.2:3b"

    # 3. Clamping de valores extremos de threads
    logical_cores = res_turbo["logical_cores"]
    res_clamped = perf_mgr.set_performance_profile(mode="balanced", cpu_threads=999)
    assert res_clamped["cpu_threads"] == logical_cores
    assert res_clamped["effective_threads"] <= logical_cores


def test_frente_04_battery_aware_auto_mode():
    """Valida alternância automática entre tomada (Turbo) e bateria (Eco Silencioso)."""
    perf_mgr = HardwarePerformanceManager(db_manager=db_manager, model_manager=model_manager)

    # 1. Simula notebook conectado na tomada
    with patch.object(
        perf_mgr,
        "get_power_status",
        return_value={"has_battery": True, "percent": 95, "power_plugged": True, "secs_left": None},
    ):
        perf_mgr.set_performance_profile(mode="auto", cpu_threads=6)
        profile_plugged = perf_mgr.get_performance_profile()
        assert profile_plugged["mode"] == "auto"
        assert profile_plugged["effective_mode"] == "turbo"
        assert profile_plugged["model_override"] is None
        assert "tomada" in profile_plugged["status_message"].lower()

    # 2. Simula notebook desconectado da tomada operando em bateria (ex: 45%)
    with patch.object(
        perf_mgr,
        "get_power_status",
        return_value={"has_battery": True, "percent": 45, "power_plugged": False, "secs_left": 3600},
    ):
        profile_battery = perf_mgr.get_performance_profile()
        assert profile_battery["mode"] == "auto"
        assert profile_battery["effective_mode"] == "eco"
        assert profile_battery["effective_threads"] <= 4
        assert profile_battery["model_override"] == "llama3.2:3b"
        assert "bateria" in profile_battery["status_message"].lower()


@pytest.mark.asyncio
async def test_frente_04_ollama_adapter_threads_injection():
    """Valida se o OllamaAdapter injeta options.num_thread nas requisições HTTP."""
    adapter = OllamaAdapter(base_url="http://127.0.0.1:11434")
    adapter.set_cpu_threads(4)

    captured_payload = {}

    async def mock_post(url, json=None, **kwargs):
        nonlocal captured_payload
        captured_payload = json
        mock_resp = AsyncMock()
        mock_resp.status_code = 200
        mock_resp.raise_for_status = lambda: None
        mock_resp.json = lambda: {
            "response": "Resposta teste",
            "prompt_eval_count": 10,
            "eval_count": 20,
            "eval_duration": 1000000000,
        }
        return mock_resp

    with patch("httpx.AsyncClient.post", side_effect=mock_post):
        req = InferenceRequest(prompt="Olá teste", model_name="llama3.2:3b")
        resp = await adapter.generate(req)
        assert resp.content == "Resposta teste"
        assert captured_payload.get("options", {}).get("num_thread") == 4


@pytest.mark.asyncio
async def test_frente_04_api_performance_endpoints():
    """Valida os endpoints REST de controle de desempenho e threads."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. Consulta perfil atual
        get_resp = await ac.get("/api/v1/hardware/performance-mode")
        assert get_resp.status_code == 200
        data = get_resp.json()
        assert "mode" in data
        assert "effective_mode" in data
        assert "cpu_threads" in data
        assert "power" in data

        # 2. Atualiza para modo balanceado com 5 threads
        post_resp = await ac.post(
            "/api/v1/hardware/performance-mode",
            json={"mode": "balanced", "cpu_threads": 5, "eco_model": "llama3.2:3b"},
        )
        assert post_resp.status_code == 200
        updated = post_resp.json()
        assert updated["mode"] == "balanced"
        assert updated["cpu_threads"] == min(5, updated["logical_cores"])
        assert updated["effective_threads"] <= updated["logical_cores"]
        assert updated["effective_mode"] == "balanced"

        # Restaura para automático
        await ac.post(
            "/api/v1/hardware/performance-mode",
            json={"mode": "auto", "cpu_threads": 6},
        )
