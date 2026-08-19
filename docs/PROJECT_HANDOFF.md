# Lobby-IG — Handoff de Produto e Engenharia

> Leia este documento antes de propor ou alterar código. Ele registra a linha de raciocínio do projeto para que humanos e agentes continuem o trabalho sem perder decisões já conquistadas.

**Última atualização:** 2026-08-17
**Repositório:** `ArthurGodin/Lobby-IG`  
**Produto exibido:** Inforgeneses Campus  
**Público inicial:** equipe híbrida da Inforgeneses, com unidade física em Teresina e pessoas remotas, como desenvolvedores em São Luís.

---

## 1. A ideia em uma frase

O Inforgeneses Campus é um escritório virtual 2D em pixel art onde colegas se encontram andando pelo mapa, conversam por áudio espacial e usam recursos do ambiente — sem a fricção de criar uma reunião para cada dúvida de dois minutos.

O objetivo não é “gamificar por gamificar”. As mecânicas devem diminuir atrito de colaboração, proteger concentração e tornar a cultura da empresa visível. A estética é **GBA modernizado**: mapa e avatares em pixel art top-down; controles, painéis e textos em React com legibilidade de produto profissional.

## 2. Problema, valor e diferenciação

### Dor resolvida

Em um time híbrido, a conversa rápida exige chat, link, sala, aceite e espera. Isso mata as “colisões espontâneas” de um escritório presencial e isola as pessoas remotas.

### Promessa do produto

- Para falar, aproxime o avatar de outro avatar ou de um espaço de colaboração.
- Para sinalizar trabalho profundo, ative foco na mesa; o mundo e a mídia respeitam isso.
- Para revisar algo junto, use um ponto do mapa, como o Telão do Pátio, em vez de criar uma call descartável.

### Como superar o Gather

O Lobby-IG não deve tentar vencer por “ter avatares”. Ele deve ser uma extensão do trabalho de engenharia da empresa:

- ambiente que reflita a cultura e que o administrador possa construir;
- áudio e tela com privacidade e economia de banda por proximidade reais;
- integrações de engenharia, como revisão de PR e War Room, quando a fundação estiver pronta;
- mecânicas com propósito, nunca distrações obrigatórias;
- interface moderna para tarefas sérias, não um jogo infantilizado.

Há intenção futura de transformar a base em oferta personalizável para outros negócios. Isso **não** autoriza antecipar multi-tenant, cobrança ou integrações pagas.

---

## 3. Princípios inegociáveis

1. **Leve primeiro.** O navegador divide recursos com IDE, Docker, compiladores e ferramentas de desenvolvimento. Evite downloads, animações e assinaturas WebRTC desnecessárias.
2. **Servidor autoritativo.** Posição, colisão, zonas, interações, ocupação e acesso à mídia são decididos no backend. O cliente envia intenção e apresenta resultado.
3. **Privacidade fecha por padrão.** Política de áudio ou tela ausente, inválida ou não aplicada remove assinaturas remotas; no áudio, também desliga o microfone local.
4. **Custo local zero.** Não adicionar SaaS, banco externo, cloud, fila ou serviço pago sem decisão explícita. Ferramentas open source locais são preferidas.
5. **Desktop primeiro.** O MVP é jogável por teclado no computador. Responsividade visual móvel é bem-vinda; controle por toque não é requisito atual.
6. **Acessibilidade e clareza.** React serve para UI séria, legível, acessível e responsiva. Pixel art pertence ao mundo, não a logs, formulários ou textos longos.
7. **Evolução por evidência.** Não trocar WebSocket, LiveKit ou Phaser sem limitação medida que justifique uma migração.

---

## 4. Estado atual: funcionalidades concluídas

### Mundo e presença

- Campus 2D top-down em pixel art, mapa canônico de 48 × 34 tiles.
- Movimentação por `WASD` ou setas, com colisão autoritativa e heartbeat de entrada.
- Snapshots de rede interpolados no cliente; câmera com modo seguir e visão geral.
- Avatares animados com aparência normalizada pelo servidor.
- Radar de proximidade e lista de pessoas próximas.
- Áreas: Pátio, Desenvolvimento, Biblioteca, Administração/Reitoria e áreas comuns.

