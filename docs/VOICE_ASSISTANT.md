# VOICE ASSISTANT — Assistente por voz em segundo plano

> **Versão:** 1.1
> **Data:** 12/11/2026
> **Estado:** V0 concluído; V1 parcial no desktop (`hey_jarvis`); V2–V6 em aberto
> **Âmbito:** wake word, STT, TTS, execução em segundo plano, desktop e celular
> **Documento principal:** [PLANO_COMPLETO.md](./PLANO_COMPLETO.md) — Fase 8

---

## 0. Resumo

O objetivo é adicionar ao JARVIS AI HUB uma experiência semelhante à Alexa:

1. O JARVIS corre em segundo plano, sem janela aberta.
2. Fica à escuta da palavra de ativação **“Jarvis”**.
3. Ao ouvir, pergunta o que o utilizador deseja.
4. Transcreve, interpreta e executa.
5. Responde por voz.
6. Pode ser incorporado no celular.
7. Ações sensíveis continuam a exigir aprovação humana.

A base já existe: chat, 26 agentes, orquestrador, aprovações, workspace e app Flutter. A camada de voz local (V0) e um daemon desktop inicial (V1) já estão implementados; falta validar em hardware, completar a conversa por voz e levar a voz ao Android.

> **Nota sobre a wake word:** o modelo openWakeWord implementado é `hey_jarvis`, treinado para “Hey Jarvis”. Dizer apenas “Jarvis” pode funcionar, mas com mais falsos negativos. O requisito literal exige treinar ou validar um modelo dedicado; isso faz parte do V1.

---

## 1. Experiência alvo

### Desktop

```
"Diz Jarvis."
  → chime curto
  → "Sim?"
  → utilizador fala
  → silêncio detetado
  → transcrição local
  → execução
  → resposta falada
```

Com o dashboard fechado, o JARVIS continua na bandeja do Windows.

### Celular

```
Telefone no bolso
  → "Jarvis"
  → notificação permanente indica que está a ouvir
  → pergunta
  → áudio enviado ao PC
  → resposta falada no alto-falante
```

### Comportamentos desejados

- **Follow-up:** depois da resposta, 5–10 segundos para continuar sem repetir “Jarvis”.
- **Barge-in:** dizer “Jarvis” enquanto ele fala interrompe a resposta.
- **Mute fácil:** atalho global e ícone visível.
- **Cancelar:** “Jarvis, cancela”.
- **Repetir:** “Jarvis, repete”.
- **Aprovação:** “Preciso que aprove no painel” quando a ação for sensível.

---

## 2. Estado atual do projeto

| Peça | Estado | Onde |
|---|---|---|
| Backend local | ✅ Funciona | `apps/api/main.py` |
| Arranque silencioso no Windows | ✅ Parcial | `iniciar_jarvis_silencioso.vbs` inicia o backend, mas **não** inicia o daemon de voz |
| Microfone no dashboard | ✅ Push-to-talk | `apps/dashboard/src/hooks/useChatStream.ts` |
| STT cloud | ⚠️ Se houver chave | `apps/api/routers/voice.py` (Groq/OpenAI Whisper); usado primeiro no push-to-talk web |
| STT local | ✅ Real opcional | `services/voice_runtime/stt_adapter.py` usa faster-whisper quando instalado e configurado |
| TTS backend | ✅ Real opcional | `services/voice_runtime/tts_adapter.py` usa Piper configurado e devolve WAV válido |
| TTS no browser | ✅ Real, robótico | `speechSynthesis` em `MessageBubble.tsx` |
| Wake word | 🟡 Parcial | `apps/voice_daemon/`; modelo `hey_jarvis` (“Hey Jarvis”), exige `.[voice]`, token autorizado e Piper configurado |
| Daemon desktop | 🟡 Parcial | `apps/voice_daemon/main.py`: bandeja, mute, instância única, backend sob demanda; sem atalho global, autostart, follow-up ou barge-in |
| Comandos determinísticos | 🟡 Mínimo | `/voice/command` resolve hora, data e pedido de aprovação; o resto cai no chat |
| Voz no celular | ❌ Não existe | `apps/mobile/lib/main.dart`; `pubspec.yaml` só tem `cupertino_icons` e `flutter_secure_storage` |
| Serviço em segundo plano no celular | ❌ Não existe | — |
| Aprovações | ✅ Funciona | Dashboard + mobile |
| Kill switch | ✅ Funciona | `services/security_core/kill_switch.py` |

