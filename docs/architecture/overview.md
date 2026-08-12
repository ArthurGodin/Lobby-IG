# Arquitetura inicial

```text
apps/web          React + Vite + Phaser
apps/server       Node + WebSocket
packages/contracts Tipos e mensagens compartilhadas
packages/game-core Regras puras de mapa, movimento, colisão e proximidade
```

O cliente envia perfil e entradas de movimento para o servidor. O servidor valida o protocolo,
aplica colisão e calcula a lista de colegas próximos de cada jogador no `game-core`. Cada cliente
recebe um snapshot personalizado com `serverTick`, jogadores e sua própria visão de proximidade.

O frontend renderiza o estado recebido no Phaser. O cliente não decide posição nem proximidade;
ele envia intenção de movimento e renova essa intenção por heartbeat. Se a renovação parar, o
servidor expira a entrada e imobiliza o avatar.

## Mundo pixel art

`packages/game-core` também é a fonte canônica do campus de 48×34 tiles: camadas, zonas,
spawns e obstáculos nascem da mesma definição. A simulação usa tiles de 32 unidades, enquanto a
arte usa tiles originais de 16 px ampliados em 2×. Assim, renderização, colisão e rede não
duplicam geometria.

O Phaser carrega três PNGs locais e determinísticos: tiles, avatar-base e máscara de roupa. A
máscara recebe a cor normalizada pelo servidor. O avatar visual interpola snapshots; seus pés
continuam sendo o ponto autoritativo. A câmera segue o avatar por padrão e a visão geral é estado
exclusivamente local, controlado pela casca React.

O servidor esta separado em tres responsabilidades:

- `main.ts`: inicialização e encerramento do processo;
- `campusServer.ts`: ciclo do mundo, sessões e transporte WebSocket;
- `protocol.ts`: validação de dados vindos da rede.

O Phaser representa a maior parte do bundle web atual (aproximadamente 427 KB comprimidos).
Isso é aceitável para o piloto, mas deve ser medido em máquinas reais antes do áudio. Se o tempo
de carregamento ou memória se tornarem problema, a primeira opção é carregar a engine sob
demanda; trocar a engine só será considerado com evidência de profiling.

Colyseus continua sendo uma boa opção futura para salas, reconexão avançada e sincronização
incremental. Neste primeiro corte ele foi adiado porque a instalação local bloqueou uma
subdependência via Git e o protocolo necessário agora é pequeno.
