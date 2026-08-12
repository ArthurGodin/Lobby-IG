# Inforgeneses Campus

Metaverso corporativo 2D para reduzir a fricção de conversas rápidas entre pessoas do time.

Este primeiro corte é 100% local e sem custo:

- web app com React, Vite e Phaser 4;
- servidor multiplayer local com Node e WebSocket;
- mapa original em pixel art, avatar animado e câmera híbrida;
- estado em memória;
- sem banco externo;
- sem cloud;
- sem serviço pago.

## Requisitos

- Node.js 22.20.0 ou superior na linha 22 LTS;
- pnpm 11.2.2 ou superior.

## Como rodar

```powershell
pnpm install
pnpm dev
```

Depois, abra:

```text
http://127.0.0.1:5173
```

Abra duas abas para simular dois funcionários no mesmo campus. Use `WASD` ou as setas para
andar. O botão **Visão geral** enquadra todo o mapa e `Esc` volta ao avatar.

Este MVP é jogável em computador com teclado. A interface se adapta a telas pequenas, mas
controles por toque ficam para um corte futuro porque o uso principal do campus é durante o
trabalho em desktop.

## Scripts

```powershell
pnpm dev
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

## Proximo corte

O mapa já calcula e exibe proximidade sem capturar microfone. O próximo corte técnico é conectar
LiveKit local e usar essa mesma regra para controlar áudio espacial. Colyseus pode voltar depois
se o protocolo multiplayer ficar grande o suficiente para justificar o framework.
