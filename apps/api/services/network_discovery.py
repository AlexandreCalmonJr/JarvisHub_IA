import asyncio
import json
import logging
import socket
from datetime import UTC, datetime
from typing import Any, Dict, Optional

logger = logging.getLogger("jarvis.services.discovery")

DISCOVERY_UDP_PORT = 8001
DISCOVERY_MAGIC_KEY = "DISCOVER_JARVIS_HUB"


def get_local_ip() -> str:
    """Retorna o endereço IP principal da máquina na rede local Wi-Fi/Ethernet."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


def get_discovery_info(api_port: int = 8000, dashboard_port: int = 5173) -> Dict[str, Any]:
    """Informações de identificação do servidor para pareamento e descoberta."""
    lan_ip = get_local_ip()
    return {
        "service": "jarvis-hub",
        "name": "JARVIS AI Hub",
        "version": "3.0.1",
        "status": "online",
        "lan_ip": lan_ip,
        "api_port": api_port,
        "dashboard_port": dashboard_port,
        "server_url": f"http://{lan_ip}:{api_port}",
        "pairing_endpoint": "/api/v1/mobile/pair",
        "timestamp": datetime.now(UTC).isoformat(),
    }


class UdpDiscoveryServerProtocol(asyncio.DatagramProtocol):
    """Protocolo UDP para responder instantaneamente a requisições de descoberta mobile."""

    def __init__(self, api_port: int = 8000):
        self.api_port = api_port
        self.transport: Optional[asyncio.DatagramTransport] = None

    def connection_made(self, transport: asyncio.DatagramTransport):
        self.transport = transport
        logger.info("Serviço de descoberta UDP ativo na porta %d", DISCOVERY_UDP_PORT)

    def datagram_received(self, data: bytes, addr: tuple[str, int]):
        try:
            message = data.decode("utf-8", errors="ignore").strip()
            if DISCOVERY_MAGIC_KEY in message or "JARVIS_DISCOVER" in message or "jarvis" in message.lower():
                payload = json.dumps(get_discovery_info(self.api_port)).encode("utf-8")
                if self.transport:
                    self.transport.sendto(payload, addr)
                    logger.debug("Beacon de descoberta enviado para %s:%d", addr[0], addr[1])
        except Exception as e:
            logger.debug("Erro ao processar pacote de descoberta UDP: %s", e)


async def start_discovery_beacon(api_port: int = 8000) -> Optional[asyncio.DatagramTransport]:
    """Inicia o ouvinte UDP para responder a scanners mobile na rede local."""
    loop = asyncio.get_running_loop()
    try:
        transport, _ = await loop.create_datagram_endpoint(
            lambda: UdpDiscoveryServerProtocol(api_port),
            local_addr=("0.0.0.0", DISCOVERY_UDP_PORT),
            allow_broadcast=True,
        )
        return transport
    except OSError as err:
        logger.warning(
            "Não foi possível vincular porta UDP %d para descoberta (já em uso ou restrita: %s). "
            "A descoberta HTTP continuará ativa.",
            DISCOVERY_UDP_PORT,
            err,
        )
        return None
