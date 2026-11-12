# VOICE ASSISTANT — Assistente por voz em segundo plano

> **Versão:** 1.0  
> **Data:** 12/11/2026  
> **Estado:** proposta (não implementado)  
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

A base já existe: chat, 26 agentes, orquestrador, aprovações, workspace e app Flutter. O que falta é a **camada de voz real** e o **modo de execução em segundo plano**.

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
| Arranque silencioso no Windows | ✅ Parcial | `iniciar_jarvis_silencioso.vbs` |
| Microfone no dashboard | ✅ Push-to-talk | `apps/dashboard/src/hooks/useChatStream.ts` |
| STT cloud | ⚠️ Se houver chave | `apps/api/routers/voice.py` (Groq/OpenAI Whisper) |
| STT local | ❌ Simulado | `services/voice_runtime/stt_adapter.py` devolve frase fixa |
| TTS backend | ❌ Simulado | `services/voice_runtime/tts_adapter.py` devolve WAV vazio |
| TTS no browser | ✅ Real, robótico | `speechSynthesis` em `MessageBubble.tsx` |
| Wake word | ❌ Não existe | — |
| Voz no celular | ❌ Não existe | `apps/mobile/lib/main.dart` |
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

### Aviso importante sobre o Windows

**Não corra o ouvinte de microfone como serviço do Windows.** Serviços correm na *Session 0* e não têm acesso ao microfone do utilizador. O correto é uma **app de bandeja** iniciada no logon do utilizador, via Task Scheduler.

---

## 5. Desktop em segundo plano

### 5.1 O que mudar

Hoje o `apps/desktop/main_window.py` inicia o Uvicorn e **mata o backend quando a janela fecha** (linhas 109–111).

Para ficar em segundo plano:

1. Criar um **processo daemon** separado: `apps/voice_daemon/`.
2. O daemon:
   - inicia o backend se ainda não estiver a correr;
   - corre o loop de wake word + VAD;
   - mostra ícone na bandeja;
   - permite mutar o microfone;
   - abre o dashboard com duplo clique;
   - encerra tudo de forma limpa.
3. O `main_window.py` passa a ser só a janela; se o daemon já estiver ativo, liga-se a ele.
4. Arranque no logon:
   - Task Scheduler → “Ao iniciar sessão” → `pythonw.exe apps\voice_daemon\main.py`;
   - ou manter o `.vbs` para esconder a consola.

### 5.2 Estrutura sugerida

```
apps/voice_daemon/
├── main.py           # entrada, single instance, sinais
├── tray.py           # ícone, menu, mute, sair
├── listener.py       # wake word + VAD + captura
├── client.py         # HTTP/WebSocket para o backend
├── playback.py       # reprodução de TTS
└── config.py         # dispositivo, threshold, atalhos
```

### 5.3 Comportamentos

- **Instância única:** mutex/lock file; se já houver uma, foca a existente.
- **Mute:** atalho global (`Ctrl+Alt+J` ou configurável) e menu da bandeja.
- **Estado visível:** verde = a ouvir; amarelo = a processar; vermelho = mutado/erro.
- **Logs:** rotação em `data/logs/voice.log`.
- **Kill switch:** o daemon consulta o estado e para de ouvir.
- **Echo cancellation:** enquanto o TTS fala, o microfone ignora o áudio do próprio JARVIS.
- **Dispositivo de áudio:** detetar mudança de dispositivo padrão e reabrir o stream.

### 5.4 Fluxo

```
Diz "Jarvis"
  → chime curto
  → "Sim?"
  → grava até detetar silêncio (VAD)
  → STT local
  → /api/v1/chat ou /api/v1/voice/command
  → resposta
  → TTS local
  → alto-falante
```

### 5.5 Detalhes de UX

- **Janela de follow-up:** 5–10 segundos para continuar a conversa sem repetir “Jarvis”.
- **Barge-in:** dizer “Jarvis” enquanto ele fala interrompe o TTS.
- **Mute visível:** ícone na bandeja muda de cor; atalho global.
- **Confirmação curta:** “Feito”, “Não encontrei”, “Preciso de aprovação no painel”.

