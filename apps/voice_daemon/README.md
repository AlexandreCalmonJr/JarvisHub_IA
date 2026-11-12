# JARVIS Voice Daemon (Windows)

O daemon mantém o modelo local `hey_jarvis` ativo na bandeja do Windows. A frase treinada é “Hey Jarvis”; dizer apenas “Jarvis” pode funcionar, com mais falhas de deteção. O
microfone pode ser mutado pelo menu do ícone. Áudio e transcrição ficam no PC;
somente o texto reconhecido segue para a API local autenticada.

## Requisitos

1. Instale as dependências opcionais: `python -m pip install -e ".[voice]"`.
2. Configure `JARVIS_VOICE_TOKEN` com um token de dispositivo/conta autorizado.
3. Configure `JARVIS_PIPER_EXECUTABLE` e `JARVIS_PIPER_MODEL` para uma voz Piper.
4. Opcionalmente configure `JARVIS_STT_MODEL` (padrão `base`),
   `JARVIS_WAKEWORD_MODEL` (padrão `hey_jarvis`),
   `JARVIS_WAKEWORD_THRESHOLD` (padrão `0.5`) e `JARVIS_VAD_RMS` (padrão `600`).

O detector consome áudio PCM mono a 16 kHz em blocos de 80 ms e exige dois
blocos acima do limiar para reduzir ativações acidentais. O modelo não inclui
conjunto de avaliação publicado; calibre o limiar no ambiente e valide falsos
positivos/negativos antes do uso diário.

## Executar

No PowerShell aberto na raiz do repositório:

```powershell
.\.venv\Scripts\python.exe -m apps.voice_daemon.main
```

Para iniciar sem consola, use `.venv\Scripts\pythonw.exe -m apps.voice_daemon.main`
com a pasta do projeto definida como diretório inicial. O Task Scheduler pode
executar esse comando **ao iniciar sessão do utilizador**. Não configure um
serviço Windows para o microfone: serviços correm na Session 0.

Os registos ficam em `data/logs/voice.log`. Uma instância apenas é permitida.
Se o daemon iniciar o backend, encerra esse processo ao sair; se o backend já
estiver ativo, deixa-o em execução.

## Limites desta primeira versão

O daemon usa um comando determinístico quando reconhecido e encaminha os outros
pedidos ao chat autenticado. Ações sensíveis continuam sujeitas à aprovação do
dashboard. Ainda não há atalho global, janela de follow-up, barge-in, notificações
de aprovação nem cliente Android. Teste microfone, wake word e modelo Piper no
PC de destino antes de ativar o início automático.