### Foco e espaços privados

- Mesas interativas podem ser ocupadas por `E`.
- A Cortina de Foco representa Deep Work: bloqueia aproximação, corta o áudio e sinaliza o estado visualmente.
- Administração/Reitoria é zona acústica privada: conversa somente com pessoas dentro dela, ainda respeitando a distância.

### Áudio espacial

- LiveKit local é usado apenas para mídia WebRTC; mundo e simulação continuam em WebSocket.
- Microfone começa desligado e depende de ação explícita do usuário.
- O navegador conecta com assinatura automática desativada.
- O servidor calcula acesso acústico; o cliente assina somente microfones autorizados e aplica ganho por distância/pan estéreo.
- O publicador limita no LiveKit quem pode assinar cada faixa. Não é apenas controle visual.

### Compartilhamento de tela por proximidade

- O **Telão do Pátio** é uma estação interativa; existe um apresentador por vez.
- O navegador só pede a tela depois da reserva autoritativa da estação.
- Somente a audiência autorizada pelo servidor recebe vídeo.
- Afastar-se ou perder permissão desassina o vídeo imediatamente.
- Fechar o visualizador também desassina o stream; existe botão para reabrir.
- Câmera, áudio da aba/tela, gravação e múltiplas apresentações simultâneas estão fora deste corte.

### O que foi validado

Em 2026-08-17, passaram: `pnpm format`, `pnpm test` (32 servidor + 25 web), `pnpm typecheck`, `pnpm lint`, `pnpm build` e `git diff --check`.

O LiveKit local foi subido com Docker Desktop e validado em sessão real. A primeira sessão conectou ao LiveKit (`ws://127.0.0.1:7880`) com sucesso: status "Microfone desligado", áudio espacial funcional e mapa renderizando. Uma segunda sessão simultânea no mesmo navegador/localhost apresentou `ConnectionError: could not establish pc connection`, comportamento esperado do LiveKit em modo `--dev` com múltiplas conexões ICE competindo no mesmo host. O mapa, presença, movimentação e proximidade funcionaram para ambas as sessões via WebSocket. Teste ponta a ponta com dois computadores ou navegadores separados é necessário para declarar áudio real multi-sessão validado.

O bundle principal foi reduzido de 1,62 MB (monolítico) para 236 KB (74 KB gzip) com code-splitting: Phaser e LiveKit são carregados sob demanda em chunks separados (1,39 MB engine + 510 KB mídia).

---

## 5. Arquitetura

~~~text
Browser
  React UI ──────── componentes, controles e acessibilidade
  Phaser ────────── mapa, avatares, câmera e efeitos de mundo
  CampusClient ──── WebSocket do mundo
  CampusMedia ───── LiveKit: microfone, tela, assinaturas e privacidade
       │                         │
       │ WebSocket               │ WebRTC
       ▼                         ▼
apps/server                 LiveKit local (Docker)
  sessões, ticks,
  colisão, zonas,
  interações e políticas
       │
       ▼
packages/contracts + packages/game-core
  protocolo compartilhado e regras puras do domínio
~~~

### Estrutura do monorepo

| Caminho | Responsabilidade |
| --- | --- |
| `apps/web` | React 19, Vite, Phaser 4 e LiveKit client. Nunca é autoridade do mundo. |
| `apps/server` | Node, `ws` e LiveKit server SDK; valida rede e simula o campus. |
| `packages/contracts` | Tipos e mensagens compartilhados. Alterar protocolo aqui antes de cliente/servidor. |
| `packages/game-core` | Regras puras: mapa, colisão, zonas, proximidade e candidatos de interação. |
| `assets` e `scripts/generate-pixel-assets.mjs` | Assets originais e geração determinística. |
| `docs/architecture` | Arquitetura inicial e estratégia realista de custo. |
| `docs/superpowers/specs` | Decisões de produto e design aprovadas. |
| `docs/superpowers/plans` | Planos históricos de implementação. |

### Arquivos críticos

