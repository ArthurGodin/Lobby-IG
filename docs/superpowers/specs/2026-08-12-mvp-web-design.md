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
