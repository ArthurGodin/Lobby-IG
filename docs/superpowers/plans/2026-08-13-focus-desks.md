# Plano de implementação — Mesas de foco

Spec: `docs/superpowers/specs/2026-08-13-focus-desks-design.md`

## Resultado

Permitir que uma pessoa próxima a uma estação livre pressione `E` ou use o botão do painel para
sentar e entrar em foco. Ocupação, posição, imobilidade, áudio e liberação serão autoritativos no
servidor e não exigirão banco, cloud ou serviço pago.

## Etapa 1 — Modelo canônico

- Adicionar `FocusDeskDefinition` e mesas estáveis ao mapa.
- Validar IDs, limites, saída caminhável e raio de interação.
- Criar funções puras para encontrar a mesa elegível mais próxima e consultar ocupação.
- Cobrir o comportamento com testes do `game-core` já executados pela suíte do servidor.

## Etapa 2 — Contrato e servidor

- Adicionar `focusDeskId` ao jogador e resultado estruturado da interação.
- Manter o comando `focus`, mas validar proximidade e disponibilidade no servidor.
- Ancorar o avatar ao ativar; restaurar o ponto de saída ao liberar.
- Resolver disputa de forma determinística no loop único do servidor.
- Liberar a reserva junto com a remoção da sessão.
- Testar ativação, distância, disputa, movimento bloqueado e liberação.

## Etapa 3 — Cliente e cena

- Validar e expor resultados de foco na conexão WebSocket.
- Calcular a mesa próxima apenas para apresentação; nunca conceder a reserva no cliente.
- Vincular `E` sem interferir em inputs ou repetição automática.
- Destacar mesa próxima/ocupada e mostrar prompt no Phaser.
- Adaptar botão, textos, `aria-live` e feedback de erro no React.
- Preservar o mute imediato e a interface responsiva.

## Etapa 4 — Verificação

- Executar `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build` e `git diff --check`.
- Testar em duas sessões: aproximação, disputa, foco, bloqueio, saída e console.
- Atualizar README, criar commit único compilável e enviar para `origin/main`.
