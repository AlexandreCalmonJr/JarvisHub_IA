# ADR 0004: Serialização de Inferência em CPU (InferenceQueue) e Gateway Híbrido

- **Status**: Aceite
- **Data**: 2026-11-08
- **Autores**: Equipa JARVIS AI HUB
- **Contexto**: Gestão de Recursos Térmicos e Provedores Híbridos

---

## 1. Contexto e Problema

O hardware notebook de desenvolvimento (Intel Core i5-8265U) possui 4 núcleos e 8 threads lógicas, sem GPU dedicada com aceleração CUDA. 

Ao executar modelos quantizados (como `llama3.2:3b` ou `qwen2.5-coder:7b`) via instruções AVX2, cada inferência consome entre 70% e 90% da capacidade total da CPU. Se duas inferências pesadas fossem processadas simultaneamente:
* A CPU entraria em estrangulamento térmico (*thermal throttling*).
* O sistema operacional Windows e a IDE congelariam temporariamente.
* O tempo total de resposta de ambas as requisições se degradaria exponencialmente.

Ao mesmo tempo, para tarefas pontuais ultrarrápidas, o usuário poderia querer utilizar *tiers* gratuitos em nuvem (Groq, OpenRouter, Together AI, HuggingFace Hub) sem custos e sem aquecer o computador.

---

## 2. Decisão

1. **Serialização Estrita de CPU com `InferenceQueue`**:
   - Implementado um semáforo de concorrência com `max_concurrent = 1` dedicado a chamadas de LLM na CPU local.
   - Requisições simultâneas entram em fila FIFO ordenada.
   - Timeout dinâmico adaptativo e suporte a cancelamento de tarefas abortadas pelo cliente.

2. **Alocação Dinâmica de Threads do Ollama (`HardwarePerformanceManager`)**:
   - Criação de 4 perfis de energia:
     - `Turbo`: Utiliza $N-1$ threads para velocidade máxima de tokens.
     - `Balanced`: Utiliza 4 a 6 threads, reservando núcleos livres para o Windows, navegador e VS Code continuarem fluidos.
     - `Eco`: Modo silencioso e econômico para preservação de bateria.
     - `Auto`: Alterna automaticamente conforme o status de alimentação (tomada vs bateria).

3. **Hybrid Model Gateway com Fallback Local**:
   - Suporte opcional a provedores em nuvem com *tiers* gratuitos (Groq, OpenRouter, FreeLLM).
   - O tráfego padrão permanece **100% local e privado** (`llama3.2:3b` no Ollama). A nuvem só é acionada se o usuário ativar explicitamente a chave no painel de configurações.

---

## 3. Consequências

### Positivas:
* Estabilidade térmica total do notebook sem engasgos de interface ou travamentos do sistema operacional.
* Velocidade sustentada de 10 a 15 tokens/segundo em modo local na CPU.
* Flexibilidade para o desenvolvedor habilitar aceleração de nuvem gratuita quando estiver em projetos sem restrição de confidencialidade.
