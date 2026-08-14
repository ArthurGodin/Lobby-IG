# Motor de objetos interativos

## Objetivo

Criar uma única fundação para interações presenciais do campus. Mesas de foco, portas, telas,
plataformas de Pull Request e dispositivos da War Room deverão usar o mesmo fluxo de descoberta,
seleção, comando, validação e feedback, sem acumular condicionais específicos no componente
principal ou no servidor.

Esta entrega implementará o motor e migrará somente as mesas de foco existentes. Os demais tipos
serão adicionados em entregas próprias, depois que sua experiência e suas regras forem aprovadas.

## Decisões de experiência

- O objeto elegível principal recebe um destaque discreto no mapa e um prompt com sua ação.
- Quando existe somente uma ação elegível, pressionar `E` a executa imediatamente.
- Quando dois ou mais objetos ou ações estão elegíveis, `E` abre um seletor contextual compacto.
- O seletor pausa os comandos de movimento enquanto estiver aberto. Setas ou `W`/`S` navegam,
  `E` ou `Enter` confirma, `Escape` fecha e todas as opções também funcionam com mouse.
- O seletor informa o nome do objeto e o verbo da ação, por exemplo `Estação 07 — Entrar em foco`.
- A ação de sair de um estado exclusivo, como uma mesa ocupada pelo próprio jogador, sempre tem
  prioridade e continua disponível mesmo que a posição tenha sido ancorada pelo servidor.
- Campos de texto, repetição automática de tecla e sessão desconectada continuam bloqueando o
  atalho global.

O primeiro candidato é escolhido de modo determinístico: estado exclusivo do próprio jogador,
prioridade do tipo, menor distância e, por fim, ID em ordem lexical. O cliente usa essa regra
somente para apresentação; o servidor refaz todas as verificações.

## Modelo tipado do mundo

O `game-core` definirá uma união discriminada de objetos interativos. Todos possuem:

- `id` estável e único no mapa;
- `kind` conhecido pelo código;
- `label` legível e tratada como texto simples;
- posição de interação e raio positivo;
- prioridade de apresentação;
- configuração própria validada para aquele tipo.

A mesa de foco será o primeiro membro da união, preservando assento, saída e direção do avatar. O
mapa passará a expor `interactables`; `focusDesks` e seus helpers específicos serão removidos após
a migração, pois ainda não há versão pública que exija compatibilidade legada.

As ações válidas não serão strings arbitrárias gravadas no mapa. Elas serão declaradas pelo
catálogo do tipo no código. Assim, o futuro editor administrativo poderá posicionar e configurar
objetos aprovados sem conseguir injetar JavaScript ou inventar comandos aceitos pelo servidor.

## Protocolo

O cliente enviará um comando genérico `interact` com:

- `requestId`, único naquela sessão;
- `interactableId`;
- `actionId` explícito.

Ações que alteram estado serão semânticas e idempotentes, como `enter_focus` e `leave_focus`, em
vez de um `toggle`. Uma repetição nunca deverá inverter acidentalmente o resultado anterior.

O servidor responderá com `interaction_result`, correlacionado pelo mesmo `requestId`, contendo o
alvo, a ação e um resultado tipado. O vocabulário comum será `succeeded`, `invalid_target`,
`invalid_action`, `too_far`, `unavailable`, `forbidden` e `conflict`. Um detalhe curto e seguro
poderá distinguir, por exemplo, uma mesa ocupada.

O snapshot seguinte continua sendo a fonte de verdade. O resultado serve para feedback imediato,
não para o cliente alterar estado autoritativo por conta própria.

## Autoridade e processamento no servidor

O tratamento será extraído do servidor principal para um serviço de interações com um registro
exaustivo de handlers por `kind`. Cada handler conhece somente suas regras e recebe um contexto
limitado da sessão, do mapa e dos jogadores.

Para cada comando, o servidor:

1. valida o envelope e limita o tamanho dos identificadores;
2. rejeita ou devolve o resultado já calculado para `requestId` repetido;
3. resolve o objeto pelo catálogo canônico do servidor;
4. confirma que a ação pertence àquele tipo;
5. revalida distância, permissão, ocupação e estado atual;
6. executa a transição de forma atômica no ciclo do servidor;
7. publica o resultado e o novo snapshot.