| Arquivo | Regra de trabalho |
| --- | --- |
| `packages/contracts/src/index.ts` | Define snapshots, ações e protocolo. Não aceite dados de rede sem validação. |
| `packages/game-core/src/campusMap.ts` | Fonte canônica de layers, zonas, obstáculos, spawns e objetos. |
| `packages/game-core/src/index.ts` | Regras puras compartilhadas; é o lugar preferencial para lógica testável. |
| `apps/server/src/campusServer.ts` | Tick, sessões, snapshots personalizados e autoridade do mundo. |
| `apps/server/src/protocol.ts` | Parse e rejeição de mensagens externas. |
| `apps/server/src/interactionService.ts` | Reservas de mesas/telão e resultado autoritativo de interações. |
| `apps/server/src/mediaAccess.ts` | Token LiveKit e fontes que cada sessão pode publicar. |
| `apps/web/src/components/CampusApp.tsx` | Orquestra React, WebSocket, Phaser e mídia; evite ampliar a responsabilidade. |
| `apps/web/src/game/CampusScene.ts` | Renderização Phaser; não tomar decisões de rede ou permissão aqui. |
| `apps/web/src/media/CampusMediaController.ts` | Assinaturas LiveKit, áudio espacial, tela e fail-closed. Mudanças exigem cuidado máximo. |
| `apps/web/src/lib/campusClient.ts` | Cliente WebSocket e validação defensiva de snapshots. |

### Fluxo autoritativo do mundo

1. Browser envia perfil e intenção de movimento pelo WebSocket.
2. `protocol.ts` valida; `campusServer.ts` aplica regras de `game-core`.
3. Servidor calcula posição, colisão, zona, proximidade, interações e políticas personalizadas.
4. Cada pessoa recebe snapshot potencialmente diferente, principalmente para mídia.
5. Phaser interpola o mundo; React apresenta painéis; a camada de mídia aplica a política recebida.

### Fluxo da mídia

1. Backend emite token LiveKit temporário cuja identidade é o `sessionId` do avatar.
2. Browser conecta em paralelo ao WebSocket com `autoSubscribe: false`.
3. Snapshot autoritativo informa quais microfones/telas são autorizados.
4. `CampusMediaController` assina ou desassina mídia; Phaser nunca manipula LiveKit.
5. Publicador limita seus próprios `trackSids` por participante.
6. Snapshot inválido ou ausente faz a política falhar fechada.

Não use pacotes de dados do LiveKit para estado autoritativo, colisão ou reconexão do mundo.

---

## 6. Desenvolvimento local

### Requisitos

- Node.js 22.20.0+ na linha LTS;
- pnpm 11.2.2+;
- Docker Desktop somente para LiveKit local.

### Inicialização

~~~powershell
pnpm install
Copy-Item .env.example .env
pnpm media:up
pnpm dev
~~~

Abra `http://127.0.0.1:5173`. Duas abas simulam duas pessoas. Em teste de microfone no mesmo computador, use fones para evitar retorno acústico.

### Validação antes de concluir código

~~~powershell
pnpm format
pnpm test
pnpm typecheck
pnpm lint
pnpm build
git diff --check
~~~

### Mídia local

~~~powershell
pnpm media:up
pnpm media:down
~~~

Se Docker Desktop estiver desligado, mapa e movimentação devem continuar. A interface deve informar que a mídia está indisponível. Não deixe reserva de tela ativa se não houver mídia conectada.

### Não versionar

- `.env`, chaves, tokens ou URLs privadas;
- screenshots e saídas temporárias de QA;
- `node_modules`, `dist` ou artefatos já ignorados pelo Git.

---

## 7. Custo: regra de honestidade

O desenvolvimento local custa R$ 0 em software: Node, pnpm, React, Phaser, WebSocket, LiveKit e Docker são usados localmente. Não há banco, hospedagem, fila ou cloud configurados.

Produção com pessoas em outros estados não é automaticamente gratuita. WebRTC confiável exige servidor público, IP/DNS, TLS, portas UDP/TCP, banda e em alguns cenários relay TURN. Se a Inforgeneses já tiver servidor Linux público, subdomínio e banda, o software pode continuar sem licença paga. Se não tiver, há custo operacional inevitável.

Nunca prometa “produção remota grátis” apenas porque o software é open source.

---

## 8. Regras para mudanças seguras

### Antes de alterar

