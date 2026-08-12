# Plano de implementação — Zonas acústicas privadas

Spec de origem:
`docs/superpowers/specs/2026-08-12-private-acoustic-zones-design.md`

## Resultado esperado

Entregar uma fatia vertical em que a Administração / Reitoria isola automaticamente sua
conversa. Duas pessoas dentro dela continuam usando áudio por distância; uma terceira pessoa no
corredor, mesmo fisicamente próxima, não recebe nem oferece áudio à sala. Atravessar a porta
atualiza a política sem confirmação e sem reconectar o LiveKit.

## Limites preservados

- uma única sala LiveKit `campus`;
- `autoSubscribe: false`;
- somente microfone publicável;
- movimento, colisão, zona, proximidade e acústica autoritativos no servidor do mundo;
- Phaser sem dependência de mídia;
- nenhuma cloud, banco, Redis, novo asset ou serviço pago;
- nenhuma senha, convite, cargo, câmera, tela ou gravação neste corte.

## Etapa 1 — Contratos acústicos compartilhados

Arquivos:

- `packages/contracts/src/index.ts`
- `packages/game-core/src/campusMap.ts`
- `apps/server/src/protocol.test.ts`

Tarefas:

1. Mover `CampusZoneId` para `contracts`, preservando sua exportação pública pelo `game-core` para
   não quebrar consumidores existentes.
2. Definir `AcousticMode`, `AcousticEnvironmentSnapshot` e `AcousticSnapshot`.
3. Adicionar `acousticMode` obrigatório a `CampusZone`.
4. Marcar Pátio, Desenvolvimento e Biblioteca como `open`; marcar Reitoria como `private`.
5. Incluir `acoustic` em `WorldStateSnapshot`.
6. Criar fábricas de snapshot vazio para reduzir duplicação na conexão e na interface.
7. Atualizar testes de mapa e tipos sem alterar o protocolo enviado pelo cliente.

Gate: todos os mapas canônicos declaram uma política acústica e nenhum cliente pode enviar zona
ou permissão ao servidor.

## Etapa 2 — Geometria e política acústica puras

Arquivos:

- `packages/game-core/src/campusMap.ts`
- `packages/game-core/src/acoustics.ts` (novo)
- `packages/game-core/src/index.ts`
- `apps/server/src/protocol.test.ts`

Tarefas:

1. Implementar `getZoneAtPosition(position)` com bordas esquerda/superior inclusivas e
   direita/inferior exclusivas.
2. Estender `validateCampusMap` para rejeitar zonas sobrepostas, mantendo as validações atuais de
   identificador e limites.
3. Representar posições fora de uma zona como `Áreas comuns`, modo `open`.
4. Implementar `arePlayersAcousticallyCompatible(listener, candidate)`:
   - aberto com aberto: permitido;
   - mesma zona privada: permitido;
   - qualquer outra combinação: bloqueado.
5. Implementar `buildAcousticPolicy(listener, players)` retornando ambiente, identidades
   permitidas ordenadas e pares audíveis ordenados.
6. Reutilizar `getProximityPeer` para distância e banda; não duplicar os limites de proximidade.
7. Testar interior, exterior, quatro bordas, sobreposição, mesma sala, corredor, salas diferentes,
   fora do raio e ordenação determinística.

Gate: regras puras demonstram que proximidade física não atravessa uma fronteira privada.

## Etapa 3 — Snapshot autoritativo e revisão por sessão

Arquivos:

- `apps/server/src/campusServer.ts`
- `apps/server/src/campusServer.test.ts`

Tarefas:

1. Adicionar a cada sessão `acousticRevision` e a impressão digital da última política emitida.
2. Calcular a política personalizada no mesmo ciclo que já produz proximidade.
3. Incrementar a revisão somente quando ambiente, permissões ou pares audíveis mudarem; distância
   arredondada e banda fazem parte do estado audível.
4. Anexar a revisão ao snapshot antes de serializar.
5. Remover a identidade de uma sessão desconectada das permissões seguintes.
6. Preservar o radar físico sem filtragem acústica.
7. Testar três clientes: dois na Reitoria e um no corredor, incluindo entrada, saída e
   desconexão.

Gate: cada cliente recebe sua própria visão acústica, ordenada, revisada e derivada somente das
posições mantidas pelo servidor.

## Etapa 4 — Validação defensiva no cliente

Arquivos:

- `apps/web/src/lib/campusClient.ts`
- `apps/web/src/lib/campusClient.test.ts` (novo)
- `apps/web/package.json`

Tarefas:

1. Validar em runtime a forma do snapshot acústico recebido antes de entregá-lo à mídia.
2. Exigir revisão inteira não negativa, ambiente conhecido, identidades únicas e pares finitos.
3. Rejeitar `audiblePeers` que não sejam subconjunto de `allowedPeerSessionIds`.
4. Expor ao consumidor local `acoustic: null` quando apenas a parte acústica for inválida; manter
   jogadores e proximidade física utilizáveis.
5. Cobrir snapshots válidos, duplicados, revisões inválidas, distâncias não finitas e subconjunto
   inconsistente.

Gate: dados acústicos inválidos nunca abrem uma assinatura nem derrubam o mapa.

## Etapa 5 — Planejador de mídia acústica

Arquivos:

- `apps/web/src/media/acousticMediaPolicy.ts` (novo)
- `apps/web/src/media/acousticMediaPolicy.test.ts` (novo)
- `apps/web/src/media/proximityAudioPolicy.ts`

Tarefas:

1. Criar uma unidade independente de DOM e LiveKit que aceite o último snapshot aplicado e o
   próximo snapshot.
2. Ignorar revisões repetidas ou antigas da mesma sessão.
3. Produzir um plano explícito contendo:
   - identidades a remover imediatamente;
   - permissões finais da publicação local;
   - identidades próximas e seus ganhos;
   - impressão digital estável da lista permitida.
4. Aplicar atraso de 750 ms somente quando uma pessoa continua permitida, mas sai do raio.
5. Nunca atrasar remoção causada por troca de ambiente ou incompatibilidade acústica.
6. Testar entrada, saída, revisão antiga, mudança rápida e ausência de snapshot.

Gate: a ordem de segurança e a histerese ficam verificáveis sem navegador ou dispositivo de
áudio.

## Etapa 6 — Permissões e fail-closed no LiveKit

Arquivos:

- `apps/web/src/media/CampusMediaController.ts`
- `apps/web/src/media/mediaState.ts`
- `apps/web/src/media/mediaState.test.ts`
- `apps/web/src/components/useCampusMedia.ts`

Tarefas:

1. Substituir `syncProximity` por `syncAcoustics(snapshot | null)`, mantendo a curva de ganho
   existente; `null` aciona fail-closed sem avançar a última revisão válida, permitindo recuperação
   no snapshot válido seguinte.
2. Aplicar `LocalParticipant.setTrackSubscriptionPermissions(false, permissions)` com uma entrada
   `allowAll` por identidade autorizada.
3. Manter `allParticipantsAllowed` sempre falso, inclusive em áreas abertas; a lista autoritativa
   define explicitamente todos os pares abertos compatíveis.
4. Não reenviar permissões quando sua impressão digital não mudou, mesmo que a distância mude a
   20 Hz.
5. Em transição restritiva, limitar primeiro a faixa local e remover imediatamente tracks remotas
   incompatíveis.
6. Só depois assinar novos microfones compatíveis e aplicar seus ganhos.
7. Aplicar a política atual antes de publicar o microfone pela primeira vez.
8. Tratar exceções síncronas de `setTrackSubscriptionPermissions`; em falha, desassinar tudo,
   desligar o microfone e expor o estado `privacy-error`.
9. Limpar revisão, permissões, timers, elementos e impressão digital ao desconectar ou trocar de
   sessão.
10. Preservar consentimento, mute, autoplay e reconexão já existentes.

Gate: nenhuma mudança apenas de distância renegocia permissões; nenhuma mudança de zona conserva
uma faixa incompatível durante a tolerância.

## Etapa 7 — Integração React e interface de ambiente

Arquivos:

- `apps/web/src/components/CampusApp.tsx`
- `apps/web/src/components/useCampusMedia.ts`
- `apps/web/src/styles.css`

Tarefas:

1. Armazenar o snapshot acústico junto ao último estado da cena, sem encaminhá-lo ao Phaser.
2. Sincronizar o controlador em todo estado recebido, independentemente do throttle visual de
   250 ms.
3. Exibir no cartão de áudio o rótulo do ambiente e `área aberta` ou `conversa privada`.
4. Adicionar um sinal visual compacto de privacidade sem competir com o botão do microfone.
5. Anunciar em `aria-live` apenas mudanças posteriores à primeira renderização.
6. Mostrar `Privacidade do áudio indisponível` quando a mídia adotar fail-closed.
7. Restaurar snapshot acústico vazio ao sair, falhar ou reconectar.
8. Garantir leitura e layout corretos em desktop e viewport estreito.

Gate: atravessar a porta atualiza o contexto claramente, sem modal, confirmação ou interrupção do
movimento.

## Etapa 8 — Documentação e verificação final

Arquivos:

- `README.md`
- `docs/architecture/overview.md`
- `docs/architecture/zero-cost.md`
- testes existentes e novos

Tarefas:

1. Documentar modos acústicos e a Reitoria privada.
2. Registrar o limite de confiança do navegador publicador e a ausência de gravação.
3. Explicar que as permissões não acrescentam infraestrutura nem cobrança local.
4. Executar `pnpm test`, `pnpm typecheck`, `pnpm lint` e `pnpm build`.
5. Executar `docker compose config`, conferir o health do LiveKit e preservar a configuração
   local existente.
6. Fazer QA automatizado com três sessões para ambiente, radar, entrada, saída, reconexão, console
   e responsividade.
7. Fazer teste manual com três navegadores/perfis e fones para comprovar mídia real, pois o
   navegador de automação não possui microfone físico confiável.
8. Verificar que não há participantes, tracks, timers nem elementos de áudio fantasmas.

Gate final: duas pessoas na Reitoria conversam, uma pessoa no corredor não recebe nem fornece
áudio à sala e todas voltam automaticamente à política aberta ao sair. O repositório termina
limpo após o commit.

## Sequência prevista de commits

1. `feat: model private acoustic zones`
2. `feat: enforce acoustic media permissions`
3. `feat: show acoustic environment status`
4. `docs: document private acoustic zones`

Commits poderão ser combinados quando um intermediário não compilar sozinho. Nenhum commit final
dependerá de segredo real, conta externa ou serviço pago.