### Conclusão

- **Desktop:** o caminho mais curto é usar o microfone do dispositivo, STT/TTS locais e um daemon de bandeja.
- **Android:** viável com serviço em primeiro plano.
- **iOS:** não é viável como escuta contínua; usar push-to-talk/Atalho da Siri.
- **“Fazer tudo”**: é um roadmap de skills, não uma funcionalidade única.

---

## 3. Arquitetura recomendada

**Princípio:** o PC é o cérebro; o microfone e o alto-falante ficam no dispositivo.

```
┌──────────────────────────────┐
│  Dispositivo (PC ou celular) │
│                              │
│  Microfone                   │
│      ↓                       │
│  Wake word local ("Jarvis")  │
│      ↓                       │
│  VAD (fim da fala)           │
│      ↓                       │
│  Áudio da frase              │
└──────────┬───────────────────┘
           │ HTTPS / WebSocket / Tailscale
           ↓
┌──────────────────────────────┐
│  JARVIS Hub (PC)             │
│                              │
│  STT local (faster-whisper)  │
│      ↓                       │
│  Intent router + orquestrador│
│      ↓                       │
│  26 agentes + ferramentas    │
│      ↓                       │
│  TTS local (Piper)           │
└──────────┬───────────────────┘
           │ áudio da resposta
           ↓
┌──────────────────────────────┐
│  Dispositivo                 │
│  Alto-falante                │
└──────────────────────────────┘
```

### Por que não tudo no dispositivo?

- O celular não precisa correr um LLM nem um Whisper grande.
- O cérebro e as ferramentas continuam num só sítio.
- O PC pode estar ligado em casa; o celular liga-se por Wi-Fi ou Tailscale.
- O áudio só sai do dispositivo **depois** da wake word.

### Alternativa

Tudo no dispositivo: mais privado, mas consome bateria, aquece e a qualidade cai. Não recomendado para o MVP.

---

## 4. Stack recomendada

| Componente | Recomendação principal | Alternativa | Nota |
|---|---|---|---|
| **Wake word** | **Porcupine** (tem “Jarvis” embutido) | **openWakeWord** (open source) | Porcupine é mais rápido de integrar; openWakeWord evita chave/licença |
| **VAD** | **Silero VAD** | `webrtcvad` | Deteta fim da fala e evita gravar silêncio |
| **STT local** | **faster-whisper** `base`/`small` int8 | `whisper.cpp` no celular | CPU, bom português |
| **STT cloud** | Groq `whisper-large-v3-turbo` | OpenAI `whisper-1` | Já há suporte no router |
| **TTS local** | **Piper** (vozes pt-BR/pt-PT) | SAPI/`pyttsx3` | Piper soa natural e é rápido em CPU |
| **TTS celular** | `flutter_tts` (nativo) | Áudio Piper vindo do PC | Nativo é mais simples e offline |
| **Áudio desktop** | `sounddevice` + `numpy` | `pyaudio` | `sounddevice` é mais estável no Windows |
| **Bandeja do Windows** | `pystray` + `Pillow` | — | Ícone com mute, status e sair |
| **Arranque automático** | Task Scheduler no logon | pasta Startup / registo | **Não** usar serviço Windows para o microfone |
| **Celular Android** | `flutter_foreground_task` | serviço nativo Kotlin | Notificação permanente obrigatória |
| **Wake word Android** | `porcupine_flutter` | sherpa-onnx / openWakeWord nativo | Testar bateria num aparelho real |
| **Transporte** | HTTPS local + Tailscale | WebSocket para streaming | Não expor o backend na Internet |
| **Autenticação** | Token de dispositivo existente | Novo scope `voice` | Revogável por dispositivo |

### O que está realmente implementado

**Implementado nesta ronda:** `faster-whisper`, Piper, `sounddevice`, openWakeWord (`hey_jarvis`) e `pystray`/`Pillow`. **Ainda não implementado:** Silero/`webrtcvad`, Porcupine, `flutter_tts`, `flutter_foreground_task` e o serviço Android. O `pyproject.toml` não inclui `webrtcvad`; o VAD do daemon é RMS.

