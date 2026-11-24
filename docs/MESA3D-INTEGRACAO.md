# Integração Mesa3D — operação e evidências

Data: 19/11/2026. Código de origem Mesa3D em `web/UPSTREAM.md`. Especificação e plano aprovados em `docs/superpowers/`.

## Resultado

`web/` é a aplicação ativa: Node >=24, Express, HTML/JavaScript, SQLite e uploads persistentes no servidor. O visual original Mesa3D foi preservado. Recursos PratoAR incorporados: foto durante carga/falha, progresso, retry manual, original como alternativa à variante, detecção WebGL, Quick Look com USDZ correspondente e preparação offline de variantes.

Nenhum aplicativo Windows ou motor precisa ser instalado pelo restaurante. Os diretórios anteriores foram preservados como legado. Não houve migração de dados reais, publicação, contratação, ativação de pagamento ou geração de modelos por fotos. Nenhum `.env` real foi lido ou copiado para preparar a configuração desta integração.

## Verificações executadas

- Node instalado: 24.18.0. `npm ci --prefix web --ignore-scripts` no primeiro bootstrap; lock atualizado com correções compatíveis e ferramentas offline.
- `npm test --prefix web`: 34 testes passando, 0 falhas após correções da revisão independente. Cobertura upstream pertinente preservada: GLB, medidas, revisão/publicação, autenticação, isolamento, convite e cálculo de pedidos.
- Novos testes: reinício com SQLite/uploads existentes; geração desativada mesmo com chave fictícia no ambiente; logout; isolamento de lojas/sacola; campos públicos; invalidação de variantes; URLs seguras; retry e eventos atrasados; WebGL ausente; timers; preparação texturizada, ZIP USDZ com malha e PNG, hash/identidade, rollback; HTTP Range/MIME/cache e URLs antigas.
- `npm audit --prefix web`: zero vulnerabilidades após atualização de multer e body-parser. O lock upstream original apresentava dois alertas altos, corrigidos nesta integração.
- `git diff --check` nos caminhos da integração sem erros. Sintaxe JavaScript verificada com `node --check` nos arquivos próprios. Não há build/TypeScript/linter configurado no Mesa3D; não alegar execução dessas ferramentas.

## Verificação no navegador

Servidor de teste em loopback, porta 4318, banco temporário com contas fictícias. Cardápio manteve `#17352e`, título e cards do Mesa3D. Tela móvel simulada 390×844 sem rolagem horizontal no cardápio, estúdio e visualizador. Login e métricas do estúdio funcionaram. Cadastro de loja/prato, foto, upload GLB, revisão e aprovação foram executados por HTTP no navegador com fixtures.

Foi executada a CLI offline contra esse banco temporário e confirmada associação de GLB otimizado/Draco e USDZ. O navegador carregou o GLB com hash e renderizou. Falha de carga injetada fez a foto reaparecer e habilitou retry; retry carregou o GLB original com sucesso. Identificação iPhone simulada apresentou link `rel=ar` para o USDZ da porção com `allowsContentScaling=0`. Sem WebGL, foto e orientação permanecem.

Isso **não comprova** câmera, Quick Look, Scene Viewer, rastreamento, qualidade visual ou escala em iPhone/Android físicos. Usar HTTPS e aparelho real para essa aceitação. A aprovação da fixture no teste é exercício do contrato HTTP, não aprovação comercial de um prato.

## Revisão independente e correções

Uma revisão independente final não encontrou problemas críticos e apontou dois importantes: getter de localStorage bloqueado derrubava o cardápio; espera pela biblioteca model-viewer impedia até a foto quando o vendor falhava. Ambos foram reproduzidos com regressões falhando antes da correção e passaram depois. A sacola agora degrada para vazia se storage estiver bloqueado. A página carrega metadados/foto/link nativo independentemente da biblioteca, com limite de espera e nova tentativa de carregar o visualizador.

Também verificado em Chrome: getter de localStorage lançando SecurityError manteve o cardápio; proxy de teste retornando 503 em `/vendor/` manteve nome, foto, mensagem e retry. Não houve achados menores adiados. Fora da validação: aparelhos físicos, hospedagem pública, pagamentos reais, restauração dos dados reais ausentes e autenticação individual de URLs de mídia públicas, conforme limites desta entrega.

Decisões de execução: alterações feitas no workspace existente, restritas ao PratoAR e à nova pasta web, porque a raiz Git é a pasta do usuário; risco controlado por caminhos explícitos e preservação das alterações alheias. O registro de execução usou PowerShell dentro do projeto em vez dos helpers Bash ancorados nessa raiz, com commits e evidências como registro. Comparação geométrica das variantes usa bounds decodificados em vez de AABB conservador rotacionado; não equivale a comprovação de escala física.

## Preparação e limites

Ferramenta em `web/tools/prepare-model-assets.mjs`: não reconstrói fotos e não chama geração paga. Trabalha com o GLB calibrado e aprovado da porção. Mantém original, gera arquivos por hash e associa em transação somente se identidade/bytes continuarem iguais. Catálogo antigo sem metadados continua usando original.

Otimização compara geometria decodificada antes/depois. O cálculo de bounds por AABB do código original pode ser conservador em malhas rotacionadas; essa comparação não é prova de tamanho físico. USDZ suporta somente materiais/malhas compatíveis; normais podem ser calculadas e superfícies exportadas como frontais, com registro nos créditos. Não há garantia de fidelidade total do material. Interrupção pode deixar arquivos preparados sem referência, mas não publica referência parcial nem apaga o modelo anterior.

Arquivos em `/media/` são públicos por URL opaca, como no Mesa3D original, para permitir acesso do visualizador AR nativo sem cookie. Não armazenar documentos ou segredos em uploads. Rascunhos não aparecem no cardápio público, mas conhecer uma URL de mídia já existente permite acessá-la; não equivale a storage privado autenticado.

## Uso de dados reais

O banco e o `.env` reais não foram fornecidos. Siga `web/README.md` para backup e restauração consistente, preservando usuários, slugs, IDs, catálogo, pedidos, uploads e chave de criptografia existente. Não redefinir contas pelo bootstrap nem copiar SQLite em escrita ignorando WAL. Não há novo banco remoto obrigatório.

URLs e QR Mesa3D são preservados. `/cardapio/{slug}` aponta ao menu correspondente. URLs antigas de pratos PratoAR sem mapa de IDs retornam 404 com orientação; não abrem outro prato por aproximação.

## Hospedagem

Nenhuma implantação foi feita. É necessário um servidor Node com disco persistente e HTTPS. Não usar SQLite no filesystem efêmero das funções Vercel. Hospedagem gratuita disponível à conta ainda precisa ser validada. Executar localmente não atualiza o domínio Vercel antigo.

Nota de distribuição: os caminhos web/ deste documento correspondem à raiz do repositório Mesa3D; o manual local é OPERACAO.md.
