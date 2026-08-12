# Estrategia de Custo Zero

## Agora

Tudo roda localmente na maquina de desenvolvimento:

- Node para o servidor;
- Vite para o frontend;
- WebSocket para sincronizacao em tempo real;
- memoria do processo para estado temporario.
- LiveKit Server em contêiner local para áudio WebRTC.

Nao usamos banco externo, hospedagem, fila, armazenamento em nuvem ou servico pago.

Zonas privadas reutilizam a mesma sala LiveKit local e as permissões de assinatura já oferecidas
pelo servidor. Elas não adicionam contêiner, banco, conta ou cobrança.

O custo financeiro local continua zero, mas o LiveKit usa CPU, memória e rede da máquina. Docker
Desktop precisa estar em execução. As credenciais de desenvolvimento não devem ser reutilizadas
em ambiente público.

## Depois

Para testar com pessoas fora da rede local, o projeto vai precisar de uma URL acessivel publicamente. Isso pode continuar sem custo se a empresa ja tiver:

- servidor Linux ligado;
- IP publico;
- subdominio;
- permissao para abrir portas;
- banda suficiente.

Sem isso, WebRTC remoto confiavel nao tem custo operacional literalmente zero.
