# Inforgeneses Campus — Zonas acústicas privadas

Data: 2026-08-12

## Objetivo

Transformar ambientes fechados do campus em conversas privadas automáticas. A pessoa apenas
atravessa a porta: o servidor identifica o ambiente, o áudio externo é interrompido e somente
ocupantes da mesma sala podem conversar, ainda com volume determinado pela distância.

Este corte estende o áudio local por proximidade já existente. Ele não cria serviços pagos,
novas conexões persistentes nem fluxos de confirmação.

## Decisões aprovadas

- A entrada e a saída de uma zona acústica serão automáticas.
- O servidor do mundo continuará sendo a fonte de verdade para posição, zona e política
  acústica.
- O radar de proximidade física e a permissão acústica serão conceitos separados.
- O Pátio, Desenvolvimento e Biblioteca começarão como áreas abertas.
- A Administração / Reitoria começará como zona privada.
- Dentro de uma zona privada, somente pessoas na mesma zona poderão conversar.
- A distância continuará controlando o volume entre pessoas acusticamente compatíveis.
- O LiveKit continuará usando uma única sala de mídia e `autoSubscribe: false`.
- A privacidade não dependerá apenas de volume zero: cada publicador aplicará permissões de
  assinatura à própria faixa de microfone.
- Falhas de política acústica usarão comportamento fechado para áudio e não interromperão o
  mapa.
- A definição de zona já nascerá compatível com o futuro editor ADM.

## Abordagens consideradas

### Uma sala LiveKit com permissões de faixa — escolhida

Mantém a conexão WebRTC atual e usa permissões de assinatura do microfone por identidade. Não
introduz corte de reconexão ao atravessar uma porta e funciona no LiveKit Server autohospedado.

### Uma sala LiveKit por ambiente — descartada neste corte

O isolamento por sala seria conceitualmente simples, mas exigiria trocar a conexão de mídia nas
fronteiras. A API de mover participantes entre salas é oferecida no LiveKit Cloud, não no servidor
comunitário local. Reconectar manualmente também causaria interrupções e aumentaria a
complexidade.

### Silenciamento somente no receptor — descartado

Seria fácil, porém um cliente alterado poderia voltar a assinar uma faixa. Volume zero é uma
decisão de reprodução, não uma política de acesso.

## Escopo

Entram neste corte:

- propriedade acústica na definição canônica das zonas;
- descoberta determinística da zona pelos pés autoritativos do avatar;
- política pura que decide compatibilidade acústica entre duas pessoas;
- snapshot acústico individual com revisão crescente;
- filtragem acústica aplicada antes da curva de distância;
- permissões de assinatura da faixa local;
- saída imediata de assinaturas que deixaram de ser permitidas;
- identificação legível do ambiente atual e do seu caráter aberto ou privado;
- aviso breve ao entrar ou sair de conversa privada;
- testes de regra, protocolo, servidor, controlador de mídia e interface;
- documentação da arquitetura e da execução local.

Ficam fora:

- senhas, convites, lista de presença aprovada ou botão para entrar na conversa;
- trancas, cargos e exceções para administradores;
- salas LiveKit separadas;
- criptografia ponta a ponta com chaves diferentes por zona;
- persistência ou edição das propriedades pelo editor ADM;
- compartilhamento de tela, câmera, gravação e chat;
- isolamento acústico baseado na geometria exata de paredes fora das zonas declaradas.

## Modelo do mundo

Os identificadores e modos compartilhados ficarão em `packages/contracts`, que já é dependência
do `game-core`. `CampusZone` receberá a propriedade obrigatória:

```ts
type AcousticMode = "open" | "private";

type CampusZone = {
  id: CampusZoneId;
  label: string;
  rect: Rect;
  acousticMode: AcousticMode;
};
```

Uma posição que não pertença a nenhuma zona será considerada parte de `Áreas comuns`, em modo
aberto. Esse ambiente virtual não será persistido como uma quinta zona.

A zona será encontrada pelo ponto autoritativo `x/y` do jogador, que já representa seus pés. Os
retângulos usarão borda esquerda e superior inclusivas e borda direita e inferior exclusivas. Isso
garante um único resultado na fronteira. A validação do mapa rejeitará identificadores duplicados,
zonas fora dos limites e interseções entre zonas.

Inicialmente:

