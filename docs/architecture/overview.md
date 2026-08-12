# Arquitetura Inicial

```text
apps/web          React + Vite + Phaser
apps/server       Node + WebSocket
packages/contracts Tipos e mensagens compartilhadas
packages/game-core Regras puras de mapa, movimento e colisao
```

O cliente envia entradas de movimento para o servidor. O servidor aplica as regras de colisao do `game-core` e sincroniza o estado dos jogadores por WebSocket.

O frontend renderiza o estado recebido no Phaser. O cliente nao decide a posicao final dos jogadores neste corte; ele apenas envia intencao de movimento.

Colyseus continua sendo uma boa opcao futura para salas, reconexao avancada e sincronizacao incremental. Neste primeiro corte ele foi adiado porque a instalacao local bloqueou uma subdependencia via Git e o protocolo necessario agora e pequeno.
