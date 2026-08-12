# Plano de implementação — Campus GBA modernizado

Spec de origem:
`docs/superpowers/specs/2026-08-12-gba-modernized-campus-design.md`

## Resultado esperado

Entregar uma fatia vertical completa com mapa pixel art original, avatar animado, câmera seguindo
o jogador, visão geral controlada por React e todas as regras existentes de movimento,
proximidade e multiplayer preservadas.

## Princípios de execução

- manter commits pequenos e reversíveis;
- escrever ou atualizar testes junto com cada regra;
- preservar `TILE_SIZE = 32` como unidade autoritativa;
- tratar `ART_TILE_SIZE = 16`, `ART_SCALE = 2` e zoom como conceitos separados;
- não adicionar engine, biblioteca de UI, serviço externo ou custo;
- não duplicar geometria entre `game-core` e Phaser;
- usar arte própria gerada deterministicamente no repositório.

## Etapa 1 — Contratos de aparência

Arquivos:

- `packages/contracts/src/index.ts`
- `apps/server/src/protocol.ts`
- `apps/server/src/campusServer.ts`
- `apps/server/src/protocol.test.ts`

Tarefas:

1. Adicionar `AvatarAppearance { outfitColor: PlayerColor }`.
2. Tornar `JoinOptions.appearance` opcional.
3. Tornar `PlayerSnapshot.appearance` obrigatório e normalizado.
4. Validar `appearance` como dado não confiável no protocolo.
5. Preservar `color` durante a migração para compatibilidade da UI.
6. Cobrir fallback e rejeição de cores inválidas em testes.

Gate: `pnpm test` e `pnpm typecheck` passam.

## Etapa 2 — Mapa canônico

Arquivos:

- `packages/game-core/src/campusMap.ts` (novo)
- `packages/game-core/src/index.ts`
- `apps/server/src/protocol.test.ts`

Tarefas:

1. Definir `CampusMapDefinition` de `48 × 34` tiles.
2. Criar camadas semânticas `ground`, `structures` e `decorations`.
3. Modelar Pátio, Desenvolvimento, Biblioteca e Administração/Reitoria.
4. Derivar `MAP_WIDTH`, `MAP_HEIGHT`, `OBSTACLES`, `ZONES` e `SPAWN_POINTS` dessa definição.
5. Definir `x/y` como ponto dos pés e collider pequeno no `game-core`.
6. Validar comprimento de camadas, identificadores, spawns caminháveis e colliders dentro do
   mapa.
7. Atualizar testes de colisão e spawn para o novo layout.

Gate: nenhum valor geométrico de caminho, parede ou móvel precisa nascer no Phaser.

## Etapa 3 — Assets pixel art

Arquivos:

- `scripts/generate-pixel-assets.mjs` (novo)
- `apps/web/public/assets/pixel/campus-tiles.png` (gerado)
- `apps/web/public/assets/pixel/avatar-base.png` (gerado)
- `apps/web/public/assets/pixel/avatar-outfit-mask.png` (gerado)
- `apps/web/public/assets/pixel/README.md` (novo)
- `apps/web/src/game/assets.ts` (novo)

Tarefas:

1. Implementar um encoder PNG determinístico com APIs nativas do Node e `node:zlib`.
2. Desenhar o tilesheet em grade de `16 × 16` com a paleta aprovada.
3. Desenhar 12 frames de avatar (`4 direções × 3 poses`) em `16 × 24`.
4. Separar corpo e máscara de roupa, mantendo frames e pivôs idênticos.
5. Registrar autoria, licença, paleta, dimensões e comando de regeneração.
6. Validar assinatura PNG, dimensões, transparência e hash estável após duas gerações.

Gate: assets são originais, locais, reprodutíveis e não exigem dependência ou API.

## Etapa 4 — Renderer Phaser

Arquivos:

- `apps/web/src/game/CampusScene.ts`
- `apps/web/src/game/createCampusGame.ts`
- `apps/web/src/game/assets.ts`

Tarefas:

1. Carregar tiles e folhas do avatar em `preload`.
2. Configurar `pixelArt`, filtro nearest, `roundPixels` e `Phaser.Scale.RESIZE`.
3. Criar as três `TilemapLayer` a partir do mapa canônico e aplicar `ART_SCALE = 2`.
4. Remover toda geometria do campus codificada na cena.
5. Substituir círculos por avatar-base + máscara tingida, com origem nos pés.
6. Calcular frames de direção, `idle` e caminhada sem criar timers por jogador.
7. Interpolar displays entre snapshots; manter coordenadas autoritativas fora do renderer.
8. Fazer nome, sombra e radar acompanharem a posição visual.
9. Criar placeholders locais caso algum PNG falhe ao carregar.

Gate: duas abas mostram direção, movimento, cor e proximidade corretos.

## Etapa 5 — Câmera híbrida e React

Arquivos:

- `apps/web/src/game/CampusScene.ts`
- `apps/web/src/components/CampusApp.tsx`
- `apps/web/src/styles.css`

Tarefas:

1. Expor `setOverview(enabled)` na cena.
2. No modo normal, aplicar bounds e seguir o display interpolado com lerp.
3. No overview, interromper follow, centralizar e calcular zoom de enquadramento.
4. Recalcular o overview em resize e restaurar follow após reconexão.
5. Ocultar nomes, mas manter marcadores de jogadores no overview.
6. Adicionar botão React com ícone, rótulo mutável, `aria-pressed` e foco visível.
7. Adicionar indicador de modo e anúncio `aria-live`.
8. Fechar overview com `Esc`, sem interceptar campos editáveis.
9. Manter movimento ativo nos dois modos.
10. Ajustar o frame do mapa para viewport real, sem usar a proporção do mundo como layout.

Gate: alternar câmera nunca envia mensagem de rede nem altera posição.

## Etapa 6 — Verificação e acabamento

Arquivos:

- testes existentes e novos conforme necessário;
- `README.md`
- `docs/architecture/overview.md`

Tarefas:

1. Executar `pnpm test`, `pnpm typecheck`, `pnpm lint` e `pnpm build`.
2. Verificar health check do servidor e carregamento do Vite.
3. Testar duas sessões: nome, cor, direção, caminhada, colisão e proximidade.
4. Testar follow nas quatro bordas e overview após resize.
5. Testar teclado, `Esc`, foco no nome e acessibilidade do botão.
6. Testar viewport desktop e estreito; registrar que o MVP móvel não tem controle touch.
7. Capturar erros do navegador e falhas de assets.
8. Medir tamanho do bundle, FPS e uso aproximado de memória com o mapa completo.
9. Atualizar documentação e registrar dívidas sem expandir o escopo.

Gate final: todos os critérios da spec passam e o `git status` fica limpo após o commit.

## Sequência de commits

1. `feat: add canonical campus map and avatar appearance`
2. `feat: add original pixel art assets`
3. `feat: render pixel campus and animated avatars`
4. `feat: add hybrid campus camera`
5. `test: verify pixel campus multiplayer flow`

Commits poderão ser combinados quando uma alteração intermediária não compilar isoladamente,
mas cada commit final deverá representar um estado executável e revisado.
