# Plano de implementação — Motor de objetos interativos

Spec: `docs/superpowers/specs/2026-08-13-interactive-objects-design.md`

## Resultado

Substituir a interação específica das mesas por um motor tipado, autoritativo e reutilizável. Uma
ação próxima continuará instantânea; múltiplas ações abrirão um seletor acessível. A experiência
de foco atual será preservada sem dependências ou serviços novos.

## Etapa 1 — Catálogo e seleção

- Introduzir a união `WorldInteractableDefinition` e migrar as mesas para
  `CAMPUS_MAP.interactables`.
- Validar IDs, tipos, posições, raios e configurações por tipo.
- Criar consultas por ID e seleção determinística de candidatos.
- Cobrir catálogo, prioridade, distância e desempate com testes puros.

## Etapa 2 — Protocolo e autoridade

- Trocar `focus`/`focus_result` por `interact`/`interaction_result` tipados.
- Extrair o processamento para um serviço com handlers exaustivos por tipo.
- Implementar `enter_focus` e `leave_focus`, incluindo deduplicação por `requestId`.
- Preservar ancoragem, ocupação, barreira, saída segura e liberação na desconexão.
- Testar validação, distância, disputa, idempotência e resultados correlacionados.

## Etapa 3 — Controlador e interface

- Criar controlador puro para candidatos, ação direta, seleção e requisições pendentes.
- Migrar o cliente WebSocket para o protocolo genérico.
- Adicionar seletor contextual acessível no React e destaque do alvo no Phaser.
- Bloquear movimento enquanto o seletor estiver aberto e preservar teclado, mouse e `aria-live`.
- Manter a camada de mídia dependente apenas do snapshot autoritativo de foco.

## Etapa 4 — Verificação e entrega

- Executar `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build` e `git diff --check`.
- Fazer QA em duas sessões para ação direta, disputa, saída e seletor com múltiplos candidatos.
- Atualizar documentação de uso se a interação visível mudar.
- Criar um commit compilável e enviar para `origin/main`.

