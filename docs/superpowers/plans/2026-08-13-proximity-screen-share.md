# Plano de implementação — Compartilhamento de tela por proximidade

Spec: `docs/superpowers/specs/2026-08-13-proximity-screen-share-design.md`

## Resultado

Adicionar uma estação de apresentação ao campus. Uma pessoa próxima reserva a estação, escolhe uma tela no seletor nativo e a publica via LiveKit. Somente colegas dentro do raio de audiência recebem e renderizam o vídeo; saída, término da captura e desconexão encerram ou desassinam a mídia.

## Etapa 1 — Mundo, contratos e política pura

- Adicionar `screen_station` ao catálogo de interações e uma estação no Pátio.
- Incluir ações semânticas `start_screen_share` e `stop_screen_share`.
- Acrescentar snapshots de apresentação ao estado do mundo, com validações de dados simples.
- Criar helpers puros para elegibilidade de audiência e política de assinatura seletiva de vídeo.
- Cobrir prioridade, ocupação, alcance e política com testes unitários.

## Etapa 2 — Autoridade do servidor e token de mídia

- Estender o serviço de interações com handler exclusivo da estação de tela.
- Manter a reserva por jogador e liberar em parada, perda de alcance, foco e desconexão.
- Incluir a apresentação ativa em cada snapshot de mundo.
- Permitir apenas fontes `screen_share` no token LiveKit; câmera permanece bloqueada.
- Testar disputa, idempotência, limpeza de estado e parsing do protocolo.

## Etapa 3 — Controlador LiveKit

- Isolar estado local de apresentação: inativa, escolhendo fonte, publicando, ativa ou erro.
- Publicar uma única track de tela após reserva confirmada e encerrar a reserva se a captura falhar.
- Escutar término nativo da track e limpeza de conexão/reconexão.
- Separar permissões e assinaturas de microfone das permissões e assinaturas de vídeo.
- Desassinar imediatamente tracks de câmera e telas que não pertençam à política atual.
- Cobrir erros de captura, término externo, política inválida e desmontagem em testes.

## Etapa 4 — Interface e mapa

- Reaproveitar o seletor `E` para iniciar e encerrar a apresentação.
- Destacar discretamente a estação e o apresentador no Phaser sem renderizar vídeo no canvas.
- Mostrar um painel React responsivo para espectador, apresentador, carregamento e falha.
- Oferecer fechamento local da visualização sem interromper a transmissão do dono.
- Preservar teclado, mouse, `aria-live`, foco do leitor de tela e layout móvel sem overflow.

## Etapa 5 — Verificação e entrega

- Executar `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build` e `git diff --check`.
- Fazer QA com duas abas e LiveKit local: iniciar, negar permissão, assistir perto, afastar, terminar a captura e disputar a estação.
- Atualizar README com o comando de mídia local e o fluxo de uso.
- Criar commit compilável e enviar para `origin/main`.

## Ordem de trabalho

Etapas 1 e 2 primeiro, pois estabelecem a fonte de verdade. A etapa 3 só publica mídia quando o snapshot confirmar a reserva. A interface entra após a política de vídeo estar testada; assim ela nunca decide quem pode assistir.