---

## 6. Celular

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

### 8.3 Streaming

Para streaming de áudio, um WebSocket (`/ws/voice`) é melhor:

- envia chunks de áudio;
- recebe transcrição parcial;
- recebe resposta em texto e áudio;
- permite barge-in e cancelamento.

O MVP pode começar com gravação completa + POST; o streaming entra na fase V2.

---

## 9. Fases de implementação

### V0 — Voz real (3–4 dias)

- Substituir `LocalSTTAdapter` por **faster-whisper** real, com fallback para o comportamento atual se o modelo não estiver disponível.
- Substituir `LocalTTSAdapter` por **Piper** real, devolvendo WAV válido.
- Adicionar VAD.
- Adicionar `/api/v1/voice/synthesize` e `/api/v1/voice/command`.
- Testes com ficheiros WAV de fixture, sem microfone.

**Aceite:** enviar um WAV e receber texto correto; enviar texto e receber WAV audível.

### V1 — Wake word no desktop (3–4 dias)

- `apps/voice_daemon/` com wake word, VAD, STT, chamada ao chat e TTS.
- Ícone na bandeja: a ouvir / mutado / sair.
- Arranque no logon via Task Scheduler.
- Instância única.
- Botão de mute e atalho global.

**Aceite:** dizer “Jarvis” com o dashboard fechado → chime → pergunta → resposta falada.

### V2 — Conversa por voz (3–4 dias)

- Janela de follow-up.
- Barge-in.
- TTS por frase (primeira frase toca mais cedo).
- Comandos “cancelar”, “silêncio”, “repete”.
- Sessão de voz separada da sessão de texto.

**Aceite:** conversa de 3 turnos sem repetir a wake word.

### V3 — Assistente pessoal (1–2 semanas)

- Intent router determinístico para hora, data, cálculo, timer, lembrete, clima, abrir app/pasta.
- Skills novas registadas no catálogo.
- Aprovações por notificação.
- Auditoria e retenção de transcrições.

**Aceite:** 10 comandos do dia a dia funcionam sem LLM e com latência < 2 s.

### V4 — Android (1–2 semanas)

- Serviço em primeiro plano.
- Wake word local.
- Gravação + envio para o PC.
- Reprodução de TTS.
- Notificações de aprovação.
- Pareamento com token existente.
- Teste em aparelho físico, bateria e ecrã bloqueado.

**Aceite:** telefone no bolso → “Jarvis” → resposta pelo alto-falante.

### V5 — iOS e extras (opcional)

- Push-to-talk.
- Atalho da Siri.
- Live Activity para aprovações.
- Sem promessa de escuta contínua.

### V6 — Hardening (contínuo)

- Privacidade, retenção, auditoria.
- Verificação de locutor (opcional).
- Kill switch para o ouvinte.
- Métricas de falsos positivos e latência.

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

- **Indicador visível sempre**: ícone na bandeja, notificação no Android.
- **Mute por hardware/atalho**, não só por menu.
- **Wake word 100% local**: nenhum áudio sai do dispositivo antes da ativação.
- **Ring buffer em memória**: o áudio anterior à wake word é descartado.
- **Áudio não é guardado por padrão**; só transcrição, com retenção configurável.
- **Token por dispositivo**, com revogação.
- **TLS/Tailscale** para acesso remoto; nunca expor o backend na Internet.
- **Auditoria de cada comando**: dispositivo, transcrição, intent, ferramentas, resultado.
- **Aprovação humana** para ações sensíveis; voz não aprova sozinha.
- **Kill switch** para o ouvinte e para tarefas.
- **Sem modo furtivo**: o utilizador tem de saber que está a ser ouvido.
- **Prompt injection**: a transcrição é conteúdo não confiável; as permissões de ferramentas mantêm-se.
- **Verificação de locutor** (opcional, futuro): reduz spoofing, mas não é MVP.

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

### Semana 1

