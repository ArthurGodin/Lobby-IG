# Inforgeneses Campus — Mundo GBA Modernizado

Data: 2026-08-12

## Objetivo

Transformar o mundo geométrico atual em um RPG corporativo top-down inspirado na linguagem
visual dos portáteis de 32 bits, mantendo toda a interface de trabalho em React moderna,
legível e responsiva.

A inspiração é estrutural: escala, câmera, leitura por tiles, animação e atmosfera. Personagens,
mapa, prédios, nomes e assets serão originais. Nenhum sprite, tileset, mapa, personagem ou marca
de Pokémon será copiado ou distribuído no projeto.

## Direção escolhida

O produto usará duas linguagens complementares:

- **Mundo Phaser:** pixel art top-down expressiva, acolhedora e acadêmica;
- **Casca React:** ferramenta corporativa limpa para áudio, pessoas, chat, PRs, erros e
  customização futura.

O jogo pode ser lúdico; informação de trabalho nunca será pixelada nem comprimida em uma UI de
videogame. Links, mensagens, código e alertas continuarão usando tipografia e controles web
convencionais.

## Escopo deste corte

Entram agora:

- definição canônica do mapa por tiles;
- tileset original mínimo;
- mapa com Pátio, Biblioteca, Desenvolvimento e Administração/Reitoria;
- avatar-base original com quatro direções, estados parado e caminhando;
- variação da roupa pela cor já existente no perfil;
- câmera que acompanha o avatar;
- botão React para alternar entre câmera próxima e visão geral;
- integração visual com o radar de proximidade existente;
- testes das novas regras e QA em duas sessões.

Ficam fora deste corte:

- editor completo de avatar;
- camadas de cabelo, pele, roupa e acessórios;
- loja, moedas, conquistas ou itens desbloqueáveis;
- chat de texto, notificações de PR e War Room;
- áudio LiveKit;
- mecânicas especiais da Administração.

## Sistema visual do mundo

### Escala e renderização

- A unidade nativa de arte será `ART_TILE_SIZE = 16 px`.
- A simulação continuará usando `TILE_SIZE = 32` unidades por tile.
- O Phaser aplicará `ART_SCALE = 2` aos assets; velocidade, colisão e proximidade não mudarão.
- O zoom da câmera será independente de `ART_SCALE`.
- O Phaser usará `pixelArt: true`, antialias desativado e arredondamento de pixels da câmera.
- Spritesheets usarão filtro nearest-neighbor e padding entre frames para evitar vazamento.
- O canvas usará `image-rendering: pixelated`.
- O modo de acompanhamento usará zoom e posições inteiros. A visão geral poderá usar zoom
  fracionário para enquadrar todo o campus; nela, uma pequena perda de nitidez é aceitável.
- O MVP permanece jogável em desktop com teclado. Em telas pequenas, a página continuará
  legível, mas controles por toque permanecem fora do escopo.

### Paleta e atmosfera

A paleta será original e ligada à Inforgeneses:

- verdes institucionais para identidade e vegetação;
- creme e pedra clara para pisos e fachadas;
- dourado envelhecido para detalhes acadêmicos;
- terracota em telhados e pontos de atenção;
- azul acinzentado para Biblioteca e tecnologia;
- tons mais profundos e contraste controlado na Administração.

A Administração/Reitoria deve parecer importante e levemente misteriosa — a “sala cabulosa” —
sem usar símbolos ameaçadores ou perder o contexto corporativo.

### Tileset mínimo

O primeiro tileset conterá apenas o necessário para o mapa aprovado:

- grama, variações decorativas e bordas;
- caminho de terra/pedra e transições;
- pisos internos;
- paredes, portas, janelas e telhados;
- árvores, arbustos e flores;
- mesas, cadeiras, computadores, estantes e bancos;
- placas e detalhes acadêmicos.

Os sprites serão spritesheets/atlas PNG locais com transparência, versionados em
`apps/web/public/assets`. Também será mantido um manifesto TypeScript ligando identificadores
semânticos aos frames. O mapa nunca dependerá de índices mágicos espalhados pela cena. A autoria
e licença de cada pacote visual serão registradas no repositório; este corte usará apenas arte
própria ou CC0 compatível.

## Mapa canônico e colisão