### Aviso importante sobre o Windows

**Não corra o ouvinte de microfone como serviço do Windows.** Serviços correm na *Session 0* e não têm acesso ao microfone do utilizador. O correto é uma **app de bandeja** iniciada no logon do utilizador, via Task Scheduler.

---

## 5. Desktop em segundo plano

### 5.1 O que mudar

O daemon já existe em `apps/voice_daemon/main.py` e é iniciado em separado. `apps/desktop/main_window.py` inicia o backend se necessário e, ao fechar, só o encerra se o daemon de voz não estiver ativo (verifica `data/run/voice-daemon.lock`). O daemon, por sua vez, inicia o backend se ainda não estiver a correr e só encerra o processo que ele próprio criou.

Para operar em segundo plano:

1. Instalar o extra: `python -m pip install -e ".[voice]"`.
2. Configurar `JARVIS_VOICE_TOKEN`, `JARVIS_PIPER_EXECUTABLE` e `JARVIS_PIPER_MODEL`.
3. Executar `pythonw.exe -m apps.voice_daemon.main` com a raiz do projeto como diretório inicial.
4. Registar esse comando no **Task Scheduler ao iniciar sessão** — a configuração automática ainda não está incluída no instalador.
5. O daemon fica na bandeja com mute e sair; o menu ainda não abre o dashboard com duplo clique.

O `iniciar_jarvis_silencioso.vbs` atual inicia apenas o backend (`iniciar_jarvis.bat`); é preciso acrescentar o daemon ao arranque para ter escuta em segundo plano.

### 5.2 Estrutura atual

```
apps/voice_daemon/
├── main.py           # entrada, lock, bandeja, captura, wake word, STT/TTS, cliente HTTP
├── README.md         # requisitos, execução e limites
└── __init__.py
```

A separação em `tray.py`, `listener.py`, `client.py`, `playback.py` e `config.py` continua a ser uma refatoração recomendada, **não implementada**.

### 5.3 Comportamentos

- **Instância única:** ✅ lock em `data/run/voice-daemon.lock`.
- **Mute:** ✅ menu da bandeja; ❌ atalho global (`Ctrl+Alt+J`) ainda não existe.
- **Estado visível:** ✅ ícone e título mudam entre “a ouvir” e “mutado”; não há estado amarelo de processamento.
- **Logs:** ✅ `data/logs/voice.log`.
- **Kill switch:** ❌ o daemon não consulta o kill switch; pendente.
- **Echo cancellation:** 🟡 o microfone não é lido enquanto o TTS fala (`sd.play(blocking=True)`), mas não há AEC dedicado.
- **Mudança de dispositivo de áudio:** ❌ não tratada.
- **Autostart:** ❌ não configurado; o README explica como registar manualmente no Task Scheduler.

### 5.4 Fluxo

```
Diz "Hey Jarvis" (modelo hey_jarvis)
  → "Sim?" por TTS
  → grava até 12 s ou 1 s de silêncio (RMS)
  → STT local (faster-whisper)
  → POST /api/v1/voice/command
  → se intent != command.unsupported: usa a resposta
  → senão: POST /api/v1/chat com sessão persistida
  → TTS local (Piper) e reprodução
```

Não há chime separado: a resposta “Sim?” é o sinal. A gravação tem um máximo de 12 s e o timeout do chat é de 240 s. Se o comando for sensível, o daemon responde “Preciso que aprove a ação no painel” e não aprova nada sozinho.

### 5.5 Detalhes de UX

- **Janela de follow-up:** ❌ não implementada.
- **Barge-in:** ❌ não implementado.
- **Mute visível:** 🟡 menu da bandeja e ícone; sem atalho global.
- **Confirmação curta:** ✅ resposta falada; aprovação sensível remete para o painel.
- **Cancelar/repetir:** ❌ “cancelar” e “repete” ainda não são comandos de voz.

---

## 6. Celular

**Estado:** não implementado. `apps/mobile/pubspec.yaml` só inclui `cupertino_icons` e `flutter_secure_storage`; não há `record`, `flutter_foreground_task`, permissões de microfone nem serviço Android. O plano abaixo é o alvo do V4.