1. Leia `AGENTS.md`, este handoff e a spec relacionada.
2. Rode `git status --short`. Mudanças não criadas por você pertencem ao usuário.
3. Delimite a tarefa; não reescreva sistemas adjacentes por conveniência.
4. Para comportamento novo, crie ou ajuste teste do domínio quando for prático.

### Protocolo, mapa e mundo

- Comece por `contracts` e `game-core`.
- Valide no servidor; cliente não é fonte da verdade.
- Mantenha snapshots pequenos e personalizados; não envie o mapa a cada tick.
- Os pés do avatar são a referência de posição autoritativa.
- Colisão, zonas e arte devem derivar da mesma definição de mapa sempre que possível.

### Áudio e tela

- Preserve `autoSubscribe: false`.
- Desassine streams fora de alcance, privados ou sem autorização; volume zero não basta para privacidade nem economia de CPU/rede.
- Aplique assinatura seletiva no receptor e permissão de publicação no emissor.
- Microfone e captura de tela só iniciam por ação explícita.
- Não introduza câmera, áudio da tela ou gravação sem decisão específica de UX, privacidade e banda.

### UI e arte

- Mundo e avatares: GBA modernizado, tiles de 16 px ampliados em 2×.
- Casca: React moderna, legível, responsiva e acessível.
- Logs, PRs e estados de erro não devem usar tipografia pixelada difícil de ler.
- Não usar assets protegidos. O gerador local deve permanecer determinístico e sem chamadas externas.

### Git

- Commits devem ser coesos e claros, por exemplo `feat: add proximity screen sharing`.
- Não usar `git reset --hard`, `git checkout --` ou exclusões amplas sem autorização explícita.
- Só faça push quando a tarefa autorizar publicação ou quando o usuário tiver pedido o repositório sincronizado.
- Nunca inclua mudanças alheias ou artefatos temporários no commit.

---

## 9. Decisões fechadas

| Decisão | Motivo |
| --- | --- |
| Aplicação web, não executável nativo | Menor atrito no piloto, atualização centralizada e acesso imediato. Desktop wrapper só com evidência concreta. |
| React + Vite + Phaser | React resolve UI séria; Phaser resolve mapa e movimento 2D leves. |
| Node + `ws` no MVP | Protocolo atual é pequeno e autoritativo; não justifica Socket.IO ou Colyseus. |
| LiveKit para WebRTC | Entrega SFU, TURN, tokens, reconexão e tela sem construir WebRTC do zero. |
| Sem Socket.IO junto com Colyseus | Dois protocolos multiplayer seriam complexidade sem benefício atual. |
| Sem Redis, banco ou Kubernetes | Estado é temporário e um processo local atende o MVP. |
| Pixel art GBA modernizada | Identidade leve e diferenciada, coerente com o campus. |
| World Builder posterior | É estratégico, mas não pode atrasar presença, mídia e confiabilidade. |

Detalhes históricos: [arquitetura](architecture/overview.md), [custo](architecture/zero-cost.md) e [specs](superpowers/specs).

---

## 10. Roadmap priorizado

### Próximo corte recomendado: validar e tornar leve

1. ~~**Validar LiveKit real localmente.**~~ ✅ Validado em 2026-08-17. Primeira sessão conectou com sucesso. Multi-sessão no mesmo host é limitação do modo dev; requer teste com máquinas separadas para validação completa.
2. ~~**Reduzir carregamento inicial.**~~ ✅ Code-splitting implementado: bundle inicial caiu de 1,62 MB para 236 KB (74 KB gzip). Phaser e LiveKit são lazy-loaded.
3. ~~**Diagnóstico local legível.**~~ ✅ Mensagens de erro de conexão WebSocket e LiveKit agora incluem URL do servidor, comando de resolução e contexto específico. Sem SaaS de telemetria.

### Fundação antes de recursos de negócio avançados

4. ~~**Identidade e papéis locais.**~~ ✅ Implementado: sistema seguro de papéis (`PlayerRole`), com serviço servidor que valida variável de ambiente `CAMPUS_ADMIN_KEY`. Cliente ganha selo visual via modal protegido sem se autodeclarar ADM.
5. **Fundação do World Builder.** Documento de mapa versionado, catálogo de recursos, rascunho, validação e publicação atômica.

### Diferenciais depois da fundação

