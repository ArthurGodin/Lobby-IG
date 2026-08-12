# Inforgeneses Campus — World Builder do administrador

Data: 2026-08-12

## Status e prioridade

Este documento registra a visão aprovada para uma capacidade futura. O World Builder não entra
no próximo corte de implementação: o áudio por proximidade continua sendo o valor central do
produto e deve ser desenvolvido antes do editor completo.

## Objetivo

Permitir que o administrador construa e reorganize o campus com os recursos fornecidos pelo
sistema. O editor deve representar organicamente a cultura da Inforgeneses: o administrador
poderá criar cenários, nomear ambientes, definir paredes, pisos, móveis, decorações e regras de
cada região sem editar código.

“Desenhar” significa montar o mundo com tiles, objetos e ferramentas do próprio editor. Não
significa criar pixel art quadro a quadro dentro do navegador.

## Decisão de produto

O editor será híbrido e guiado:

- pisos, caminhos e paredes serão pintados sobre uma grade;
- salas poderão ser criadas arrastando retângulos e ajustadas tile a tile;
- móveis e decorações serão instâncias arrastáveis de um catálogo aprovado;
- zonas, pontos de entrada e comportamentos especiais serão configurados por propriedades;
- o servidor impedirá a publicação de mapas estruturalmente inválidos.

Essa abordagem oferece liberdade para construir o campus sem permitir que detalhes de colisão,
formato de asset ou regras de rede sejam corrompidos acidentalmente.

## Experiência de edição

O modo de edição será separado do modo normal de jogo. A casca React exibirá:

- barra superior com selecionar, pintar, apagar, desfazer, refazer, testar e publicar;
- biblioteca pesquisável à esquerda, agrupada por pisos, estruturas, móveis, natureza e itens
  especiais;
- mapa Phaser no centro, com grade, seleção e prévia transparente da ação;
- inspetor à direita para nome, posição, camada, colisão e propriedades do item selecionado;
- barra inferior com revisão publicada, quantidade de alterações e estado da validação.

As ferramentas previstas para a visão final são:

- pincel, borracha, preenchimento e retângulo;
- criação rápida de sala com piso, contorno de parede e aberturas editáveis;
- seleção simples e de região;
- mover, duplicar, copiar e colar áreas;
- arrastar objetos com encaixe na grade;
- ocultar e bloquear camadas;
- nomear cenários e ambientes;
- testar o rascunho caminhando antes de publicar;
- histórico local de desfazer e refazer;
- restauração de uma revisão publicada anterior.

Ferramentas avançadas aparecerão apenas quando forem relevantes para a seleção atual. O editor
deve ser poderoso sem apresentar todos os controles ao mesmo tempo.

## Modelo canônico do mapa

O mapa publicado será um documento JSON versionado contendo:

- identificador, nome, revisão, dimensões e tamanho lógico do tile;
- camadas de terreno e estruturas em ordem de linha;
- instâncias de objetos com identificador único, tipo, posição e orientação permitida;
- ambientes nomeados e suas zonas retangulares;
- pontos de entrada;
- propriedades de comportamento suportadas pelo catálogo.

O catálogo de recursos será definido em `packages/game-core`. Cada entrada informará dimensões,
frames visuais, camada permitida, área ocupada, colisão e propriedades editáveis. O documento do
mapa armazenará identificadores semânticos, nunca índices de sprites espalhados pelo cliente.

Objetos serão entidades completas. Uma fonte de 2×2 tiles, por exemplo, poderá ser selecionada e
movida inteira. Colisão e renderização serão derivadas da mesma instância.

## Componentes e responsabilidades

### React

- autenticação do administrador;
- biblioteca de recursos e inspetor;
- comandos, histórico, validações e diálogo de publicação;
- acessibilidade e mensagens legíveis.

### Phaser

- grade, cursor, seleção e prévia de posicionamento;
- renderização incremental do rascunho;
- conversão de ponteiro para coordenadas de tile;
- modo de teste local sem assumir autoridade sobre o mapa publicado.

