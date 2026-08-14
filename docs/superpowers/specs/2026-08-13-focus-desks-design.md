# Mesas de foco interativas

## Objetivo

Transformar a Cortina de Foco em uma interação do mundo: a pessoa se aproxima de uma mesa
habilitada, pressiona `E` ou usa o botão acessível, ocupa a estação e entra em Deep Work. O
servidor continua sendo a fonte de verdade para posição, ocupação, áudio e barreira.

## Experiência aprovada

- Uma mesa livre próxima exibe `E · Sentar e focar` sobre o mapa e no painel.
- `E` e o botão executam a mesma ação.
- Ao entrar em foco, o servidor reserva a mesa, posiciona o avatar no assento, orienta-o para o
  computador, interrompe o movimento e ativa a proteção acústica e física existente.
- O microfone local é mutado imediatamente.
- A mesa mostra visualmente que está ocupada e os demais jogadores veem `em foco · áudio
  fechado`.
- `E` ou `Sair do foco` libera a mesa e coloca o avatar em um ponto caminhável ao lado dela.
- Desconexão também libera a mesa. Cada pessoa e cada mesa podem participar de apenas uma
  ocupação por vez.

Nesta primeira versão, todas as estações de desenvolvimento marcadas no mapa serão mesas de
foco. Mesas pessoais, reservas persistentes e horários ficam para depois de autenticação e banco.

## Modelo do mapa

O `game-core` passa a expor definições de mesa independentes do desenho do tile:

- `id` estável;
- `label` legível;
- `seatPosition`, que pode coincidir com o tile visual da cadeira;
- `exitPosition`, obrigatoriamente caminhável;
- direção do avatar enquanto ocupado;
- raio de interação.

Essa separação permite que o futuro editor administrativo mova e configure mesas sem alterar o
motor. A validação do mapa rejeitará IDs repetidos, âncoras fora do mapa e pontos de saída
bloqueados.

## Protocolo e autoridade

`PlayerSnapshot` incluirá `focusDeskId: string | null`, além de `focusMode` durante a migração.
O comando atual de foco continuará existindo, porém `enabled: true` só será aceito se houver uma
mesa livre dentro do raio; o cliente nunca poderá escolher uma posição ou forçar uma reserva.

O servidor processa comandos sequencialmente:

1. encontra a mesa elegível mais próxima;
2. verifica distância e ocupação no estado atual;
3. reserva a mesa e ancora o jogador, ou devolve uma razão segura;
4. publica o novo snapshot para todos.

O resultado da interação informa `activated`, `released`, `too_far` ou `occupied`. O cliente usa
isso apenas para feedback; a verdade continua sendo o snapshot seguinte.

## Cliente e apresentação

O Phaser calcula somente a apresentação da mesa elegível a partir do snapshot e das definições
canônicas. Ele desenha um destaque discreto na estação próxima, o prompt de `E` e o marcador de
ocupação. O React mantém o botão acessível, exibe o resultado da tentativa e anuncia mudanças por
`aria-live`.

O comando `E` ignora campos de texto, repetição automática da tecla e sessões desconectadas. O
botão fica indisponível quando não há mesa próxima, exceto durante o foco, quando sempre permite
sair.

Não será criada animação de sentar nesta entrega porque o spritesheet atual não possui esse frame.
O avatar ficará ancorado e voltado para a mesa; a animação dedicada entrará junto do editor de
avatar.

## Falhas e segurança

- Duas tentativas simultâneas: vence a primeira processada pelo servidor; a segunda recebe
  `occupied`.
- Mesa deixa de existir numa futura troca de mapa: o servidor encerra o foco e move a pessoa para
  um ponto caminhável.
- Mensagem inválida: é rejeitada sem alterar estado.
- Falha de áudio: a ocupação visual permanece, mas a política acústica continua fechada por
  segurança.
- Queda da conexão: a sessão é removida e a reserva desaparece no mesmo ciclo de broadcast.

## Testes e critérios de aceite

- testes puros validam mesas, proximidade e escolha determinística da mais próxima;
- testes de servidor cobrem ativação válida, distância excessiva, disputa, imobilidade, liberação e
  desconexão;
- testes do cliente cobrem o parsing dos resultados e a habilitação do comando;
- QA com duas abas confirma prompt, tecla e botão, sincronização, barreira, áudio fechado e
  liberação;
- `test`, `typecheck`, `lint`, `build` e `git diff --check` devem passar.

## Fora do escopo

- login, cargos e mesa permanentemente atribuída;
- persistência em banco ou reserva por horário;
- arrastar mesas e editar o mapa;
- animação exclusiva de sentar;
- controle por toque.