`packages/game-core` será a fonte de verdade do mundo por meio de um `CampusMapDefinition`. A
primeira versão terá `48 × 34` tiles, ou `1536 × 1088` unidades de mundo, ficando maior que o
viewport desktop e tornando o acompanhamento de câmera significativo. A definição manterá:

- dimensões, `TILE_SIZE` e grade lógica;
- camadas semânticas de terreno e decoração;
- objetos e móveis com tipo e posição;
- colliders usados pelo servidor;
- zonas e pontos de entrada;
- helpers puros para consultar tile, zona e colisão.

O Phaser consumirá essa definição e cuidará apenas da apresentação. Objetos visuais bloqueáveis
serão derivados da mesma definição usada por `canStandAt`; não haverá uma parede desenhada em
um lugar e uma colisão manual em outro. Nenhuma posição de caminho, parede ou móvel nascerá
dentro da `CampusScene`. Neste corte, o mapa será declarado e validado em TypeScript; o editor
gratuito Tiled poderá ser adotado depois sem mudar o formato canônico consumido pelo jogo.

Nesta migração, as coordenadas do mundo e o protocolo de movimento permanecerão compatíveis
sempre que possível. Mudanças de layout atualizarão juntos spawns, zonas, obstáculos e testes.
As coordenadas `x/y` de um jogador representarão o ponto dos pés. O sprite usará origem
`(0.5, 1)`, enquanto o collider pequeno dos pés será definido exclusivamente no `game-core`.
O tamanho visual do sprite nunca determinará a colisão.

## Câmera híbrida

### Modo acompanhamento

- É o modo padrão.
- O canvas usa `Phaser.Scale.RESIZE`, separado das dimensões do mundo, e acompanha seu contêiner.
- A câmera usa `setBounds` e segue o avatar visual interpolado com suavização curta.
- O avatar permanece próximo ao centro, exceto nas bordas do campus.
- Movimento e sincronização continuam ativos enquanto a câmera acompanha o jogador.
- O radar permanece centrado no avatar e usa exatamente as distâncias autoritativas atuais.
- O Phaser não habilitará física local para os jogadores. A interpolação e o `lerp` da câmera
  são apenas visuais e nunca serão enviados de volta ao servidor.

### Visão geral

- Um botão na barra React, com texto e ícone, alterna “Visão geral” e “Voltar ao avatar”.
- A visão geral usa `stopFollow`, centraliza o mundo e calcula o zoom por
  `min(viewportWidth / worldWidth, viewportHeight / worldHeight)`.
- Ela enquadra o campus inteiro sem alterar o jogador ou o estado no servidor.
- O movimento permanece ativo porque o avatar continua visível; um indicador deixa claro que a
  pessoa está na visão geral.
- Nomes são ocultados nesse zoom; os marcadores coloridos dos jogadores permanecem visíveis.
- O enquadramento é recalculado após resize.
- Fechar a visão geral restaura o zoom inteiro anterior e acompanha a posição visual atual do
  avatar, inclusive após reconexão.
- O botão expõe `aria-pressed`; a mudança de modo é anunciada em uma região `aria-live`.
- `Esc` fecha a visão geral, desde que o foco não esteja em um campo de edição.

O estado de câmera pertence ao cliente e não entra no protocolo multiplayer.

## Avatar-base e evolução futura

O corte atual terá um avatar original pequeno, com:

- frames nativos de `16 × 24 px`, renderizados em 2×;
- frente, costas, esquerda e direita;
- três frames por direção: pose central para `idle` e ciclo curto de caminhada;
- sombra simples;
- roupa recolorida pelas cores permitidas em `PlayerColor`;
- nome legível e limitado às bordas da câmera.

O Phaser interpolará somente a exibição entre os snapshots de 20 Hz. Animação, câmera e anéis de
proximidade acompanharão essa posição visual, enquanto regras e distâncias continuarão usando a
posição autoritativa do servidor.

Será criado um contrato serializável `AvatarAppearance` no pacote de contratos. Agora ele terá
somente `outfitColor`. `JoinOptions.appearance` será opcional; `PlayerSnapshot.appearance` sempre
trará um valor normalizado pelo servidor, usando a cor atual como fallback. A implementação não
usará um PNG diferente para cada pessoa: o avatar-base e a máscara da roupa serão folhas locais
alinhadas e a máscara será tingida em tempo de execução.

