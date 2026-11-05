# Relatório de Benchmark de Modelos Locais — Fase 3

- **Data**: 2026-11-05
- **Hardware de Teste**: Intel Core i5-8265U (4C/8T @ 1.60GHz), 32 GB RAM, SSD, Windows 10 Pro
- **Runtime**: Ollama v0.40.14 (CPU baseline, sem aceleração de GPU externa)
- **Fila de Concorrência**: `InferenceQueue` ativa (1 geração concorrente máxima)

---

## 1. Modelos Disponíveis no Ambiente

1. `llama3.2:3b` (2.0 GB, Q4_K_M) — Designado para: **JARVIS Master, triagem e roteamento ágil**
2. `qwen2.5-coder:7b` (4.7 GB, Q4_K_M) — Designado para: **Engenharia de software, geração e revisão de código**
3. `qwen2.5:7b` (4.7 GB, Q4_K_M) — Designado para: **Raciocínio aprofundado, modelagem de ameaças e BI**

---

## 2. Resultados do Benchmark Real (`llama3.2:3b`)

| Teste | Objetivo | Tokens Gerados | Latência Total | Débito (Tokens/s) | Formato / Validação |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1. Português Geral** | Síntese de arquitetura em 3 frases | 110 tokens | 15.3 s | **10.22 t/s** | Resposta coerente e estruturada |
| **2. Código Python** | Função de validação de hash SHA-256 | 256 tokens | 27.8 s | **9.45 t/s** | Sintaxe Python válida com regex/hashlib |
| **3. JSON Estruturado** | Extração de payload estrito com formato JSON | 22 tokens | 3.19 s | **10.29 t/s** | JSON 100% válido (`{"status": "ok", ...}`) |

---

## 3. Conclusão e Decisão da Fase 3

1. **Viabilidade Comprovada**:
   O modelo `llama3.2:3b` atinge **~10 tokens/s de forma estável na CPU do notebook**, sem travamentos e com respostas rápidas (~3s para payloads estruturados JSON).
2. **Modelo Padrão para Orquestração**:
   - `llama3.2:3b` é fixado como modelo padrão do **JARVIS Master** para triagem rápida, classificação de intenções e chamadas estruturadas.
   - `qwen2.5-coder:7b` será invocado sob demanda apenas quando agentes de desenvolvimento/QA forem ativados pelo grafo.
3. **Consumo de Recursos**:
   - Memória utilizada por `llama3.2:3b`: ~2.5 GB RAM (deixando mais de 20 GB livres para o sistema e workspace).
   - Concorrência de 1 geração simultânea protege a CPU contra picos térmicos.