### 6.1 Android — caminho recomendado

O Android permite escuta em segundo plano, mas **com uma notificação permanente** e regras rígidas:

- `RECORD_AUDIO`
- `FOREGROUND_SERVICE`
- `FOREGROUND_SERVICE_MICROPHONE`
- `POST_NOTIFICATIONS`
- Serviço com `foregroundServiceType="microphone"`
- O serviço deve ser iniciado com o app aberto; depois pode continuar em segundo plano.
- Pedir isenção de otimização de bateria (para uso pessoal/sideload; na Play Store há restrições).

### 6.2 Arquitetura no celular

1. App Flutter inicia o serviço em primeiro plano.
2. O serviço corre a wake word local (Porcupine/openWakeWord).
3. Ao ouvir “Jarvis”, grava a frase.
4. Envia o áudio para o PC via Wi-Fi/Tailscale.
5. Recebe texto + áudio da resposta.
6. Toca no alto-falante.
7. Se houver aprovação pendente, mostra notificação com botões.

**Vantagem:** o celular fica leve; o PC faz o trabalho pesado.
**Limite:** o PC precisa estar ligado e acessível. Para uso fora de casa, Tailscale resolve.

### 6.3 iOS — a verdade

**Não é possível ter escuta contínua como a Alexa em segundo plano de forma confiável.** O iOS suspende apps e o App Store restringe microfone em background. Caminhos práticos:

- **Push-to-talk** dentro do app.
- **Atalho da Siri:** “Hey Siri, pedir ao Jarvis...” → abre o app e envia o comando.
- **Live Activity / widget** para aprovações rápidas.
- **Escuta em background** apenas enquanto o app está aberto ou com modo de áudio ativo — e mesmo assim com risco de rejeição.

Se o objetivo é “igual à Alexa”, **Android é o alvo realista**; iOS fica como companion.

---

## 7. “Fazer tudo que um assistente pessoal faria”

Isso não é uma funcionalidade — é um conjunto de skills. A boa notícia é que o projeto já tem o sistema de **Skills** e o orquestrador. A má proposta é tentar fazer tudo de uma vez.

**Cobertura atual:** `/voice/command` resolve apenas hora, data e pedido de aprovação; qualquer outro pedido é encaminhado ao chat/LLM. Timer, lembrete, clima, abrir app e integrações continuam por implementar (V3).

### Nível 1 — já suportado ou quase

| Comando | Como |
|---|---|
| “Que horas são?” | Resposta determinística |
| “Que dia é hoje?” | Resposta determinística |
| “Quanto é 15% de 240?” | Cálculo local |
| “Abre o projeto X” | Workspace |
| “Lê o ficheiro Y” | Coding agent, read-only |
| “Procura na web sobre Z” | `web_search` |
| “O que sabes sobre o documento W?” | Knowledge Vault |
| “Cria uma tarefa para amanhã” | Tarefas |
| “Como está o sistema?” | Health + recursos |
| “Corre os testes do projeto X” | Quality Studio |

### Nível 2 — alto valor, risco baixo (adicionar primeiro)

| Comando | Implementação |
|---|---|
| “Põe um timer de 10 minutos” | Notificação local no dispositivo |
| “Lembra-me de X às 18h” | Tabela de lembretes + notificação |
| “Como está o tempo?” | `web_search` ou API de clima |
| “Abre o VS Code / a pasta do projeto” | `subprocess` no Windows, com aprovação |
| “Aumenta o volume / tira screenshot” | APIs do sistema |
| “Anota isto: ...” | Notas/tarefas |
| “Lê o último resultado” | Histórico de sessão |

### Nível 3 — integrações (médio risco)

| Comando | Implementação |
|---|---|
| “O que tenho na agenda amanhã?” | Google Calendar/Outlook OAuth |
| “Lê os e-mails não lidos” | Gmail/Outlook, read-only |
| “Responde ao João” | **Nunca enviar sem aprovação** |
| “Liga a luz da sala” | Home Assistant local |
| “Toca música” | Spotify/player local |
| “Manda mensagem no Telegram” | Bot existente |

### Nível 4 — alto risco (aprovação obrigatória, nunca só por voz)

