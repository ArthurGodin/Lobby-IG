# Inforgeneses Campus

Metaverso corporativo 2D para reduzir a friccao de conversas rapidas entre pessoas do time.

Este primeiro corte e 100% local e sem custo:

- web app com React, Vite e Phaser;
- servidor multiplayer local com Node e WebSocket;
- estado em memoria;
- sem banco externo;
- sem cloud;
- sem servico pago.

## Requisitos

- Node.js 22.20.0 ou superior na linha 22 LTS;
- pnpm 11.2.2 ou superior.

## Como rodar

```powershell
pnpm install
pnpm dev
```

Depois abra:

```text
http://localhost:5173
```

Abra duas abas para simular dois funcionarios no mesmo campus.

Este MVP e jogavel em computador com teclado. A interface se adapta a telas pequenas, mas
controles por toque ficam para um corte futuro porque o uso principal do campus e durante o
trabalho em desktop.

## Scripts

```powershell
pnpm dev
pnpm test
pnpm typecheck
pnpm build
pnpm lint
pnpm format
```

## Custo

O desenvolvimento local nao exige pagamento. O primeiro custo real so aparece quando o campus precisar ficar acessivel pela internet com audio WebRTC confiavel para pessoas em estados diferentes. Nesse momento, a melhor opcao de custo zero e usar infraestrutura publica ja existente da Inforgeneses.

## Proximo corte

O mapa ja calcula e exibe proximidade sem capturar microfone. O proximo corte tecnico e
conectar LiveKit local e usar essa mesma regra para controlar audio espacial. Colyseus pode
voltar depois se o protocolo multiplayer ficar grande o suficiente para justificar o framework.