O cache de deduplicação será pequeno, por sessão e somente em memória. Ele será descartado com a
desconexão e não exige banco, Redis ou serviço externo.

Na migração, o handler de mesa manterá todas as garantias atuais: reserva exclusiva, ancoragem,
barreira física, áudio fechado, microfone local mutado, saída caminhável e liberação na
desconexão.

## Cliente e apresentação

Uma função pura do `game-core` encontrará e ordenará candidatos a partir da posição e do estado
autoritativos. O React manterá apenas o estado efêmero do seletor e das requisições pendentes. O
Phaser receberá qual objeto deve ser destacado, sem decidir ou executar regras de negócio.

O cliente terá um único controlador de interação responsável por:

- gerar `requestId`;
- impedir envio duplicado enquanto a mesma ação está pendente;
- abrir, navegar e fechar o seletor;
- encaminhar o comando ao cliente de rede;
- converter resultados em feedback acessível por `aria-live`.

Apresentação visual e regra ficam separadas. Ícone, verbo e texto de ajuda pertencem ao catálogo
de UI do tipo; posição, alcance e configuração pertencem ao mapa; autorização e transição de
estado pertencem ao servidor.

## Falhas e segurança

- Um objeto removido ou alterado entre seleção e confirmação retorna `invalid_target`.
- Sair do alcance antes do processamento retorna `too_far` e não altera estado.
- Duas reservas concorrentes são serializadas; a segunda retorna `conflict`.
- Ação incompatível com o tipo retorna `invalid_action` sem executar fallback.
- Resultado atrasado é associado por `requestId` e não fecha outro seletor ou requisição.
- Reconexão limpa seletor, pendências e cache local; o snapshot reconstruirá a apresentação.
- Labels do mapa são renderizadas como texto, nunca como HTML.
- O editor futuro só poderá criar tipos registrados e configurações validadas.

## Estrutura prevista

- `packages/game-core`: tipos de objetos, catálogo, validação e seleção determinística;
- `packages/contracts`: comandos e resultados genéricos;
- `apps/server`: serviço de interações e handler de mesa de foco;
- `apps/web`: controlador de interação, seletor React e destaque Phaser.

O componente `CampusApp` deixará de conhecer regras particulares das mesas. A camada de mídia
continuará reagindo ao estado autoritativo `focusMode`; ela não dependerá do seletor ou do objeto
que originou a mudança.

## Testes e critérios de aceite

- validação do mapa rejeita IDs repetidos, tipos/configurações inválidos, posições fora do mapa e
  raios não positivos;
- testes puros cobrem prioridade, distância, desempate, múltiplos candidatos e ação de saída;
- testes de protocolo rejeitam IDs ausentes, longos ou desconhecidos e ações incompatíveis;
- testes do serviço cobrem sucesso, distância, disputa, deduplicação e desconexão;
- a suíte atual das mesas continua garantindo ancoragem, barreira e áudio fechado;
- testes do controlador cobrem ação direta, abertura do seletor, teclado, cancelamento e resposta
  atrasada;
- QA com duas abas confirma a experiência existente das mesas e o seletor com alvos próximos;
- `test`, `typecheck`, `lint`, `build` e `git diff --check` devem passar.

## Compatibilidade, custo e desempenho

Não haverá dependência ou serviço novo. A busca linear pelos objetos é suficiente para o mapa
atual; o catálogo poderá ganhar índice espacial quando mapas reais tornarem isso mensuravelmente
necessário. Protocolo e handlers serão tipados e testados, mas não será criada uma linguagem de
scripts, sistema de plugins ou persistência nesta etapa.

## Fora do escopo

- implementação de portas, telas, compartilhamento de tela, PRs ou War Room;
- editor administrativo e permissões de administrador;
- scripts visuais ou código personalizado armazenado no mapa;
- persistência de interações em banco;
- controle móvel dedicado e suporte a gamepad;
- animações ou novos assets de objetos.