- Apagar ficheiros.
- Fazer compras.
- Enviar e-mails/mensagens.
- Alterar configurações do sistema.
- Executar comandos destrutivos.
- Aprovar despesas.

**Regra:** voz pode **pedir**; voz não pode **aprovar sozinha** ações destrutivas. A aprovação vai para o dashboard ou para o celular com PIN/biometria.

---

## 8. Fluxo completo e contratos

### 8.1 Passo a passo

```
1. "Jarvis"
2. Chime + "Sim?"
3. "Põe um timer de 10 minutos"
4. VAD deteta fim da fala
5. STT → "põe um timer de 10 minutos"
6. Intent router:
   - é comando determinístico? → executa sem LLM
   - é conversa? → orquestrador/LLM
   - é ação sensível? → cria aprovação
7. Resposta: "Timer de 10 minutos iniciado."
8. TTS toca a resposta
9. Evento de auditoria: dispositivo, transcrição, intent, resultado
```

### 8.2 Contrato de comando

```http
POST /api/v1/voice/command
Authorization: Bearer <device_token>
Content-Type: application/json

{
  "text": "põe um timer de 10 minutos",
  "device_id": "pc-escritorio",
  "session_id": "voice-abc123",
  "project_id": null
}
```

```json
{
  "reply": "Timer de 10 minutos iniciado.",
  "intent": "timer.create",
  "approval_required": false,
  "audio_url": null
}
```

**Estado:** o contrato existe, mas o endpoint é determinístico e não executa ferramentas. `command.unsupported` é o sinal para o daemon tentar `/api/v1/chat`.

### 8.3 Streaming

Um WebSocket (`/ws/voice`) permitiria streaming de áudio, transcrição parcial, barge-in e cancelamento, mas **ainda não existe**. O MVP usa gravação completa + POST.

---

## 9. Fases de implementação

### V0 — Voz real (3–4 dias)

- `LocalSTTAdapter` usa **faster-whisper** quando o extra `.[voice]` está instalado; sem o extra/modelo devolve erro explícito (não há frase simulada).
- `LocalTTSAdapter` usa **Piper** configurado e devolve WAV; sem binário/modelo devolve erro explícito (não há WAV vazio).
- VAD RMS para WAV e para o daemon.
- Endpoints `/api/v1/voice/transcribe`, `/api/v1/voice/synthesize` e `/api/v1/voice/command`.
- Testes com WAV de fixture e rotas.

**Estado:** ✅ concluído. Falta apenas validar os modelos reais (voz e transcrição) no equipamento-alvo.

**Aceite:** enviar um WAV e receber texto; enviar texto e receber WAV audível.

### V1 — Wake word no desktop (3–4 dias)

- `apps/voice_daemon/main.py` com wake word, VAD, STT, chamada ao chat e TTS.
- Ícone na bandeja: a ouvir / mutado / sair.
- Arranque no logon via Task Scheduler.
- Instância única.
- Botão de mute e atalho global.

**Estado:** 🟡 parcial. Implementado: daemon, bandeja, mute, instância única, backend sob demanda, `hey_jarvis`, VAD, STT/TTS e encaminhamento autenticado ao chat. Pendente: atalho global, autostart configurado, notificações de aprovação, ensaio com microfone/Piper e decisão sobre um modelo “Jarvis” dedicado.

**Aceite:** dizer “Hey Jarvis” (ou “Jarvis”, se o modelo dedicado for validado) com o dashboard fechado → “Sim?” → pergunta → resposta falada.

### V2 — Conversa por voz (3–4 dias)

- Janela de follow-up.
- Barge-in.
- TTS por frase (primeira frase toca mais cedo).
- Comandos “cancelar”, “silêncio”, “repete”.
- Sessão de voz separada da sessão de texto.

**Estado:** ⬜ em aberto.

**Aceite:** conversa de 3 turnos sem repetir a wake word.

### V3 — Assistente pessoal (1–2 semanas)

- Intent router determinístico para hora, data, cálculo, timer, lembrete, clima, abrir app/pasta.
- Skills novas registadas no catálogo.
- Aprovações por notificação.
- Auditoria e retenção de transcrições.

**Estado:** ⬜ em aberto; apenas hora, data e pedido de aprovação existem.

**Aceite:** 10 comandos do dia a dia funcionam sem LLM e com latência < 2 s.