### `packages/game-core`

- tipos e validação pura do documento;
- catálogo de recursos;
- derivação de colisões, zonas e spawns;
- busca de uma posição caminhável quando um jogador precisar ser reposicionado.

### Servidor

- autorização da sessão administrativa;
- armazenamento do rascunho e das revisões;
- validação autoritativa;
- publicação atômica;
- distribuição do mapa publicado aos clientes.

## Autorização do administrador

Enquanto não houver login corporativo, o servidor usará uma chave configurada em variável de
ambiente e nunca commitada. O administrador informará a chave em um modal; o servidor concederá
a capacidade de edição apenas àquela conexão. A chave permanecerá somente na memória do
navegador.

Essa solução é adequada ao desenvolvimento local e ao piloto protegido. Uso remoto exigirá
HTTPS/WSS. Quando autenticação corporativa existir, a capacidade será derivada da identidade e do
papel do usuário, sem alterar os comandos do editor.

O cliente nunca será confiável para declarar a si mesmo como administrador ou publicar um mapa.

## Rascunho, publicação e versões

O administrador editará um rascunho privado. Os demais jogadores continuarão usando a última
revisão publicada. O servidor salvará o rascunho em JSON local para que uma atualização do
navegador não apague o trabalho.

Ao publicar, o servidor deverá:

1. validar dimensões, camadas, objetos, ambientes e spawns;
2. rejeitar referências desconhecidas ou dados fora dos limites;
3. garantir ao menos um spawn caminhável;
4. salvar a nova revisão em arquivo temporário;
5. preservar a revisão anterior;
6. substituir o arquivo publicado de forma atômica;
7. trocar o mapa ativo da simulação;
8. reposicionar somente jogadores presos pela nova geometria;
9. enviar a nova revisão aos clientes.

O mapa será enviado na conexão e após uma publicação, nunca dentro dos snapshots de movimento de
20 Hz.

## Regras de validação e falhas

A publicação será bloqueada quando houver tile desconhecido, objeto fora do mapa, sobreposição
proibida, zona inválida, spawn bloqueado ou documento incompatível. O painel mostrará o erro no
mapa e em uma lista navegável.

Falha ao salvar manterá a revisão publicada intacta. Falha de um cliente ao carregar a nova
revisão não afetará a autoridade do servidor; o cliente receberá uma mensagem de recuperação e
poderá reconectar. Nenhuma alteração parcial poderá se tornar o mapa ativo.

## Evolução planejada

### Etapa A — Fundação do World Builder

- formato JSON e migração do mapa atual;
- catálogo de recursos;
- autorização administrativa;
- rascunho, validação, publicação e restauração;
- pisos, paredes, portas, janelas e objetos existentes.

### Etapa B — Regras do mundo

- ambientes nomeados;
- zonas privadas e políticas de áudio;
- spawns;
- mesa de foco, plataforma de PR e War Room como comportamentos catalogados.

### Etapa C — Expansão visual segura

- novos pacotes de tiles e objetos originais ou com licença compatível;
- importação administrativa validada;
- prévia, dimensões, pivô, camadas e colisão dos novos recursos.

Continuam fora desta visão inicial: editor de pixel art dentro do navegador, scripts arbitrários,
edição colaborativa simultânea e plugins de terceiros executados no cliente.

## Critérios de aceite futuros

O World Builder estará completo quando o administrador puder reconstruir o campus sem editar
código, nomear seus ambientes, testar a circulação, publicar com segurança e restaurar uma
versão anterior. Jogadores comuns não verão controles administrativos nem conseguirão publicar
mensagens forjadas pelo WebSocket.

Os testes deverão cobrir validação pura, autorização, persistência atômica, rollback, colisão,
reposicionamento, histórico do editor e sincronização de uma publicação entre duas sessões. O QA
no navegador deverá incluir teclado, ponteiro, zoom, telas menores e tentativa de acesso sem
permissão.

Nenhuma etapa dessa capacidade exigirá banco pago, serviço SaaS ou asset protegido.
