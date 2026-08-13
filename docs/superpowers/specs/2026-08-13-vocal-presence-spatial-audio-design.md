# Presenca vocal e audio espacial estereo

Data: 2026-08-13

## Objetivo

Melhorar a sensacao de presenca no Inforgeneses Campus com tres entregas pequenas e conectadas:

- indicador visual de quem esta falando;
- controle de microfone mais claro e confiavel;
- audio espacial estereo simples, calculado no navegador.

Essa entrega deve manter o projeto leve, sem custo novo e sem exigir servidor extra.

## Escopo

### Indicador de fala

Quando um participante remoto estiver falando, o cliente deve refletir isso em dois lugares:

- no mapa, com um destaque discreto no avatar;
- na interface React, com estado legivel na lista/painel de pessoas.

O indicador deve depender do estado de fala vindo da camada de midia quando disponivel. Se o estado nao existir, a interface deve continuar funcionando sem quebrar.

### Controle de microfone

O botao de microfone deve deixar claro se o usuario esta:

- sem midia configurada;
- conectando;
- ativo;
- mutado;
- bloqueado por permissao/erro;
- indisponivel por falha de privacidade acustica.

O comportamento atual de fail-closed continua obrigatorio: em caso de erro de permissao acustica ou politica invalida, o audio deve ser cortado antes de qualquer otimizacao visual.

### Audio espacial estereo

O cliente deve calcular pan estereo com base na posicao relativa entre o usuario local e cada participante remoto:

- participante a esquerda: som pende para esquerda;
- participante a direita: som pende para direita;
- participante perto do eixo central: som permanece centralizado.

O volume por distancia e as zonas privadas continuam sendo a base da autorizacao de audio. O pan nao pode permitir audio fora do alcance ou fora da mesma politica acustica.

## Arquitetura

O backend continua sendo a fonte de verdade para:

- posicao dos jogadores;
- proximidade fisica;
- zonas acusticas;
- permissoes de quem pode ouvir quem.

O frontend continua responsavel por:

- assinar/desassinar tracks LiveKit;
- aplicar ganho por distancia;
- aplicar pan estereo;
- exibir estados de fala e microfone.

Regras puras de audio espacial devem ficar isoladas em modulo testavel no frontend, sem acoplar calculo matematico diretamente ao componente React ou ao controlador LiveKit.

## Dados e fluxo

1. O servidor envia snapshot de mundo e snapshot acustico personalizado.
2. O cliente valida a politica acustica.
3. O controlador de midia calcula quais participantes continuam audiveis.
4. Para cada participante audivel, o cliente calcula volume e pan usando posicoes atuais.
5. A UI e a cena Phaser recebem estados derivados: falando, mutado, ativo e audivel.

Estados antigos ou invalidos devem ser ignorados de forma conservadora.

## Fora de escopo desta entrega

Estes itens continuam planejados para fases futuras, mas nao entram agora:

- push-to-talk;
- compartilhamento de tela por proximidade;
- editor de mapa/admin god mode;
- loja de customizacao;
- boss fight de pull requests;
- war room com Sentry;
- scripts locais tipo Jarvis;
- audio 3D completo com simulacao de ambiente.

## Testes e validacao

Devem ser validados:

- calculo de pan para esquerda, centro e direita;
- preservacao do volume/distancia ja existente;
- bloqueio acustico continua cortando audio;
- estados de microfone continuam consistentes;
- indicador de fala nao quebra quando a midia esta indisponivel;
- build, typecheck, lint e testes automatizados.

Validacao visual recomendada:

- abrir duas abas;
- conectar audio quando possivel;
- mover um avatar para esquerda e direita;
- verificar indicador de fala, estado de mic e ausencia de erros no console.

## Criterios de aceite

- O usuario entende rapidamente se o microfone esta ativo, mutado ou indisponivel.
- Avatares de pessoas falando recebem destaque visual discreto.
- Participantes audiveis ganham pan estereo coerente com a posicao no mapa.
- Participantes fora da politica acustica continuam inaudiveis.
- Nenhuma dependencia paga e nenhum servico novo sao adicionados.
