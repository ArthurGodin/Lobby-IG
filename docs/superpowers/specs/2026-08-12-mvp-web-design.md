# Inforgeneses Campus - MVP Web Design

Data: 2026-08-12

## Objetivo

Construir o primeiro corte funcional do Inforgeneses Campus como web app local, sem custo de infraestrutura, servicos pagos, cartao de credito ou dependencia externa em cloud.

O MVP inicial precisa provar a base tecnica do produto:

- mapa 2D top-down no navegador;
- avatares sincronizados em tempo real;
- movimento com teclado;
- colisao simples;
- servidor autoritativo local;
- estrutura preparada para audio espacial com LiveKit em etapa seguinte.

## Decisao de Plataforma

A versao principal sera Web App com possibilidade futura de PWA. Nao sera executavel desktop neste inicio.

Motivos:

- menor friccao para funcionarios acessarem;
- atualizacoes centralizadas;
- menor consumo de memoria que Electron;
- compatibilidade direta com WebRTC, microfone e compartilhamento de tela;
- desenvolvimento mais simples e barato.

Um executavel so entra depois como agente local opcional para recursos que o navegador nao cobre bem, como inatividade do sistema operacional, tray icon e scripts locais.

## Arquitetura Inicial

O projeto sera um monorepo `pnpm` com duas aplicacoes:

- `apps/web`: frontend React, Vite, TypeScript e Phaser;
- `apps/server`: backend Node, TypeScript e WebSocket.

Dois pacotes compartilhados mantem as regras centrais fora da UI e do servidor:

- `packages/contracts`: mensagens e tipos compartilhados;
- `packages/game-core`: mapa, colisao, movimento e constantes de simulacao.

O estado do mundo fica em memoria no servidor durante o MVP. Banco de dados sera adicionado apenas quando houver login, preferencias persistidas ou administracao.

## Fluxo de Dados

O navegador envia entradas de movimento para o servidor WebSocket. O servidor valida colisao e atualiza a posicao autoritativa dos jogadores. Os clientes recebem o estado sincronizado e renderizam os avatares no mapa.

No MVP visual, cada aba do navegador representa um usuario temporario. Isso permite testar a base multiplayer sem autentificacao.

## UI Inicial

A primeira tela sera operacional:

- area central com o mapa;
- barra superior com nome do campus e status de conexao;
- painel lateral compacto com identidade local, lista de pessoas e controles basicos.

Nao havera landing page. A primeira tela ja sera o produto.

## Custo

Durante este corte, tudo roda localmente:

- frontend em Vite;
- backend em Node;
- estado em memoria;
- sem banco externo;
- sem deploy pago;
- sem servico de terceiros obrigatorio.

Quando o audio espacial remoto entrar, LiveKit sera usado localmente primeiro. Para teste real entre estados, sera necessario um servidor com IP publico ou infraestrutura ja existente da empresa.

## Fora do Escopo Agora

- audio espacial real;
- compartilhamento de tela;
- salas privadas de audio;
- agente local/desktop;
- integracoes com Sentry, GitHub, n8n ou pizzaria;
- autenticacao corporativa;
- banco de dados;
- deploy publico.

## Validacao

O corte inicial esta aceito quando:

- `pnpm install` conclui;
- `pnpm dev` sobe web e server;
- duas abas do navegador conectam no mesmo mapa;
- cada aba mostra um avatar proprio;
- movimento sincroniza entre abas;
- paredes/obstaculos simples bloqueiam passagem;
- `pnpm typecheck` passa;
- `pnpm build` passa.

## Corte 2 Aprovado: Proximidade Visual

Antes de integrar microfone e WebRTC, o campus tera uma simulacao visual da mesma regra
que controlara o audio espacial.

- o servidor sera a fonte de verdade da proximidade entre jogadores;
- o alcance audivel inicial sera de 6 tiles (192 pixels no mapa);
- ate 3 tiles, a pessoa estara na faixa `perto`; entre 3 e 6 tiles, na faixa
  `alcance`; depois disso, `fora`;
- cada cliente recebera apenas a sua propria lista de colegas no alcance;
- o mapa desenhara dois circulos discretos ao redor do jogador local e destacara colegas
  que estejam dentro deles;
- o painel lateral mostrara as mesmas faixas em texto, sem afirmar que existe audio real;
- nenhum microfone sera capturado neste corte.
- o MVP sera jogavel com teclado em desktop; controles por toque nao fazem parte deste corte.

A regra de distancia ficara em `packages/game-core`, separada do Phaser e do servidor, para
ser reutilizada pelo ganho de audio quando o LiveKit entrar. O protocolo enviara um tick
monotonico e um snapshot personalizado de proximidade. O calculo sera O(n²), adequado ao
piloto pequeno; otimizacao espacial so sera adicionada quando uma medicao justificar.

### Robustez incluida neste corte

Como proximidade depende de movimento confiavel, o mesmo corte tambem inclui:

- validacao estrita de mensagens WebSocket e cores permitidas;
- limite pequeno de payload e tratamento de erro dos sockets;
- heartbeat de movimento e timeout para impedir avatar andando sozinho;
- escolha de spawn livre;
- edicao de nome sem capturar WASD dentro do campo;
- testes automatizados das regras puras e do protocolo.

### Validacao do corte 2

- duas abas exibem estados de proximidade coerentes e personalizados;
- atravessar os limites de 3 e 6 tiles muda o destaque visual e o texto;
- nenhuma interface sugere que o microfone real ja esta funcionando;
- entradas malformadas nao alteram o mundo nem derrubam o servidor;
- movimento expira quando o cliente para de renovar a entrada;
- `pnpm test`, `pnpm typecheck`, `pnpm lint` e `pnpm build` passam;
- o fluxo principal e revisado em viewport desktop e mobile.
