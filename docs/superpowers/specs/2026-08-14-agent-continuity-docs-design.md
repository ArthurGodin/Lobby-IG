# Design: documentação de continuidade para agentes

**Data:** 2026-08-14  
**Status:** aprovado para documentação

## Problema

O Lobby-IG está sendo construído por mais de um ambiente de agentes. Sem um ponto de entrada
confiável, cada agente precisa reconstruir o contexto do código, pode refazer decisões já tomadas
e corre o risco de introduzir serviços pagos, reduzir a privacidade da mídia ou quebrar fluxos
existentes.

## Decisão

Usaremos dois documentos versionados, em português:

1. `AGENTS.md` na raiz: instruções obrigatórias e curtas para qualquer agente antes de alterar o
   repositório. Ele aponta explicitamente para o handoff completo e para os comandos de validação.
2. `docs/PROJECT_HANDOFF.md`: fonte de verdade detalhada para continuidade humana e por IA.

O `AGENTS.md` não duplicará explicações extensas. O handoff concentrará o contexto; documentação
existente de arquitetura e specs continuará sendo a fonte histórica de decisões específicas.

## Conteúdo do handoff

O documento detalhado deve conter:

- propósito do produto, público inicial e diferenciação estratégica;
- princípios inegociáveis: navegador leve, custo de software zero no desenvolvimento, privacidade
  por padrão e servidor autoritativo;
- arquitetura atual, responsabilidades de cada pacote e fluxos de tempo real/mídia;
- funcionalidades concluídas e seus limites deliberados;
- comandos de desenvolvimento, validação e publicação;
- riscos conhecidos e pré-requisitos externos, inclusive Docker Desktop para LiveKit local;
- regras de alteração para agentes, convenções de commit e proteção de mudanças do usuário;
- roadmap priorizado, explicitando o que está adiado;
- recomendação flexível de modelos para categorias de trabalho;
- um prompt de início copiável para uma sessão de agente.

## Requisitos de qualidade

- Não conter segredos, credenciais, URLs privadas ou instruções para burlar permissões.
- Distinguir claramente fatos implementados, limitações conhecidas e itens futuros.
- Usar links relativos para os documentos e arquivos relevantes.
- Não prometer custo operacional remoto zero: software é gratuito; infraestrutura pública pode ter
  custo se a empresa não a possuir.
- Ser mantido quando uma decisão arquitetural ou funcional relevante mudar.

## Verificação

- Conferir que os caminhos citados existem.
- Rodar `pnpm format`, `pnpm lint` e `git diff --check`.
- Revisar ausência de placeholders, contradições e conteúdo sensível.

## Fora de escopo

- Configurar Antigravity, instalar plugins ou criar contas externas.
- Duplicar todos os detalhes de cada spec ou transformar o handoff em manual de usuário.
- Criar workflow de CI novo nesta etapa.
