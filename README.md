# Inforgeneses Campus

Metaverso corporativo 2D para reduzir a fricção de conversas rápidas entre pessoas do time.

O projeto continua 100% local e sem custo:

- web app com React, Vite e Phaser 4;
- servidor multiplayer local com Node e WebSocket;
- mapa original em pixel art, avatar animado e câmera híbrida;
- estado em memória;
- áudio por proximidade com LiveKit self-hosted local;
- compartilhamento de tela por proximidade no Telão do Pátio;
- isolamento automático de conversas na Administração / Reitoria;
- Cortina de Foco autoritativa: bloqueia áudio, movimento de aproximação e sinaliza Deep Work;
- motor autoritativo de objetos interativos, usado pelas 12 estações do Desenvolvimento;
- sem banco externo;
- sem cloud;
- sem serviço pago.

## Requisitos

- Node.js 22.20.0 ou superior na linha 22 LTS;
- pnpm 11.2.2 ou superior.

## Como rodar

```powershell
pnpm install
Copy-Item .env.example .env
pnpm media:up
pnpm dev
```

Depois, abra:

```text
http://127.0.0.1:5173
```

Abra duas abas para simular dois funcionários no mesmo campus. Use `WASD` ou as setas para
andar. O botão **Visão geral** enquadra todo o mapa e `Esc` volta ao avatar.

Nas estações do Desenvolvimento, aproxime-se de uma cadeira e pressione `E` para sentar e entrar
em foco. Se houver mais de uma ação ao alcance, `E` abre o seletor contextual: use `W`/`S` ou as
setas, confirme com `E`/`Enter` e feche com `Esc`. O movimento pausa enquanto o seletor está
aberto. A mesa fica reservada até você pressionar `E` novamente ou desconectar.

Todos entram com o microfone desligado. O navegador só pede permissão depois que a pessoa clica
em **Ativar microfone**. Para testar duas sessões no mesmo computador, use fones de ouvido para
evitar retorno acústico.

No **Telão do Pátio**, aproxime-se e pressione `E` para escolher **Compartilhar tela**. Apenas uma
pessoa pode apresentar por vez; quem estiver no raio do telão recebe o vídeo. Afastar-se corta a
assinatura, e o botão **Fechar** também interrompe o recebimento até a pessoa escolher abrir a
apresentação novamente. O navegador sempre pede qual janela ou aba será transmitida. Câmera,
áudio da aba, gravação e múltiplas apresentações ficam fora deste corte.

Quando terminar:

```powershell
pnpm media:down
```

O Docker Desktop precisa estar iniciado para os comandos `media:up` e `media:down`. Se o LiveKit
não estiver rodando ou configurado, o mapa continua funcionando e mostra o áudio como
indisponível.

Este MVP é jogável em computador com teclado. A interface se adapta a telas pequenas, mas
controles por toque ficam para um corte futuro porque o uso principal do campus é durante o
trabalho em desktop.

## Scripts

```powershell
pnpm dev
pnpm media:up
pnpm media:down
pnpm test
pnpm typecheck
pnpm build
pnpm lint
pnpm assets:generate
pnpm format
```

`assets:generate` recria os PNGs originais deterministicamente usando apenas APIs nativas do
Node. Nenhum asset protegido, gerador pago ou chamada externa é necessário.

## Custo

O desenvolvimento local não exige pagamento. O primeiro custo real só aparece quando o campus
precisar ficar acessível pela internet com áudio WebRTC confiável para pessoas em estados
diferentes. Nesse momento, custo operacional zero só será possível se a Inforgeneses já oferecer
servidor público e banda; o software continuará gratuito.

## Mídia local

O servidor gera um token temporário ligado à sessão do avatar. A chave de assinatura fica apenas
no backend. O navegador conecta ao LiveKit com assinatura automática desativada e recebe somente
os microfones de avatares próximos. O volume é completo na faixa mais próxima, diminui
gradualmente e chega a zero fora do alcance. A mesma regra de acesso explícito vale para a tela:
o servidor informa quem pode assistir, e o cliente desassina o vídeo assim que a permissão some.

As zonas também definem a política acústica. Pátio, Desenvolvimento, Biblioteca e áreas comuns
são abertas. A Administração / Reitoria é privada: somente avatares dentro dela podem assinar os
microfones uns dos outros, ainda respeitando a distância. Atravessar a porta aplica a mudança
automaticamente e o painel sempre informa o ambiente atual.

Se a política recebida for inválida ou o navegador não conseguir protegê-la, o sistema desassina
o áudio remoto e desliga o microfone local. O mapa e o radar físico continuam funcionando.

As credenciais `devkey`/`secret` e `LIVEKIT_NODE_IP=127.0.0.1` existem apenas para desenvolvimento
na própria máquina. Para testar em outra máquina da rede, endereço do frontend, WebSocket e
LiveKit precisam usar o IP LAN do host; isso será documentado e automatizado em um corte próprio.

## Próximos cortes

Os próximos incrementos de mídia podem incluir qualidade adaptativa, indicação de carregamento e
controles de compartilhamento. Colyseus pode voltar se o protocolo multiplayer crescer o
suficiente para justificar o framework.
