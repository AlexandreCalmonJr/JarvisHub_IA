"""Detector e scanner de especificações de hardware (CPU, RAM, GPU) e modelos Ollama."""

import json
import logging
import platform
import subprocess
import time
from typing import Any

import httpx
import psutil

logger = logging.getLogger(__name__)

_cached_specs: dict[str, Any] | None = None
_last_scan_time: float = 0.0
CACHE_TTL_SECONDS = 15.0


def scan_hardware() -> dict[str, Any]:
    """Coleta informações de hardware do sistema operacional Windows e modelos locais."""
    global _cached_specs, _last_scan_time

    now = time.time()
    if _cached_specs and (now - _last_scan_time) < CACHE_TTL_SECONDS:
        # Atualiza apenas métricas dinâmicas voláteis (uso de CPU e RAM)
        vm = psutil.virtual_memory()
        _cached_specs["ram"]["used_gb"] = round((vm.total - vm.available) / (1024**3), 2)
        _cached_specs["ram"]["available_gb"] = round(vm.available / (1024**3), 2)
        _cached_specs["ram"]["percent"] = vm.percent
        _cached_specs["cpu"]["current_load_percent"] = psutil.cpu_percent(interval=None)
        return _cached_specs

    # 1. Informações de Memória RAM via psutil
    vm = psutil.virtual_memory()
    ram_info = {
        "total_gb": round(vm.total / (1024**3), 2),
        "available_gb": round(vm.available / (1024**3), 2),
        "used_gb": round((vm.total - vm.available) / (1024**3), 2),
        "percent": vm.percent,
    }

    # 2. Informações de Processador (CPU)
    cpu_name = platform.processor() or "Processador Intel/AMD x86_64"
    physical_cores = psutil.cpu_count(logical=False) or 4
    logical_cores = psutil.cpu_count(logical=True) or 8
    max_clock_mhz = 0

    if platform.system() == "Windows":
        try:
            ps_cmd = "Get-CimInstance Win32_Processor | Select-Object -Property Name, NumberOfCores, NumberOfLogicalProcessors, MaxClockSpeed | ConvertTo-Json"
            proc = subprocess.run(
                ["powershell", "-NoProfile", "-Command", ps_cmd],
                capture_output=True,
                text=True,
                timeout=5,
            )
            if proc.returncode == 0 and proc.stdout.strip():
                data = json.loads(proc.stdout)
                if isinstance(data, list):
                    data = data[0]
                if data.get("Name"):
                    cpu_name = data["Name"].strip()
                if data.get("NumberOfCores"):
                    physical_cores = int(data["NumberOfCores"])
                if data.get("NumberOfLogicalProcessors"):
                    logical_cores = int(data["NumberOfLogicalProcessors"])
                if data.get("MaxClockSpeed"):
                    max_clock_mhz = int(data["MaxClockSpeed"])
        except Exception as e:
            logger.debug("Não foi possível ler CPU via WMI: %s", e)

    cpu_info = {
        "name": cpu_name,
        "physical_cores": physical_cores,
        "logical_cores": logical_cores,
        "max_clock_mhz": max_clock_mhz,
        "current_load_percent": psutil.cpu_percent(interval=None),
        "architecture": platform.machine(),
    }

    # 3. Informações de Placa de Vídeo (GPU)
    gpus: list[dict[str, Any]] = []
    has_nvidia_cuda = False

    if platform.system() == "Windows":
        try:
            ps_gpu_cmd = "Get-CimInstance Win32_VideoController | Select-Object -Property Name, AdapterRAM | ConvertTo-Json"
            proc_gpu = subprocess.run(
                ["powershell", "-NoProfile", "-Command", ps_gpu_cmd],
                capture_output=True,
                text=True,
                timeout=5,
            )
            if proc_gpu.returncode == 0 and proc_gpu.stdout.strip():
                gpu_data = json.loads(proc_gpu.stdout)
                if isinstance(gpu_data, dict):
                    gpu_data = [gpu_data]
                for g in gpu_data:
                    g_name = g.get("Name", "Dispositivo de Vídeo").strip()
                    raw_ram = g.get("AdapterRAM", 0) or 0
                    vram_gb = round(raw_ram / (1024**3), 2)
                    is_nvidia = "nvidia" in g_name.lower() or "geforce" in g_name.lower() or "quadro" in g_name.lower() or "rtx" in g_name.lower()
                    if is_nvidia:
                        has_nvidia_cuda = True
                    gpus.append({
                        "name": g_name,
                        "vram_gb": vram_gb,
                        "is_dedicated": is_nvidia,
                        "is_integrated": "intel" in g_name.lower() or "uhd" in g_name.lower() or "iris" in g_name.lower() or "radeon graphics" in g_name.lower(),
                    })
        except Exception as e:
            logger.debug("Não foi possível ler GPU via WMI: %s", e)

    if not gpus:
        gpus.append({
            "name": "Adaptador Gráfico Genérico / Integrado",
            "vram_gb": 1.0,
            "is_dedicated": False,
            "is_integrated": True,
        })

    # 4. Modelos Locais Instalados no Ollama
    ollama_models = []
    ollama_online = False
    try:
        with httpx.Client(timeout=2.0) as client:
            resp = client.get("http://127.0.0.1:11434/api/tags")
            if resp.status_code == 200:
                ollama_online = True
                data = resp.json()
                for m in data.get("models", []):
                    name = m.get("name", "")
                    size_gb = round(m.get("size", 0) / (1024**3), 2)
                    details = m.get("details", {})
                    ollama_models.append({
                        "name": name,
                        "size_gb": size_gb,
                        "parameter_size": details.get("parameter_size", "unknown"),
                        "quantization": details.get("quantization_level", "unknown"),
                        "family": details.get("family", "unknown"),
                    })
    except Exception:
        ollama_online = False

    specs = {
        "cpu": cpu_info,
        "ram": ram_info,
        "gpu": {
            "devices": gpus,
            "primary_name": gpus[0]["name"] if gpus else "Não identificada",
            "has_dedicated_gpu": has_nvidia_cuda,
            "is_cpu_only_inference": not has_nvidia_cuda,
        },
        "ollama": {
            "online": ollama_online,
            "models_count": len(ollama_models),
            "installed_models": ollama_models,
        },
        "operating_system": f"Windows ({platform.platform()})",
    }

    _cached_specs = specs
    _last_scan_time = now
    return specs