6. **Boss Fight de Pull Request.** Plataforma de revisão com presença autoritativa; integração GitHub somente quando houver endpoint seguro para webhooks.
7. **War Room.** Evento visual de incidente; começar com acionamento manual/local antes de Sentry ou n8n.
8. **Agente local opt-in.** Sinal de inatividade com instalação, consentimento, pausa e telemetria mínima; nunca executar scripts arbitrários recebidos do servidor.
9. **Customização de avatar.** Catálogo de aparência versionado; não fazer editor livre de pixel art no browser.

### Adiado deliberadamente

- editor colaborativo simultâneo;
- importação livre de assets e plugins de terceiros;
- multi-tenant, cobrança e marketplace;
- câmera, gravação e várias telas simultâneas;
- operação interestadual sem infraestrutura empresarial;
- aplicativo desktop nativo;
- controles touch completos.

“Adiado” não significa “cancelado”: significa que uma dependência anterior precisa estar sólida para o recurso não virar dívida técnica.

---

## 11. Visão do World Builder

O administrador final poderá montar o campus sem editar código: pintar pisos e paredes, criar salas, posicionar móveis e decorações, nomear ambientes, definir zonas e publicar revisões.

Será um modo separado de edição, protegido por autorização de servidor, com rascunho, validação, teste e publicação. “Desenhar” significa combinar tiles e objetos de catálogo validado, não criar pixel art livre dentro do browser. Essa escolha preserva colisão, performance, licenças e rede.

A visão completa está em [2026-08-12-admin-world-builder-design.md](superpowers/specs/2026-08-12-admin-world-builder-design.md). Não iniciar a UI do editor antes da identidade/autorizações, persistência local de rascunhos e formato versionado de mapa.

---

## 12. Uso econômico de modelos de IA

Essa recomendação é preferência operacional, não prisão. Use o menor nível que preserve a qualidade:

| Tipo de tarefa | Modelo sugerido |
| --- | --- |
| Arquitetura, segurança, WebRTC, decisão cara ou refatoração profunda | GPT-5.6 Sol com reasoning alto. |
| Implementação delimitada, testes e integração entre pacotes | GPT-5.6 Terra com reasoning alto. |
| Documentação, inventário, QA repetitivo e tarefas mecânicas | GPT-5.6 Luna com reasoning médio. |

Use Sol quando errar for caro. Gastar Sol máximo em mudança de texto, renomeação ou teste rotineiro é desperdício. Antes de pedir código, forneça objetivo, arquivos afetados, critérios de aceite e validações.

---

## 13. Prompt para iniciar uma sessão na Antigravity

~~~text
Você está trabalhando no monorepo Lobby-IG / Inforgeneses Campus.

Leia integralmente AGENTS.md e docs/PROJECT_HANDOFF.md antes de propor mudanças. Em seguida, inspecione git status e os arquivos ligados à tarefa. Preserve alterações existentes que não foram feitas por você.

O produto é um campus corporativo 2D em React + Phaser, com servidor Node/WebSocket autoritativo e LiveKit local para áudio/tela por proximidade. Nunca confie no cliente para posição, permissões ou papel administrativo. Mídia deve falhar fechada: sem política válida, desassine streams.

Não adicione serviços pagos, cloud, banco externo, câmera, gravação ou novas integrações sem aprovação explícita. Mantenha a UI séria e legível; pixel art é apenas o mundo.

Antes de terminar, execute pnpm format, pnpm test, pnpm typecheck, pnpm lint, pnpm build e git diff --check. Explique resumidamente o plano antes, o que mudou depois e as limitações reais. Faça commits coesos somente quando a tarefa incluir commit/publicação.
~~~

---

## 14. Manutenção deste documento

Atualize este handoff quando mudar qualquer um destes pontos:

- stack, pacote, protocolo ou fluxo de mídia;
- decisão de custo, infraestrutura ou segurança;
- funcionalidade que saiu do roadmap para produção;
- ordem de prioridades;
- procedimento de desenvolvimento ou validação;
- contrato de autorização do administrador.

Não registre segredos, tokens, IPs privados ou dados de colaboradores. Para uma mudança específica de feature, crie também uma spec curta em `docs/superpowers/specs` e mantenha aqui apenas resumo e link.
