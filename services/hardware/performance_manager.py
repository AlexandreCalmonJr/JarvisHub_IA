"""
JARVIS AI HUB - Hardware Performance & Power Management
Gerencia dinamicamente o número de threads do Ollama e os perfis de energia (Turbo, Balanceado, Eco/Silencioso).
Alterna automaticamente para modos ultraleves e silenciosos quando o notebook opera em bateria.
"""

import logging
from typing import Any

import psutil

logger = logging.getLogger("jarvis.hardware.performance")


class HardwarePerformanceManager:
    def __init__(self, db_manager: Any, model_manager: Any = None):
        self.db = db_manager
        self.model_manager = model_manager

    def get_power_status(self) -> dict[str, Any]:
        """Obtém o estado atual da bateria e alimentação elétrica do computador."""
        try:
            bat = psutil.sensors_battery()
            if bat is not None:
                return {
                    "has_battery": True,
                    "percent": round(bat.percent, 1),
                    "power_plugged": bool(bat.power_plugged),
                    "secs_left": int(bat.secsleft) if (bat.secsleft and bat.secsleft > 0) else None,
                }
        except Exception as e:
            logger.debug("Falha ao ler sensores de bateria: %s", e)

        return {
            "has_battery": False,
            "percent": 100,
            "power_plugged": True,
            "secs_left": None,
        }

    def get_performance_profile(self) -> dict[str, Any]:
        """Calcula o perfil de desempenho em tempo real com base no hardware, configuração e status de bateria."""
        saved_cfg = self.db.get_hardware_performance_config() if self.db else {}
        mode = saved_cfg.get("mode", "auto").lower()
        if mode not in ("auto", "turbo", "balanced", "eco"):
            mode = "auto"

        logical_cores = psutil.cpu_count(logical=True) or 8
        physical_cores = psutil.cpu_count(logical=False) or 4

        # Threads salvas pelo usuário ou sugestão padrão (deixa 2 núcleos livres em CPUs de 8 threads)
        default_threads = max(2, min(6, logical_cores - 2 if logical_cores >= 6 else logical_cores))
        saved_threads = saved_cfg.get("cpu_threads", default_threads)
        try:
            saved_threads = int(saved_threads)
        except (ValueError, TypeError):
            saved_threads = default_threads
        saved_threads = max(1, min(logical_cores, saved_threads))

        eco_model = saved_cfg.get("eco_model", "llama3.2:3b")
        power = self.get_power_status()
        is_plugged = power["power_plugged"]

        # Resolução do modo efetivo
        if mode == "auto":
            if is_plugged:
                effective_mode = "turbo"
                effective_threads = saved_threads
                model_override = None
                status_msg = "Alimentação via tomada: Modo Turbo ativo com alto desempenho."
            else:
                effective_mode = "eco"
                effective_threads = max(2, min(4, saved_threads // 2 if saved_threads > 2 else 2))
                model_override = eco_model
                status_msg = f"Operando em bateria ({power['percent']}%): Modo Silencioso / Eco ativo para economizar carga e evitar aquecimento."
        elif mode == "turbo":
            effective_mode = "turbo"
            effective_threads = max(4, saved_threads)
            model_override = None
            status_msg = "Modo Turbo forçado: aceleração total de inferência."
        elif mode == "balanced":
            effective_mode = "balanced"
            effective_threads = max(
                2, min(saved_threads, logical_cores - 2 if logical_cores > 4 else logical_cores)
            )
            model_override = None
            status_msg = "Modo Balanceado: velocidade estável preservando fluidez para o sistema operacional."
        else:  # eco
            effective_mode = "eco"
            effective_threads = max(2, min(4, saved_threads // 2 if saved_threads > 2 else 2))
            model_override = eco_model
            status_msg = "Modo Silencioso / Eco forçado: minimização térmica e de uso de CPU."

        # Limite estrito de threads
        effective_threads = max(1, min(logical_cores, effective_threads))

        return {
            "mode": mode,
            "effective_mode": effective_mode,
            "cpu_threads": saved_threads,
            "effective_threads": effective_threads,
            "logical_cores": logical_cores,
            "physical_cores": physical_cores,
            "eco_model": eco_model,
            "model_override": model_override,
            "power": power,
            "status_message": status_msg,
            "modes_available": [
                {
                    "id": "auto",
                    "title": "Automático (Recomendado)",
                    "description": "Alterna entre Turbo e Eco dependendo de estar na tomada ou na bateria.",
                },
                {
                    "id": "turbo",
                    "title": "Modo Turbo",
                    "description": "Máxima alocação de threads e modelos completos para maior velocidade.",
                },
                {
                    "id": "balanced",
                    "title": "Modo Balanceado",
                    "description": "Mantém 2 núcleos livres para o Windows e VS Code continuarem ágeis.",
                },
                {
                    "id": "eco",
                    "title": "Modo Silencioso / Eco",
                    "description": "Poucas threads e modelos leves (1B a 3B) para economizar bateria e ventilação silenciosa.",
                },
            ],
        }

    def set_performance_profile(
        self,
        mode: str,
        cpu_threads: int | None = None,
        eco_model: str | None = None,
    ) -> dict[str, Any]:
        """Atualiza preferências, persiste no SQLite e aplica dinamicamente ao runtime de IA."""
        clean_mode = str(mode).lower().strip()
        if clean_mode not in ("auto", "turbo", "balanced", "eco"):
            clean_mode = "auto"

        logical_cores = psutil.cpu_count(logical=True) or 8
        if cpu_threads is not None:
            try:
                clamped_threads = max(1, min(logical_cores, int(cpu_threads)))
            except (ValueError, TypeError):
                clamped_threads = max(
                    2, min(6, logical_cores - 2 if logical_cores >= 6 else logical_cores)
                )
        else:
            current = self.get_performance_profile()
            clamped_threads = current["cpu_threads"]

        new_cfg = {
            "mode": clean_mode,
            "cpu_threads": clamped_threads,
            "eco_model": eco_model or "llama3.2:3b",
        }

        if self.db:
            self.db.set_hardware_performance_config(new_cfg)

        self.apply_to_runtime()
        return self.get_performance_profile()

    def apply_to_runtime(self) -> None:
        """Aplica as threads efetivas no ModelManager / OllamaAdapter."""
        if not self.model_manager:
            return

        profile = self.get_performance_profile()
        eff_threads = profile["effective_threads"]
        try:
            self.model_manager.set_cpu_threads(eff_threads)
            logger.info(
                "Threads dinâmicas do Ollama atualizadas para %d (Modo: %s)",
                eff_threads,
                profile["effective_mode"],
            )
        except Exception as exc:
            logger.warning("Falha ao definir threads no runtime: %s", exc)
