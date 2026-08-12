# Inforgeneses Campus — Áudio local por proximidade

Data: 2026-08-12

## Objetivo

Entregar a primeira conversa real dentro do campus: duas pessoas ativam voluntariamente seus
microfones, aproximam os avatares e ouvem o volume aumentar; ao se afastarem, o volume diminui e
a faixa remota deixa de ser recebida.

Este corte roda localmente, usa somente software gratuito e não depende de nuvem. Ele prova o
valor central do produto antes de adicionarmos salas privadas, compartilhamento de tela ou
infraestrutura remota.

## Decisões aprovadas

- LiveKit Server será o SFU de mídia; não construiremos WebRTC nem sinalização próprios.
- O servidor LiveKit rodará localmente em contêiner com configuração exclusiva de
  desenvolvimento.
- O WebSocket atual continuará autoritativo para movimento e proximidade.
- Todos entram com o microfone desligado.
- O navegador só solicita permissão e publica áudio depois de um clique explícito em “Ativar
  microfone”.
- Receber áudio não exige conceder acesso ao microfone.
- Não haverá gravação nem armazenamento de áudio.
- Falha da mídia não impedirá o uso do mapa.

## Escopo

Entram neste corte:

- conexão de cada sessão do campus a uma sala LiveKit local;
- identidade LiveKit igual ao `sessionId` autoritativo do jogador;
- publicação somente da fonte de microfone;
- controles de ativar, mutar e desmutar;
- estados legíveis de permissão e conexão;
- assinatura seletiva de faixas remotas pela proximidade recebida do servidor;
- ganho de áudio gradual conforme a distância;
- liberação de autoplay por gesto quando exigida pelo navegador;
- reconexão de mídia independente da conexão do mundo;
- documentação e comandos de desenvolvimento local.

Ficam fora:

- isolamento acústico de zonas e salas privadas;
- pan estéreo esquerda/direita;
- compartilhamento de tela, câmera e gravação;
- indicador de quem está falando;
- supressão de ruído adicional à oferecida pelo navegador;
- implantação pública, TURN externo e garantia de funcionamento entre estados.

## Arquitetura

O navegador manterá duas conexões independentes:

1. WebSocket com `apps/server`, responsável pelo mundo autoritativo;
2. WebRTC com LiveKit, responsável exclusivamente pela mídia.

O servidor Node gerará um token LiveKit assinado para cada nova sessão. A chave da API LiveKit
ficará somente no processo do servidor. O token concederá acesso apenas à sala do campus e
permitirá publicar somente microfone; câmera e compartilhamento de tela permanecerão proibidos.
No ambiente local, o token terá validade máxima de 12 horas para cobrir uma jornada de trabalho;
uma nova conexão ao campus receberá um token novo.

A mensagem de boas-vindas passará a incluir um objeto de acesso à mídia com URL pública local,
token temporário e identidade. Nenhum segredo usado para assinar tokens será enviado ao
navegador.

O cliente LiveKit entrará com assinatura automática desativada. A presença de uma faixa remota
não será suficiente para ouvi-la: a política de proximidade decidirá quando assinar e qual ganho
aplicar.

## Componentes e responsabilidades

### `apps/server`

- carregar e validar as variáveis LiveKit;
- gerar a concessão da sala para o `sessionId` atual;
- incluir acesso à mídia no handshake;
- continuar funcionando quando LiveKit não estiver configurado, anunciando mídia indisponível;
- nunca receber, retransmitir ou armazenar áudio.

### `packages/contracts`

- contrato serializável de disponibilidade e acesso à mídia;
- extensão compatível da mensagem `welcome`;
- estados de mídia que precisarem atravessar limites entre módulos;
- ausência completa de chaves privadas.

### `apps/web/src/media`

- adaptador isolado sobre `livekit-client`;
- ciclo de conectar, reconectar e desconectar a sala;
- publicação e mute do microfone;
- vínculo entre identidade LiveKit e `PlayerSnapshot.sessionId`;
- assinatura, volume e descarte de tracks remotas;
- função pura de ganho por distância.

### React

- controle do microfone e estado acessível;
- mensagem separada para desbloquear reprodução quando o autoplay for impedido;
- erro de permissão ou mídia sem bloquear o mapa;
- limpeza do controlador de mídia ao sair ou reconectar ao campus.

O Phaser não conhecerá LiveKit, microfones ou elementos de áudio.

## Ciclo da sessão

1. O navegador conecta ao WebSocket e envia o perfil.
2. O servidor cria o jogador e responde com `sessionId` e acesso opcional à mídia.
3. O navegador conecta ao LiveKit em modo de recepção, sem solicitar microfone.
4. Tracks remotas começam desassinadas.
5. O snapshot autoritativo informa os pares dentro do raio e suas distâncias.
6. O controlador assina apenas os participantes próximos e atualiza seus ganhos.
7. Ao clicar em “Ativar microfone”, o navegador solicita permissão e publica a track local.
8. Mutar desabilita a track publicada sem desconectar a sala.
9. Sair do campus desconecta também a sessão LiveKit e remove todos os elementos de áudio.