| Zona | Rótulo | Modo |
| --- | --- | --- |
| `patio` | Pátio | aberto |
| `desenvolvimento` | Desenvolvimento | aberto |
| `biblioteca` | Biblioteca | aberto |
| `reitoria` | Administração / Reitoria | privado |
| nenhuma zona | Áreas comuns | aberto |

## Regra acústica

Dois jogadores são acusticamente compatíveis quando:

1. ambos estão em ambientes abertos; ou
2. ambos estão dentro da mesma zona privada.

Uma pessoa em ambiente aberto nunca é compatível com uma pessoa em ambiente privado. Pessoas
em zonas privadas diferentes também não são compatíveis, mesmo que seus retângulos estejam
fisicamente próximos.

A compatibilidade define acesso. A distância define audibilidade e ganho:

- incompatível: sem permissão e sem assinatura;
- compatível, mas fora do raio: permitido, porém desassinado após a tolerância existente;
- compatível e dentro do raio: assinado e com ganho calculado pela curva existente.

O radar continuará descrevendo proximidade física. Assim, a interface pode indicar que alguém
está perto sem afirmar incorretamente que essa pessoa está sendo ouvida. A lista acústica será a
fonte usada exclusivamente pelo controlador de mídia.

## Contrato de rede

Cada `WorldStateSnapshot` personalizado incluirá:

```ts
type AcousticEnvironmentSnapshot = {
  zoneId: CampusZoneId | null;
  label: string;
  mode: AcousticMode;
};

type AcousticSnapshot = {
  revision: number;
  environment: AcousticEnvironmentSnapshot;
  allowedPeerSessionIds: string[];
  audiblePeers: ProximityPeerSnapshot[];
};
```

`allowedPeerSessionIds` contém todos os jogadores acusticamente compatíveis presentes, mesmo
fora do raio. Essa lista controla quem pode assinar o microfone do destinatário e evita uma janela
de permissão quando alguém se aproxima rapidamente.

`audiblePeers` é o subconjunto compatível dentro do raio de proximidade. Ele controla assinatura
remota e ganho. O servidor ordenará ambas as listas por `sessionId`, eliminando alterações
artificiais provocadas apenas pela ordem de iteração.

`revision` será crescente por sessão WebSocket e avançará quando a política acústica personalizada
mudar. O cliente descartará revisões menores ou iguais à última aplicada. Uma nova conexão do
mundo começa uma nova sessão e reinicia esse controle.

## Componentes e responsabilidades

### `packages/game-core`

- usar `AcousticMode` e `CampusZoneId` compartilhados e representar a propriedade canônica da
  zona;
- encontrar a zona de uma posição;
- validar a geometria das zonas;
- decidir compatibilidade acústica;
- produzir os pares permitidos e audíveis sem conhecer LiveKit ou transporte.

### `packages/contracts`

- definir `AcousticMode`, `CampusZoneId` e transportar ambiente e snapshot acústico;
- manter tipos serializáveis e explícitos;
- não conter credenciais nem regras de SDK.

### `apps/server`

- derivar o snapshot de cada jogador a partir do estado autoritativo;
- manter e emitir a revisão acústica;
- nunca aceitar do navegador uma alegação de zona ou lista permitida;
- continuar enviando proximidade física independentemente da acústica.

### `apps/web/src/media`

- aceitar apenas snapshots da sessão atual e em ordem crescente;
- remover imediatamente assinaturas incompatíveis;
- aplicar à faixa local a lista de identidades autorizadas;
- assinar somente microfones presentes em `audiblePeers`;
- manter a curva de ganho e a tolerância de 750 ms apenas para distância dentro da mesma política;
- falhar de forma fechada e limpar permissões, timers e elementos de áudio ao desconectar.

### React e Phaser

React mostrará o ambiente atual no painel de áudio:

- `Pátio · área aberta`;
- `Administração / Reitoria · conversa privada`;
- `Áreas comuns · área aberta`.

Uma região `aria-live` anunciará somente transições reais: `Você entrou em uma conversa privada`
ou `Você voltou para uma área aberta`. A primeira renderização não produzirá anúncio.

O Phaser permanecerá inalterado e continuará sem importar o SDK LiveKit. O indicador pertence à
casca React; este corte não redesenhará o mapa nem criará novos assets.

## Fluxo de transição