### V4 — Android (1–2 semanas)

- Serviço em primeiro plano.
- Wake word local.
- Gravação + envio para o PC.
- Reprodução de TTS.
- Notificações de aprovação.
- Pareamento com token existente.
- Teste em aparelho físico, bateria e ecrã bloqueado.

**Estado:** ⬜ não implementado.

**Aceite:** telefone no bolso → “Jarvis” → resposta pelo alto-falante.

### V5 — iOS e extras (opcional)

- Push-to-talk.
- Atalho da Siri.
- Live Activity para aprovações.
- Sem promessa de escuta contínua.

**Estado:** ⬜ opcional.

### V6 — Hardening (contínuo)

- Privacidade, retenção, auditoria.
- Verificação de locutor (opcional).
- Kill switch para o ouvinte.
- Métricas de falsos positivos e latência.

**Estado:** 🟡 parcial. Áudio local, token e auditoria de comandos existem; retenção configurável, kill switch, verificação de locutor e métricas pendentes.

---

## 10. Latência: a verdade que precisa de ser dita

Hoje o Ollama em CPU leva **25–224 segundos** por resposta. Isso não é compatível com a experiência Alexa para perguntas complexas.

Para o assistente de voz parecer rápido:

1. **Intent router determinístico** resolve a maioria dos comandos sem LLM (hora, timer, clima, abrir app).
2. **Modelo pequeno** para conversa (`llama3.2:3b`, `phi3.5`) com `max_tokens` curto.
3. **TTS por frase**: a primeira frase sai enquanto o resto é gerado.
4. **Filler** (“Um momento...”) se a resposta demorar mais de 2 s.
5. **Cloud opcional** (Groq) para perguntas complexas, se autorizares.
6. **GPU** se estiver disponível — muda completamente o patamar.

Sem isto, o assistente funciona, mas não vai ter a sensação de instantaneidade da Alexa.

### Orçamento de latência alvo

| Etapa | Alvo |
|---|---|
| Wake word | < 300 ms |
| Fim da fala (VAD) | 500–800 ms |
| STT local (frase de 5 s) | 0,5–2 s |
| Intent determinístico | < 100 ms |
| LLM (resposta curta) | 2–10 s (ideal); CPU atual pode ser muito mais |
| TTS primeira frase | < 500 ms |
| **Total (comando simples)** | **< 3–5 s** |

---

## 11. Segurança e privacidade

Escuta permanente é a funcionalidade mais sensível do projeto. Regras mínimas:

- **Indicador visível sempre**: ✅ ícone na bandeja; no Android será a notificação permanente (V4).
- **Mute por hardware/atalho**: 🟡 menu da bandeja; atalho global ainda não existe.
- **Wake word 100% local**: ✅ openWakeWord local; nenhum áudio sai antes da ativação.
- **Ring buffer em memória**: ✅ o daemon só grava depois da wake word; o áudio fica em memória.
- **Áudio não é guardado por padrão**: ✅ o daemon grava apenas `data/voice-session-id.txt`; a transcrição segue para o chat e herda a retenção das mensagens.
- **Token por dispositivo**: ✅ `JARVIS_VOICE_TOKEN`; revogação e registry de dispositivos ainda não existem.
- **TLS/Tailscale**: 🟡 `JARVIS_VOICE_API` é configurável; o padrão é `http://127.0.0.1:8000`, sem TLS próprio.
- **Auditoria de cada comando**: ✅ `/voice/command` regista `VOICE_COMMAND`; o fluxo de chat audita pelo caminho normal.
- **Aprovação humana**: ✅ ações sensíveis não são executadas pelo endpoint de voz; são encaminhadas para o painel.
- **Kill switch**: ❌ o daemon ainda não consulta o kill switch; pendente.
- **Sem modo furtivo**: ✅ o ícone da bandeja é visível.
- **Prompt injection**: ✅ a transcrição é conteúdo não confiável; as permissões de ferramentas mantêm-se.
- **Verificação de locutor**: ❌ futuro, não MVP.

---

## 12. Riscos