A evolução planejada, fora deste corte, adicionará campos versionados para tom de pele, cabelo,
camisa, calça e acessório. Todas as camadas futuras compartilharão o mesmo tamanho, pivô e frames,
permitindo que um editor React monte o avatar sem alterar movimento ou rede.

## Componentes e responsabilidades

### `packages/game-core`

- descrição canônica do mapa;
- colisão, zonas, spawns e proximidade;
- helpers puros e testáveis;
- nenhuma dependência de Phaser ou DOM.

### `packages/contracts`

- `AvatarAppearance` e aparência dentro de `PlayerSnapshot`;
- mensagens de perfil compatíveis com clientes antigos deste MVP;
- nenhuma referência a texturas ou objetos Phaser.

### `apps/web/src/game`

- carregamento de sprites e tiles;
- renderização das camadas do mapa;
- animações e tint do avatar;
- controlador de câmera com API explícita `setOverview(enabled)`;
- apresentação do radar recebido do servidor.

### `apps/web/src/components`

- botão e estado da visão geral;
- barra, painel e futura central de atividades;
- acessibilidade e mensagens de estado;
- nenhuma regra de colisão ou distância.

## Fluxo de dados

1. O servidor continua recebendo intenções de movimento e calculando posições.
2. `game-core` aplica colisão contra o mapa canônico.
3. O snapshot inclui posição, direção, movimento, proximidade e `AvatarAppearance`.
4. Phaser escolhe animação e aparência, atualiza os sprites e posiciona a câmera.
5. React só controla o modo local da câmera e os painéis corporativos.

Se um asset falhar ao carregar, a cena mostrará um placeholder original simples e registrará o
erro no console; conexão e movimento não serão interrompidos. Se o avatar local ainda não tiver
chegado no snapshot, o botão de visão geral continuará utilizável, mas o retorno ao avatar ficará
desabilitado até a sessão estar pronta.

## Desempenho

O corte não adicionará bibliotecas de UI ou engine. As medidas iniciais serão:

- um atlas pequeno para o mapa e folhas alinhadas para avatar-base e máscara da roupa;
- atlas carregados no `preload` e camadas estáticas renderizadas uma vez, sem criar um objeto
  Phaser independente para cada tile;
- apenas jogadores e radar atualizados durante snapshots;
- sem filtros, blur, partículas ou iluminação dinâmica;
- UI React limitada a quatro atualizações por segundo, como no corte atual;
- bundle e tempo de carregamento medidos após o build.

O Phaser já representa a maior parte do bundle. Code splitting ou troca de engine só entram se
o profiling em máquinas reais demonstrar um problema relevante.

## Testes e critérios de aceite

O corte estará pronto quando:

- tiles e sprites permanecerem nítidos nos viewports desktop suportados;
- mapa visível e colisão do servidor correspondem nos objetos bloqueáveis;
- todos os spawns são caminháveis e todos os colliders ficam dentro do mapa;
- avatar local e remoto exibem direção, idle, caminhada e cor corretos;
- câmera acompanha sem tremores e não ultrapassa o mapa;
- visão geral enquadra 100% do mapa após resize, fecha por botão/Esc e retorna ao avatar atual;
- radar conserva faixas e posições corretas nos dois modos;
- anéis de proximidade acompanham o avatar visual interpolado;
- duas abas continuam com jogadores, nomes e aparências sincronizados;
- falha simulada de asset usa placeholder sem quebrar conexão;
- `pnpm test`, `pnpm typecheck`, `pnpm lint` e `pnpm build` passam;
- QA no navegador cobre desktop, viewport estreito e duas sessões;
- profiling registra FPS e memória com o mapa completo, além de nitidez em escala de tela de
  100% e 200%;
- nenhum asset protegido, serviço pago ou custo de infraestrutura é introduzido.

## Decisão de produto

Este corte prioriza uma base artística coerente e extensível. Chat, loja, notificações, áudio e
customização profunda não serão simulados visualmente agora. A próxima funcionalidade só será
acoplada depois que mapa, câmera e avatar estiverem estáveis e medidos.
