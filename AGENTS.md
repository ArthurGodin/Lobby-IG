# Instruções para agentes do Lobby-IG

Antes de analisar, planejar ou alterar código, leia integralmente
[`docs/PROJECT_HANDOFF.md`](docs/PROJECT_HANDOFF.md). Ele é o contexto operacional do projeto.

## Regras obrigatórias

1. Preserve a visão: um campus corporativo 2D, leve no navegador, com colaboração por presença e
   mídia por proximidade. Não transforme o produto em uma chamada de vídeo comum.
2. O servidor é autoritativo para posição, colisão, zonas, interações e permissões. O cliente só
   envia intenção e renderiza estado validado.
3. Privacidade fecha por padrão: snapshots de mídia ausentes ou inválidos devem remover
   assinaturas remotas; nunca conceda acesso de mídia apenas porque o cliente pediu.
4. Desenvolvimento local não pode depender de serviço pago. Não adicione SaaS, banco externo ou
   hospedagem sem aprovação explícita do usuário.
5. Preserve mudanças existentes do usuário. Comece com `git status`; não use reset, checkout
   destrutivo ou reescrita ampla para “limpar” o repositório.
6. Não exponha segredos. `.env` é local e não deve ser commitado. Chaves `devkey`/`secret` do
   LiveKit são somente para desenvolvimento.
7. Antes de concluir uma alteração de código, rode ao menos `pnpm format`, `pnpm test`,
   `pnpm typecheck`, `pnpm lint`, `pnpm build` e `git diff --check`, salvo impedimento explicado.
8. Faça mudanças pequenas, coesas e testáveis. Atualize `docs/PROJECT_HANDOFF.md` quando uma
   decisão de arquitetura, custo, segurança ou roadmap mudar materialmente.

## Atalhos

- Visão completa e roteiro: [`docs/PROJECT_HANDOFF.md`](docs/PROJECT_HANDOFF.md)
- Arquitetura: [`docs/architecture/overview.md`](docs/architecture/overview.md)
- Estratégia de custo: [`docs/architecture/zero-cost.md`](docs/architecture/zero-cost.md)
- Decisões de produto: [`docs/superpowers/specs`](docs/superpowers/specs)

Se instruções de uma tarefa conflitarem com este arquivo, siga a instrução mais específica do
usuário, mantendo segurança, privacidade e custo explícitos.
