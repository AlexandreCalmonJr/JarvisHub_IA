# Guia de Acesso Remoto Seguro e Emparelhamento Móvel com Tailscale

## 1. Visão Geral e Princípio de Zero Exposição

O **JARVIS AI HUB** foi concebido com uma arquitetura **local-first** rigorosa. O backend nunca expõe portas na internet pública e nunca requer túneis públicos (como ngrok ou port-forwarding no router residencial/empresarial).

Para permitir que o utilizador controle o JARVIS e aprove operações críticas a partir de um smartphone Android, utilizamos uma **VPN mesh ponto-a-ponto criptografada (Tailscale/WireGuard)**:

- **Criptografia ponta-a-ponta**: Todo o tráfego entre o dispositivo móvel e o PC host do JARVIS é cifrado via WireGuard.
- **IP Privado Dedicado**: O PC host recebe um endereço IPv4 no formato CGNAT `100.x.y.z` acessível apenas pelos nós autenticados da sua cauda de rede (tailnet).
- **Sem Portas Abertas**: O firewall do Windows bloqueia qualquer conexão vinda da internet pública; apenas conexões originadas dentro da rede Tailscale privada são aceites.

---

## 2. Processo de Emparelhamento de Dispositivos Móveis

### Passo 1: Solicitar Token de Emparelhamento
No dashboard web ou via API local:
```bash
POST /api/v1/mobile/pair
Content-Type: application/json

{
  "device_name": "Google Pixel 7 - Utilizador Principal"
}
```

Resposta:
```json
{
  "status": "paired",
  "device_id": "dev-4a9f1b",
  "device_name": "Google Pixel 7 - Utilizador Principal",
  "device_token": "jrv_m_k8L2n...90Az"
}
```

### Passo 2: Configurar a App Móvel Flutter
Na app Flutter (`apps/mobile`):
1. Toque no ícone de **Configurações** (engrenagem no canto superior direito).
2. Introduza o IP Tailscale do JARVIS Host (ex: `http://100.85.22.40:8000`).
3. Cole o token gerado (`jrv_m_...`).
4. Toque em **Guardar**.

### Passo 3: Comunicação e Aprovação Remota
A app móvel agora:
- Recebe pedidos de aprovação em tempo real (com níveis de risco `CRITICAL`, `HIGH`, `MEDIUM`).
- Permite aprovar ou rejeitar operações com um clique.
- Permite acionar o **Kill Switch Global** instantaneamente em caso de anomalia.

---

## 3. Revogação Instantânea de Dispositivos Perdidos ou Comprometidos

Se o smartphone for perdido, furtado ou desautorizado:
```bash
POST /api/v1/mobile/revoke
Content-Type: application/json

{
  "device_id": "dev-4a9f1b",
  "reason": "Smartphone perdido pelo operador"
}
```

- O backend marca o dispositivo como `is_revoked = True` imediatamente.
- Qualquer requisição subsequente com o token é rejeitada com código `403 Forbidden` / `PermissionDeniedError`.
- Um evento de auditoria com severidade `WARNING` é registrado no log inviolável do `SecurityCore`.
