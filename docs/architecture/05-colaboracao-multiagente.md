# Colaboração multiagente coordenada pelo Jarvis

## Princípio

O utilizador conversa com o JarvisMaster. O orquestrador seleciona especialistas conforme a intenção, define o plano, encaminha contexto e consolida os resultados. Os agentes não são identidades de utilizador e não podem conceder a si próprios permissões ou aprovar operações protegidas.

## Mesa redonda com revisão entre pares

Pedidos complexos com intenção de análise, investigação, diagnóstico, resolução de problemas ou avaliação podem convocar a mesa redonda automaticamente. O utilizador também pode pedir explicitamente uma deliberação. O fluxo `multi_agent_consensus` executa os especialistas em sequência deliberada:

1. O primeiro especialista produz o parecer inicial.
2. O segundo recebe o resumo do primeiro através de `previous_outputs` no prompt especializado. Deve avaliar e contestar o parecer anterior.
3. O terceiro recebe os dois pareceres e realiza revisão crítica, identificando lacunas e contradições.
4. O JarvisMaster recebe os três resultados e produz a síntese final. Não deve declarar unanimidade sem evidência nem inventar testes executados.

A execução sequencial é intencional para permitir handoff explícito de contexto e reduzir a pressão de memória em computadores CPU-first.

## Governança

- Cada tarefa tem um limite de tempo e de tokens configurado na inferência.
- Os especialistas só recebem as ferramentas permitidas pelo respetivo perfil.
- Escritas no Workspace continuam condicionadas à política de aprovação humana.
- O resultado final deve distinguir análise, ações executadas, evidências, riscos e bloqueios.
- Falha na síntese do Maestro não transforma pareceres individuais em consenso: os pareceres são apresentados separadamente e a indisponibilidade fica explícita.

## Evolução planeada

A próxima etapa é persistir cada mensagem interagente no histórico da tarefa e expor no dashboard a linha temporal de delegação, handoff, revisão, evidências e consolidação. O EventRouter existente poderá ser integrado como barramento de eventos, sem duplicar o papel do JarvisMaster.