| Risco | Mitigação |
|---|---|
| Falsos positivos da wake word | Threshold ajustável, log, mute fácil |
| Bateria no Android | Wake word leve, foreground service, testar em aparelho real |
| Eco (ele ouve-se a si mesmo) | Mutar mic durante TTS ou AEC |
| Microfone ocupado por Teams/Zoom | Detetar dispositivo e degradar com aviso |
| PC desligado | Aviso claro no celular; modo offline limitado |
| Modelos grandes no instalador | Download no primeiro uso, com consentimento |
| iOS bloquear background | Não prometer; usar Siri Shortcut/push-to-talk |
| Múltiplos dispositivos a responder | Escolher o dispositivo que ouviu; registry de dispositivos |
| Privacidade doméstica | Perfis de voz, conta padrão, retenção e apagar histórico |
| Latência do LLM | Intent router + modelo pequeno + streaming + cloud opcional |
| Alucinação em comandos | Confirmação explícita para ações e validação de schema |
| Wake word “Jarvis” em conteúdo de TV | Threshold + verificação de contexto + mute |

---

## 13. MVP recomendado

**Não começar pelo celular.** Começar pelo Windows, onde o backend já corre e o ciclo é mais rápido.

**Estado em 12/11/2026:** Semana 1 concluída; Semana 2 parcial (daemon e wake word `hey_jarvis`, sem autostart/atalho global). O aceite do MVP ainda não foi validado em hardware.

### Semana 1

- STT local real (faster-whisper `base` int8).
- TTS local real (Piper pt-BR/pt-PT).
- VAD.
- Endpoint `/voice/command`.
- Testes com WAV.

### Semana 2

- Wake word `hey_jarvis` (openWakeWord).
- Daemon + bandeja; autostart ainda pendente.
- Fluxo completo: wake → pergunta → resposta falada.
- 2 intents determinísticos implementados (hora, data) + pedido de aprovação; timer, clima e abrir app pendentes.
- Auditoria, mute e retenção.

### Aceite do MVP

Com o dashboard fechado, dizer “Hey Jarvis, que horas são?” e ouvir a resposta em menos de 5 segundos.

### Depois

- Android (2 semanas).
- iOS (push-to-talk/Siri, opcional).
- Integrações (calendário, e-mail, Home Assistant) por prioridade.

---

## 14. Decisões necessárias

1. **Começamos pelo Windows ou pelo Android?**
   Recomendação: **Windows primeiro** — é mais rápido validar e o backend já está lá.

2. **Aceitas usar uma chave cloud (Groq) para STT/LLM rápido, ou queres 100% local?**
   - 100% local: mais privado, mais lento.
   - Híbrido: wake word e STT local; LLM cloud opcional para perguntas complexas.
   - Cloud total: mais rápido, menos privado.

3. **Aprovações de ações sensíveis:**
   - **Recomendado:** só no dashboard/celular com PIN/biometria.
   - Alternativa: confirmação por voz para ações de baixo risco, com auditoria.

4. **Wake word:**
   - **Porcupine** (rápido, chave/licença, “Jarvis” embutido).
   - **openWakeWord** (open source, requer tuning).

5. **Voz do TTS:**
   - pt-BR ou pt-PT?
   - Piper local (natural, offline) ou TTS nativo do dispositivo (mais simples)?

---

## 15. Mapa de ficheiros

### Implementados

| Ficheiro | Função |
|---|---|
| `apps/voice_daemon/main.py` | Daemon: lock, backend sob demanda, bandeja, captura, wake word, STT/TTS e cliente HTTP |
| `apps/voice_daemon/README.md` | Configuração, execução e limites do daemon |
| `services/voice_runtime/vad.py` | Deteção de atividade de voz por RMS em WAV |
| `tests/unit/test_voice_daemon.py` | Captura PCM → WAV e VAD |
| `tests/integration/test_voice_pipeline.py` | Rotas de transcrição, síntese e comando |
| `docs/VOICE_ASSISTANT.md` | Este documento |

### Modificados

| Ficheiro | Alteração |
|---|---|
| `services/voice_runtime/stt_adapter.py` | faster-whisper real; erro explícito sem extra/modelo |
| `services/voice_runtime/tts_adapter.py` | Piper real; erro explícito sem binário/modelo |
| `services/voice_runtime/voice_engine.py` | Orquestração STT/TTS |
| `services/voice_runtime/__init__.py` | Exporta os adapters e o engine |
| `apps/api/routers/voice.py` | `/voice/transcribe`, `/voice/synthesize`, `/voice/command` |
| `apps/api/main.py` | Registo do router de voz |
| `pyproject.toml` | Extra opcional `voice` |

