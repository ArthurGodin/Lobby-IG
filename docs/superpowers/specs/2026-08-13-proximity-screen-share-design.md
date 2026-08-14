# Compartilhamento de tela por proximidade

Data: 2026-08-13

## Objetivo

Permitir uma conversa de trabalho natural: uma pessoa chega a uma estação de apresentação, inicia o compartilhamento de sua tela e colegas que se aproximam podem assistir. A mecânica usa o motor de objetos interativos e a mesma noção de proximidade já aplicada ao áudio, sem abrir links de reunião ou exigir infraestrutura além do LiveKit já escolhido.

Esta é a primeira entrega de vídeo do Campus. Ela prioriza privacidade, baixo consumo de rede e um fluxo inequívoco, não uma videoconferência completa.

## Decisão de experiência

Cada estação possui no máximo um apresentador ativo. A pessoa que está dentro do alcance da estação vê a ação `Compartilhar tela`; ao confirmá-la, o navegador pede permissão nativa de captura. A transmissão só começa depois de a permissão ser concedida.

Pessoas próximas da estação passam a ver uma prévia com o nome do apresentador e podem assistir. Elas não podem tomar a apresentação, trocar a fonte nem iniciar uma segunda transmissão. O dono vê `Encerrar compartilhamento` e pode encerrar a qualquer momento; encerrar a captura no seletor do navegador tem o mesmo efeito.

O primeiro compartilhamento será restrito a uma estação demonstrativa em área aberta. Não haverá câmera, gravação, múltiplas telas simultâneas, takeover, chat, controle remoto ou compartilhamento em segundo plano.

## Alternativas consideradas

1. **Uma estação, um apresentador e espectadores próximos — escolhida.** É fácil de entender, reduz banda, evita disputa de controle e respeita o objetivo de colaboração presencial.
2. Qualquer pessoa próxima assumir a transmissão. Isso exigiria regra de fila/consentimento e criaria a possibilidade de interromper uma apresentação no meio de uma revisão.
3. Uma tela pública global. É útil para avisos e eventos, mas não representa proximidade e pode desperdiçar vídeo em máquinas que não estão assistindo.

As opções 2 e 3 permanecem possíveis porque o estado será associado à estação, não a um componente de interface específico.

## Modelo do mundo e contrato

O `game-core` ganhará o tipo interativo `screen_station`, com ID estável, rótulo, posição, raio, prioridade e uma zona de audiência. O catálogo de ações declarará somente `start_screen_share` e `stop_screen_share`.

O protocolo de interação continuará genérico. O estado de apresentação será acrescentado ao snapshot autoritativo como uma lista pequena de sessões ativas: ID da estação, sessão do apresentador e rótulo seguro para exibição. O cliente nunca aceitará apresentador, estação ou alcance como fonte de verdade local.

`start_screen_share` é uma intenção para reservar a estação, e não uma confirmação de captura. A captura pertence ao navegador. Se a permissão for negada, a reserva é liberada por um comando explícito de cancelamento/encerramento. Requisições são idempotentes pelo `requestId` já existente.

## Autoridade, mídia e privacidade

O servidor valida alcance, disponibilidade e exclusividade antes de reservar a estação. Somente o autor da reserva pode encerrá-la. Desconexão do apresentador libera a estação imediatamente.

O token LiveKit permitirá publicar uma track de tela além do microfone. Isso não autoriza automaticamente todos a consumi-la. O backend continuará definindo quem pode receber mídia, e o cliente usará assinatura seletiva:

1. O apresentador publica apenas a track da tela associada à sua estação reservada.
2. O cliente de cada espectador só assina essa track quando sua posição autoritativa estiver dentro do raio de audiência da mesma estação.
3. Ao sair do raio, a track é desassinada após uma histerese curta, não apenas escondida.
4. A tela é sempre desassinada em falha de política, reconexão, saída da estação ou fim da captura.

O servidor deve incluir a identidade do apresentador na permissão de subscription somente para espectadores permitidos. Assim, esconder o vídeo no React não é a única barreira de privacidade. Áudio espacial continua independente: assistir a uma tela não torna pessoas automaticamente audíveis fora da política acústica vigente.

## Cliente e interface

O controlador LiveKit ganhará uma API isolada para iniciar, encerrar e observar compartilhamento de tela. Ela deverá reutilizar a conexão atual, tratar a permissão do navegador e sempre desligar a track local ao desmontar, desconectar ou perder a reserva.

O React exibirá uma janela de apresentação compacta apenas para quem está autorizado a assistir. Ela terá título da estação, nome do apresentador, estado de carregamento e ação de fechar a visualização local. Fechar a janela não encerra a transmissão; só desassina o vídeo até o usuário reabrir ou sair do alcance. O apresentador recebe um indicador discreto no HUD e uma ação acessível para encerrar.

O Phaser apenas marca a estação ativa e o avatar apresentador. Não renderiza vídeo dentro do canvas, evitando custo e problemas de escala pixel-art.

## Falhas e casos-limite

- Permissão de captura negada, cancelada ou sem fonte: não há publicação e a reserva é liberada.
- A track termina pelo controle do sistema/navegador: o cliente encerra a sessão no servidor.
- Dois jogadores tentam iniciar: o primeiro reserva; o segundo recebe `conflict`.
- O apresentador sai do alcance, desconecta ou entra em foco: a transmissão é encerrada para evitar uma tela abandonada.
- Espectador sai do alcance, troca de zona privada ou perde conexão: vídeo é desassinado e removido imediatamente; a interface volta a um estado neutro.
- Snapshot de vídeo inválido ou ausente: cliente falha fechado e não assina tracks de tela.
- Apenas fontes de tela aceitas são renderizadas; tracks de câmera permanecem desassinadas.

## Testes e critérios de aceite

- Testes puros validam elegibilidade, raio de audiência, exclusividade e limpeza de reserva.
- Protocolo rejeita ações, IDs e estados inválidos.
- Serviço do servidor cobre início, disputa, término, perda de alcance e desconexão.
- Controlador de mídia cobre permissão negada, track encerrada, desinscrição e reconexão.
- UI cobre apresentador, espectador, carregamento, erro e fechamento local.
- QA com duas abas confirma que apenas o espectador próximo recebe vídeo e que sair do alcance o remove.
- `test`, `typecheck`, `lint`, `build` e `git diff --check` devem passar.

## Desempenho e custo

Não serão adicionados banco, serviço pago ou dependência de vídeo extra. Haverá uma única track de tela ativa no MVP. A assinatura seletiva evita download e decodificação para quem não está próximo. O vídeo é renderizado em React fora do canvas Phaser e deve usar dimensão limitada/adaptive stream do LiveKit para não disputar CPU com IDEs e Docker.

## Fora do escopo

- Múltiplas telas e salas de reunião simultâneas.
- Câmera, gravação, chat, anotações, controle remoto ou takeover.
- Persistência de apresentações, métricas e histórico.
- Fluxo de permissão administrativa ou editor de mapa.
- Tela pública de anúncios e integração com Pull Requests.