Se a conexão de mídia cair, o mapa continua ativo. O controlador tenta a reconexão suportada pelo
SDK e reflete o estado na interface. Uma nova conexão do mundo sempre substitui e encerra a mídia
da sessão anterior.

## Política de proximidade

Os limites existentes continuam canônicos:

- até `CLOSE_PROXIMITY_RADIUS`, atualmente 96 unidades, o áudio usa ganho completo;
- entre 96 e `PROXIMITY_RADIUS`, atualmente 192 unidades, o ganho cai suavemente até zero;
- fora de 192 unidades, a faixa é silenciada e desassinada após uma tolerância curta.

A função `calculateProximityGain(distance)` será pura, limitada entre zero e um e testada nos
limites. O controlador suavizará mudanças rápidas de ganho para impedir estalos.

Quando um participante desaparecer da lista de proximidade, seu áudio terá fade curto e a
assinatura será mantida por 750 ms antes do descarte. Se ele retornar nesse intervalo, o descarte
será cancelado. Essa tolerância temporal evita alternância excessiva na borda sem transferir a
autoridade de distância para o cliente.

## Estados da interface

O controle principal poderá mostrar:

- `indisponível`: servidor local de mídia não configurado;
- `conectando`: entrada na sala LiveKit em andamento;
- `microfone desligado`: conectado e sem captura;
- `solicitando permissão`: chamada ao navegador em andamento;
- `ativo`: track publicada e não mutada;
- `mutado`: track publicada, porém desabilitada;
- `permissão bloqueada`: acesso recusado pelo navegador;
- `erro de áudio`: mídia falhou, mapa continua disponível.

O botão terá rótulo textual, `aria-pressed` quando aplicável e atualização em região `aria-live`.
Se o navegador bloquear reprodução automática, um controle “Ativar som” aparecerá sem confundir
saída de áudio com permissão de microfone.

## Desenvolvimento local sem custo

Um `compose.yaml` versionado iniciará somente o LiveKit Server com portas locais e credenciais de
desenvolvimento configuráveis pelo `.env`. As versões das imagens e dependências serão fixadas no
plano de implementação.

Os scripts do repositório separarão as ações:

- subir a mídia local;
- iniciar web e servidor da aplicação;
- encerrar a mídia local.

O README explicará que duas abas no mesmo computador podem causar retorno acústico e recomendará
fones de ouvido. Testes entre duas máquinas na rede local poderão exigir liberar portas no
firewall, mas não exigirão serviço pago.

## Falhas e segurança

- Configuração LiveKit ausente não impedirá o servidor do campus de iniciar.
- Token inválido ou LiveKit desligado produzirá estado de mídia indisponível ou com erro.
- Negar permissão não disparará novas solicitações automáticas.
- A aplicação nunca representará o microfone como ativo antes da confirmação do SDK.
- O servidor não registrará tokens completos nem chaves em logs.
- Apenas `sessionId` válido da conexão atual poderá receber credenciais de mídia.
- A concessão não permitirá publicar câmera ou compartilhamento de tela.
- Nenhum dado de áudio passará pelo WebSocket de movimento.

As credenciais e portas locais deste corte não constituem configuração segura de produção. Um
piloto remoto exigirá TLS, domínio, política de firewall e revisão da infraestrutura disponível.

## Testes

Testes automatizados cobrirão:

- ganho em zero, nos dois limites e fora do alcance;
- suavização e tolerância de descarte;
- parse do handshake com mídia disponível e indisponível;
- emissão de token sem vazamento do segredo;
- concessão restrita a microfone e à sala correta;
- transições do estado do controle;
- limpeza idempotente após saída ou reconexão;
- LiveKit indisponível sem regressão no servidor do mundo.

QA no navegador cobrirá:

- entrada sem solicitação de microfone;
- ativação voluntária e negação de permissão;
- duas sessões próximas com áudio audível;
- redução de volume ao afastar os avatares;
- silêncio e descarte fora do raio;
- mute e unmute;
- reconexão sem tracks ou elementos de áudio fantasmas;
- uso normal do mapa com LiveKit desligado;
- ausência de exceções no console.

Também deverão passar `pnpm test`, `pnpm typecheck`, `pnpm lint` e `pnpm build`.

## Critério de aceite

Com LiveKit local em execução, duas pessoas entram no campus com microfones desligados, ativam a
captura por escolha própria, conversam quando seus avatares estão próximos e percebem o volume
diminuir até o silêncio ao se afastarem. Com LiveKit desligado ou permissão negada, o campus
continua jogável e explica corretamente o estado da mídia.

Nenhum serviço pago, asset protegido ou infraestrutura pública será introduzido neste corte.