### Planeados, não implementados

| Ficheiro | Função |
|---|---|
| `apps/voice_daemon/tray.py`, `listener.py`, `client.py`, `playback.py`, `config.py` | Refatoração do daemon em módulos |
| `services/voice_runtime/wake_word.py`, `audio_io.py` | Abstrações hoje inline no daemon |
| `apps/mobile/pubspec.yaml` | `record`, `just_audio`, `flutter_foreground_task`, `permission_handler`, `flutter_local_notifications`, `porcupine_flutter` |
| `apps/mobile/lib/main.dart` | Modo voz e serviço em primeiro plano |
| `apps/mobile/android/app/src/main/AndroidManifest.xml` | Permissões e serviço de microfone |
| `iniciar_jarvis_silencioso.vbs` | Arranque do daemon no logon (hoje só inicia o backend) |

### Dependências Python atuais

```toml
[project.optional-dependencies]
voice = [
    "faster-whisper>=1.0.0",
    "piper-tts>=1.2.0",
    "sounddevice>=0.4.6",
    "numpy>=1.26.0",
    "openwakeword>=0.6.0",
    "pystray>=0.19.5",
    "Pillow>=10.0.0",
]
```

> O `pyproject.toml` **não** inclui `webrtcvad` nem Silero; o VAD atual é RMS. A escolha final de wake word depende de licenças: Porcupine não é open source; openWakeWord é Apache 2.0.

---

## 16. Plano de testes

### Automatizados (estado atual)

- `/voice/transcribe` usa o adaptador local quando não há chave cloud e devolve texto (mock).
- `/voice/synthesize` devolve WAV válido com cabeçalho RIFF (mock).
- `/voice/command`: hora, comando desconhecido sem execução, pedido de aprovação e auditoria.
- `/voice/command`: valida a propriedade do projeto.
- VAD distingue sinal de silêncio em WAV PCM.
- `VoiceEngine` desativado por omissão e pipeline com adapters falsos.
- Daemon converte PCM bruto em WAV e aplica o limiar de VAD.

**Lacunas:** não há fixture de wake word real, teste com faster-whisper/Piper reais, teste de mute/kill switch nem teste Android.

### Manuais

- Dizer “Hey Jarvis” (ou “Jarvis”) com o dashboard fechado.
- Falar baixo, longe do microfone, com ruído.
- Interromper o TTS com “Jarvis”.
- Mudar de dispositivo de áudio a meio.
- Bloquear o ecrã no Android e testar.
- Testar bateria durante 1 hora.
- Testar com PC desligado (mensagem clara).
- Verificar indicador de gravação do Windows/Android.

### Critérios de aceite

- 0 áudio enviado antes da wake word.
- 0 comando sensível executado sem aprovação.
- 100% dos comandos auditados.
- Latência de comando simples < 5 s.
- Falsos positivos < 1/hora em ambiente normal.

---

## 17. Decisões e perguntas em aberto

### Já decidido

- **Windows primeiro**; Android depois.
- **Aprovação sensível** só no dashboard/celular, nunca só por voz.
- **openWakeWord** no MVP, com o modelo `hey_jarvis`; Porcupine fica como alternativa.
- **STT/TTS local** no daemon; o push-to-talk web pode usar o provedor cloud configurado e cair para o local.
- **Áudio não é guardado** pelo daemon; só a transcrição segue para o backend.

### Em aberto

- O JARVIS deve responder sempre, ou só quando o utilizador estiver na mesma sala?
- Vai haver mais do que um utilizador na casa? Perfis de voz?
- O PC fica sempre ligado? Se não, qual o fallback no celular?
- Autorizas cloud para STT/LLM quando o CPU estiver lento?
- A voz deve ser pt-BR, pt-PT ou configurável?
- Queres manter “Hey Jarvis” ou treinar/validar um modelo dedicado a “Jarvis”?
- Queres aprovação por voz de baixo risco, ou tudo passa pelo painel?

---

*Fim do documento.*