- STT local real (faster-whisper `base` int8).
- TTS local real (Piper pt-BR).
- VAD.
- Endpoint `/voice/command`.
- Testes com WAV.

### Semana 2

- Wake word “Jarvis” (Porcupine ou openWakeWord).
- Daemon + bandeja + autostart.
- Fluxo completo: wake → pergunta → resposta falada.
- 5 intents determinísticos: hora, data, timer, clima, abrir app.
- Auditoria, mute e retenção.

### Aceite do MVP

Com o dashboard fechado, dizer “Jarvis, que horas são?” e ouvir a resposta em menos de 5 segundos.

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

### Novos

| Ficheiro | Função |
|---|---|
| `apps/voice_daemon/main.py` | Entrada do daemon, single instance |
| `apps/voice_daemon/tray.py` | Ícone e menu da bandeja |
| `apps/voice_daemon/listener.py` | Wake word + VAD + captura |
| `apps/voice_daemon/client.py` | HTTP/WebSocket para o backend |
| `apps/voice_daemon/playback.py` | Reprodução de TTS |
| `services/voice_runtime/wake_word.py` | Deteção da palavra de ativação |
| `services/voice_runtime/vad.py` | Deteção de atividade de voz |
| `services/voice_runtime/audio_io.py` | Abstração de microfone/alto-falante |
| `tests/integration/test_voice_pipeline.py` | Testes com WAV |
| `docs/VOICE_ASSISTANT.md` | Este documento |

### Modificados

| Ficheiro | Alteração |
|---|---|
| `services/voice_runtime/stt_adapter.py` | STT local real com fallback |
| `services/voice_runtime/tts_adapter.py` | TTS local real com fallback |
| `services/voice_runtime/voice_engine.py` | Orquestração de voz |
| `apps/api/routers/voice.py` | `/voice/command`, `/voice/synthesize` |
| `apps/api/deps.py` | Wiring dos serviços de voz |
| `apps/desktop/main_window.py` | Não matar o backend se o daemon for dono |
| `iniciar_jarvis_silencioso.vbs` | Arranque do daemon no logon |
| `pyproject.toml` | Dependências opcionais de voz |
| `apps/mobile/pubspec.yaml` | `record`, `just_audio`, `flutter_foreground_task`, `permission_handler`, `flutter_local_notifications`, `porcupine_flutter` |
| `apps/mobile/lib/main.dart` | Modo voz e serviço em primeiro plano |
| `apps/mobile/android/app/src/main/AndroidManifest.xml` | Permissões e serviço de microfone |

### Dependências Python sugeridas

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
    "webrtcvad>=2.0.10",
]
```

> A escolha final depende de licenças e do instalador. Porcupine não é open source; openWakeWord é Apache 2.0.

---

## 16. Plano de testes

### Automatizados

- WAV de fixture → STT devolve texto esperado.
- Texto → TTS devolve WAV válido (cabeçalho RIFF, duração > 0).
- VAD deteta início/fim em WAV com silêncio.
- Wake word: WAV com “Jarvis” deteta; WAV sem “Jarvis” não deteta.
- `/voice/command`: intent correto, resposta, aprovação.
- Isolamento: dispositivo A não vê sessão de B.
- Falha de rede: erro explícito, sem bloqueio.
- Timeout de STT/TTS.
- Mute: nenhum áudio processado.

### Manuais

- Dizer “Jarvis” com o dashboard fechado.
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

## 17. Perguntas em aberto

- O JARVIS deve responder sempre, ou só quando o utilizador estiver na mesma sala?
- Vai haver mais do que um utilizador na casa? Perfis de voz?
- O PC fica sempre ligado? Se não, qual o fallback no celular?
- Autorizas cloud para STT/LLM quando o CPU estiver lento?
- A voz deve ser pt-BR, pt-PT ou configurável?
- Queres que o JARVIS tenha um nome de ativação alternativo?
- A aprovação por voz de baixo risco é aceitável, ou tudo passa pelo painel?

---

*Fim do documento.*