1. O servidor aplica o movimento e determina o ambiente pelos pés do avatar.
2. O servidor calcula permissões e pares audíveis para cada sessão.
3. O cliente recebe uma revisão acústica posterior à que aplicou.
4. Mudanças restritivas são aplicadas primeiro: a publicação local é limitada e faixas remotas
   incompatíveis são silenciadas e desassinadas sem esperar 750 ms.
5. A lista final de permissões da publicação local é aplicada.
6. Novas faixas compatíveis e próximas são assinadas e recebem o ganho atual.
7. React atualiza o rótulo e anuncia a transição.

Ao sair de uma zona privada, faixas privadas antigas são removidas antes de a publicação local
voltar à política aberta. Ao entrar, a publicação local é restringida antes de novas faixas da
sala serem liberadas.

## Segurança e limite de confiança

O token continua permitindo somente publicação de microfone. Um publicador legítimo configurará
no LiveKit quais identidades podem assinar sua faixa; participantes omitidos não recebem a mídia
daquele microfone pelo SFU.

Essa proteção impede que um receptor comum ou um frontend alterado simplesmente assine o
microfone de um publicador honesto. Entretanto, o navegador do próprio publicador faz parte do
limite de confiança: uma versão adulterada poderia deliberadamente liberar a voz do seu próprio
usuário ou retransmitir áudio que esse usuário já esteja autorizado a ouvir. Impedir gravação
externa ou retransmissão por uma máquina participante não é uma garantia possível para uma
chamada comum no navegador.

O servidor nunca confiará em coordenadas, zona ou permissões enviadas pelo cliente. Nenhuma chave
LiveKit administrativa será exposta no navegador.

## Falhas e concorrência

- Snapshot ausente ou inválido: nenhuma faixa remota será assinada.
- Revisão antiga: será ignorada sem modificar o estado atual.
- Erro ao aplicar permissões: o controlador desassinará todas as faixas remotas, desligará o
  microfone local e mostrará `Privacidade do áudio indisponível`.
- LiveKit indisponível: mapa, movimento, colisão e radar continuam ativos.
- Desconexão do mundo: permissões, assinaturas, timers e elementos de áudio são limpos.
- Jogador sai durante uma transição: sua identidade é removida na revisão seguinte e qualquer
  timer associado é cancelado.
- Oscilação na borda da zona: cada posição tem resultado determinístico e somente a maior revisão
  é aplicada. A privacidade não usa a tolerância temporal da distância.

## Testes

Testes puros cobrirão:

- ponto dentro, fora e exatamente nas quatro bordas de uma zona;
- validação de zonas duplicadas, sobrepostas e fora do mapa;
- duas pessoas em áreas abertas;
- duas pessoas na mesma zona privada;
- pessoa dentro e pessoa no corredor;
- pessoas em zonas privadas diferentes;
- pessoa compatível fora do raio;
- ordenação determinística das listas.

Testes de servidor e contrato cobrirão:

- snapshot individual correto para três participantes;
- revisão crescente após entrada e saída;
- cliente incapaz de declarar sua própria zona;
- radar físico preservado quando a acústica bloqueia um par;
- desconexão removida das permissões seguintes.

Testes de mídia e interface cobrirão:

- revisão antiga ignorada;
- remoção privada imediata, sem tolerância de 750 ms;
- tolerância preservada apenas ao ultrapassar o raio na mesma área;
- permissão local aplicada antes da abertura de novas assinaturas;
- falha fechada quando o SDK rejeita a atualização;
- limpeza idempotente;
- rótulo e anúncio acessíveis da zona;
- mapa utilizável com LiveKit desligado.

QA em navegador usará três sessões para validar Reitoria, corredor e área aberta. Também deverão
passar `pnpm test`, `pnpm typecheck`, `pnpm lint` e `pnpm build`.

## Critério de aceite

Com três pessoas fisicamente próximas, duas dentro da Administração / Reitoria conseguem
conversar por proximidade. A terceira, no corredor, não recebe a faixa de nenhuma delas e não é
ouvida dentro da sala. Ao atravessar a porta, a política muda automaticamente e a interface
explica o novo ambiente. Negar microfone, desligar o LiveKit ou perder a mídia nunca impede o uso
do campus.

O corte não exige conta em nuvem, assinatura, novo serviço ou asset pago.
