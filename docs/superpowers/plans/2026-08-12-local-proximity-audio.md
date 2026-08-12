# Plano de implementação — Áudio local por proximidade

Spec de origem:
`docs/superpowers/specs/2026-08-12-local-proximity-audio-design.md`

## Resultado esperado

Entregar uma fatia vertical em que duas sessões conectam ao LiveKit local, entram com microfone
desligado, publicam áudio somente após consentimento e recebem apenas os microfones de avatares
próximos, com ganho reduzido pela distância. Falhas de mídia não podem interromper o mapa.

## Versões e limites

- `livekit-client@2.21.0` no navegador;
- `livekit-server-sdk@2.17.0` no servidor;
- `livekit/livekit-server:v1.13.1` no ambiente local;
- uma sala de mídia chamada `campus`;
- somente fonte de microfone permitida;
- `autoSubscribe: false`;
- token de entrada válido por 12 horas;
- nenhuma cloud, gravação, câmera ou compartilhamento de tela.

## Etapa 1 — Infraestrutura local e dependências

Arquivos:

- `compose.yaml` (novo)
- `.env.example`
- `package.json`
- `apps/server/package.json`
- `apps/web/package.json`
- `pnpm-lock.yaml`

Tarefas:

1. Adicionar as dependências LiveKit nas aplicações corretas.
2. Criar o serviço LiveKit fixado em `v1.13.1`, com sinalização e portas WebRTC locais.
3. Definir `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` e `LIVEKIT_ROOM` no exemplo de
   ambiente.
4. Adicionar scripts explícitos `media:up` e `media:down`; não esconder a inicialização do
   contêiner dentro de `pnpm dev`.
5. Validar o Compose e o health endpoint do LiveKit antes de integrar o cliente.

Gate: o LiveKit local sobe e responde sem alterar o funcionamento atual de `pnpm dev`.

## Etapa 2 — Contrato e emissão de token

Arquivos:

- `packages/contracts/src/index.ts`
- `apps/server/src/mediaAccess.ts` (novo)
- `apps/server/src/main.ts`
- `apps/server/src/campusServer.ts`
- `apps/server/src/campusServer.test.ts`
- `apps/server/src/mediaAccess.test.ts` (novo)

Tarefas:

1. Definir a união `MediaAccessSnapshot` com estados disponível e indisponível.
2. Incluir `media` na mensagem `welcome`, sem colocar credenciais nos snapshots de 20 Hz.
3. Criar uma interface `MediaAccessProvider` injetável no servidor para manter testes isolados.
4. Gerar JWT com identidade igual ao `sessionId`, sala `campus`, assinatura e publicação de
   microfone permitidas, câmera/tela/dados proibidos.
5. Carregar configuração local sem tornar `.env` obrigatório para o mapa iniciar.
6. Não registrar token ou segredo em logs.
7. Testar mídia configurada, indisponível, concessões e segredo ausente da resposta serializada.

Gate: uma conexão recebe exatamente um acesso de mídia ligado ao próprio `sessionId`; servidor
sem configuração continua aceitando jogadores.

## Etapa 3 — Política pura de distância

Arquivos:

- `apps/web/src/media/proximityAudioPolicy.ts` (novo)
- `apps/web/src/media/proximityAudioPolicy.test.ts` (novo)
- `apps/web/package.json`

Tarefas:

1. Implementar `calculateProximityGain(distance)` usando os limites do `game-core`.
2. Retornar ganho 1 até 96 unidades, curva suave até zero em 192 e zero fora do raio.
3. Definir fade e tolerância de descarte de 750 ms como constantes nomeadas.
4. Manter essa unidade sem dependência de DOM ou LiveKit.
5. Adicionar um script de teste web com Node test + `tsx`.
6. Cobrir números negativos, limites, ponto intermediário, `NaN`, infinito e fora do alcance.

Gate: a política é determinística, limitada a `[0, 1]` e totalmente testada.

## Etapa 4 — Controlador LiveKit isolado

Arquivos:

- `apps/web/src/media/CampusMediaController.ts` (novo)
- `apps/web/src/media/mediaState.ts` (novo)
- `apps/web/src/media/CampusMediaController.test.ts` (novo, usando adaptador falso)

Tarefas:

1. Encapsular `Room` e eventos LiveKit fora do React e do Phaser.
2. Conectar com `autoSubscribe: false`, sem criar track local.
3. Relacionar `RemoteParticipant.identity` ao `sessionId` do mundo.
4. Assinar somente publicações de microfone desejadas pela proximidade.
5. Anexar a track assinada, aplicar `setVolume` e remover elementos no unsubscribe.
6. Fazer fade antes de desassinar e cancelar o descarte se o avatar retornar em até 750 ms.
7. Expor `enableMicrophone`, `toggleMute`, `startAudio`, `syncProximity` e `disconnect`.
8. Traduzir eventos de permissão, autoplay, reconexão e falha para um estado pequeno da UI.
9. Garantir limpeza idempotente de listeners, timers, tracks e elementos de áudio.

Gate: testes com adaptador falso provam transições e limpeza sem precisar de dispositivo físico.

## Etapa 5 — Integração com a conexão do campus

Arquivos:

- `apps/web/src/lib/campusClient.ts`
- `apps/web/src/components/useCampusMedia.ts` (novo)
- `apps/web/src/components/CampusApp.tsx`

Tarefas:

1. Expor `MediaAccessSnapshot` na conexão resolvida por `joinCampus`.
2. Criar um hook responsável pelo ciclo do controlador.
3. Conectar mídia após o handshake sem solicitar microfone.
4. Encaminhar cada `ProximitySnapshot` ao controlador.
5. Desconectar mídia antes de substituir ou encerrar a conexão do mundo.
6. Manter mídia indisponível como estado não fatal.
7. Evitar que HMR ou React criem duas salas para a mesma sessão.

Gate: recarregar, reconectar e desmontar não deixam participantes ou áudio fantasmas.

## Etapa 6 — Controles e acessibilidade

Arquivos:

- `apps/web/src/components/CampusApp.tsx`
- `apps/web/src/styles.css`

Tarefas:

1. Substituir o botão desabilitado por controle com estados reais.
2. Exibir rótulos claros para desligado, solicitando, ativo, mutado, bloqueado e erro.
3. Solicitar microfone somente dentro do clique do usuário.
4. Exibir “Ativar som” somente quando `Room.canPlaybackAudio` exigir gesto.
5. Adicionar `aria-pressed`, região `aria-live`, foco visível e estado ocupado.
6. Manter a interface legível em viewport estreito sem prometer controle touch do avatar.
7. Explicar que falha do áudio não desconecta o campus.

Gate: o estado apresentado corresponde ao SDK e nenhum carregamento inicial abre o microfone.

## Etapa 7 — Documentação e verificação final

Arquivos:

- `README.md`
- `docs/architecture/overview.md`
- `docs/architecture/zero-cost.md`
- testes existentes e novos

Tarefas:

1. Documentar cópia do `.env`, `pnpm media:up`, `pnpm dev` e `pnpm media:down`.
2. Recomendar fones ao testar duas sessões no mesmo ambiente.
3. Explicar o limite local e os requisitos ainda não atendidos para produção remota.
4. Executar `pnpm test`, `pnpm typecheck`, `pnpm lint` e `pnpm build`.
5. Executar `docker compose config` e validar o health endpoint.
6. Testar navegador com LiveKit ligado e desligado.
7. Confirmar duas sessões, consentimento, mute, volume, saída do raio e reconexão.
8. Inspecionar console, participantes fantasmas e elementos de áudio órfãos.

Gate final: o critério de aceite da spec passa e o repositório termina limpo após o commit.

## Sequência prevista de commits

1. `feat: add local LiveKit media access`
2. `feat: add proximity audio controller`
3. `feat: add accessible microphone controls`
4. `docs: document local proximity audio`

Commits podem ser combinados quando um intermediário não compilar sozinho, mas nenhum commit
final deverá depender de segredo real, serviço pago ou infraestrutura pública.
