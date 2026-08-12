# Arquitetura Inicial

```text
apps/web          React + Vite + Phaser
apps/server       Node + WebSocket
packages/contracts Tipos e mensagens compartilhadas
packages/game-core Regras puras de mapa, movimento, colisao e proximidade
```

O cliente envia perfil e entradas de movimento para o servidor. O servidor valida o protocolo,
aplica colisao e calcula a lista de colegas proximos de cada jogador no `game-core`. Cada cliente
recebe um snapshot personalizado com `serverTick`, jogadores e sua propria visao de proximidade.

O frontend renderiza o estado recebido no Phaser. O cliente nao decide posicao nem proximidade;
ele envia intencao de movimento e renova essa intencao por heartbeat. Se a renovacao parar, o
servidor expira a entrada e imobiliza o avatar.

O servidor esta separado em tres responsabilidades:

- `main.ts`: inicializacao e encerramento do processo;
- `campusServer.ts`: ciclo do mundo, sessoes e transporte WebSocket;
- `protocol.ts`: validacao de dados vindos da rede.

O Phaser representa a maior parte do bundle web atual (aproximadamente 423 KB comprimidos).
Isso e aceitavel para o piloto, mas deve ser medido em maquinas reais antes do audio. Se o tempo
de carregamento ou memoria se tornarem problema, a primeira opcao e carregar a engine sob
demanda; trocar a engine so sera considerado com evidencia de profiling.

Colyseus continua sendo uma boa opcao futura para salas, reconexao avancada e sincronizacao incremental. Neste primeiro corte ele foi adiado porque a instalacao local bloqueou uma subdependencia via Git e o protocolo necessario agora e pequeno.
