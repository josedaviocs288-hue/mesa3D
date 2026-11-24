# Integração Mesa3D e PratoAR — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Entregar uma aplicação web Mesa3D com SQLite existente, visual preservado e melhorias de AR do PratoAR, sem aplicativo Windows obrigatório.

**Architecture:** Importar Mesa3D para `web/`, mantendo Express, HTML/JavaScript e SQLite. Integrar funções de modelos e AR em módulos pequenos, preservando contratos e dados existentes. Os diretórios anteriores permanecem como legado fora da execução padrão.

**Tech Stack:** Node.js >=24, Express 5, node:sqlite, model-viewer, multer, qrcode, node:test; ferramentas de preparação de modelos como dependências de desenvolvimento.

**Spec:** `docs/superpowers/specs/2026-11-19-integracao-mesa3d-design.md` — ler integralmente antes de executar.

## Global Constraints

- Não exigir Supabase, PostgreSQL ou a criação de outro banco: aproveitar a persistência SQLite já implementada pelo Mesa3D.
- Não apagar modificações locais existentes nem dados para efetuar a substituição.
- Não baixar binários de reconstrução nem exigir instalação local.
- Não configurar credenciais financeiras, iniciar cobranças ou ativar Meshy.
- Nenhum `.env`, banco, upload real, sessão ou chave entra no Git.
- Não provisionar infraestrutura, ativar serviços pagos, abrir túnel público ou publicar automaticamente.
- Cache imutável somente para arquivos versionados por conteúdo; não adicionar cache offline de APIs, sessões ou uploads privados.
- Testes desktop com identificação iPhone não comprovam câmera, rastreamento, aparência ou escala em iPhone físico.
- Todos os comandos abaixo usam a raiz PratoAR como diretório de trabalho, salvo indicação explícita. Confirmar `git rev-parse --show-toplevel`: atualmente retorna a pasta do usuário. Staging/commit exclusivamente dos arquivos desta tarefa, nunca `git add .` ou limpeza abrangente. Commits devem usar caminhos explícitos e não incluir staging alheio.
- Referência Mesa3D fixada: `bba11fcf87a20349e7c27149028fa9724e23ce5b`. Não executar scripts recebidos antes de inspecioná-los. Não substituir configuração global ECC.

## Review Focus

1. Catálogo SQLite anterior sem campos de variantes: abre sem perda e continua mostrando foto/GLB original — tarefa 3.
2. Duas lojas com prato de mesmo identificador e sacola persistida: nenhuma informação/pedido atravessa a loja selecionada — tarefa 2.
3. Troca rápida de porção durante carregamento: eventos antigos não liberam AR nem trocam a foto da seleção nova — tarefa 4.
4. Mudança de medidas enquanto variantes eram preparadas: associação antiga é rejeitada e arquivos originais não são apagados — tarefa 3.
5. Queda do processo durante preparação: catálogo não referencia saída incompleta, e reinício preserva o modelo publicado anterior — tarefa 5.

## Mapa de arquivos

- `web/server.js`, `web/platform.js`, `web/glb.js`, `web/public/*`: implementação Mesa3D importada, com ajustes pontuais; preservar estrutura e estilo.
- `web/UPSTREAM.md`: origem, SHA, inventário importado, atribuições e diferenças.
- `web/features.js`: capacidades efetivas; geração indisponível nesta entrega.
- `web/model-assets.js`: identidade de modelo, seleção/invalidação de variantes e projeção pública segura.
- `web/public/ar-capabilities.js`: seleção de modo AR e verificação de WebGL.
- `web/public/viewer-controller.js`: estado do visualizador e recuperação, separado da renderização do restante da página.
- `web/tools/prepare-model-assets.mjs`: CLI offline de otimização e USDZ.
- `web/tests/helpers/server.js`: subprocessos HTTP com ambiente e diretório de dados temporários.
- `web/tests/{web-runtime,web-policy,model-assets,viewer-controller,asset-preparation,model-delivery}.test.js`: testes novos por responsabilidade; conservar também a cobertura upstream relevante.
- `.gitignore`, `README.md`, `web/README.md`, `docs/MESA3D-INTEGRACAO.md`: proteção de dados, execução única, evidências e limitações.

## Task 1: Importar e iniciar o web Mesa3D isoladamente

**Files:** criar `web/` com arquivos de aplicação/testes da revisão fixada; criar `web/UPSTREAM.md`, `web/tests/helpers/server.js`, `web/tests/web-runtime.test.js`; modificar `.gitignore`.

**Interfaces:** consumir as rotas upstream `/api/health`, `/api/state`, `/acesso.html`, `/studio.html`. Produzir helper `startServer({dataDir, env = {}}): Promise<{baseUrl, stop}>`, que usa porta efêmera em loopback, ambiente permitido explícito e encerra o processo com limpeza. Nunca herdar credenciais reais para os testes.

- [x] Inspecionar árvore e testes upstream; importar somente aplicação, assets, ferramentas necessárias e testes pertinentes. Não importar instaladores, túneis, bancos, `.env` real, uploads reais ou configuração Git upstream. Registrar arquivos e hash em `UPSTREAM.md`; preservar avisos de licença disponíveis.
- [x] Escrever testes `demoWithoutEnv` e `dataSurvivesRestart` em `web-runtime.test.js`: health 200, cardápio contém marca/cores originais, administração sem sessão bloqueada; inserir registro fixture com `openPlatform`, reiniciar servidor e confirmar mesmo ID/catalog e upload fixture. Fixtures não usam dados reais.
- [x] Executar `node --test web/tests/web-runtime.test.js`; confirmar falha por runtime/helper ainda incompletos antes das adaptações.
- [x] Completar helper e configuração de execução. Preservar startup upstream, Node >=24 e script `npm start`; acrescentar ignores `web/node_modules/`, `web/data/`, `web/.env*` com exceção para `web/.env.example`, e arquivos SQLite/WAL/SHM sob `web/`. Preparar configuração exemplo fictícia sem serviços externos.
- [x] Executar `npm ci --prefix web` após inspeção de scripts; se o lock não corresponder ao pacote ajustado, atualizar lock com npm e explicar a alteração. Rodar `node --test web/tests/web-runtime.test.js`, esperando PASS.
- [x] Commit restrito: `feat: add Mesa3D web runtime`.

## Task 2: Manter operação web segura e desativar geração

**Files:** criar `web/features.js`, `web/tests/web-policy.test.js`; modificar `web/server.js`, `web/public/{common,menu,studio,laboratorio-3d}.js`, `web/public/laboratorio-3d.html` e testes upstream afetados.

**Interfaces:** `getFeatures(): {local3d:false, meshyConfigured:false}`. Manter `/api/lab/analyze` autenticado. `/api/local3d/status` responde autenticado com `{ready:false, enabled:false}`; demais rotas de geração retornam 503 com código `RECONSTRUCTION_DISABLED` após autenticação, antes de upload, fila ou chamada externa. Não oferecer opção de ativação nesta entrega.

- [x] Escrever `generationNeverStarts`, `twoRestaurantIsolation`, `cartIsScopedToRestaurant`, `serverCalculatesOrderPrice`, `publicStateHidesDrafts` e `logoutRevokesSession`. Usar duas lojas temporárias e testar leitura/escrita cruzada, rascunhos e preço adulterado pelo navegador; exigir rejeição/valor do catálogo conforme o caso.
- [x] Rodar `node --test web/tests/web-policy.test.js`; confirmar as falhas de capacidades/isolamento que precisem de ajuste e conservar testes upstream já verdes.
- [x] Retirar inicialização de Local3D e dependência de binários do startup. Aplicar capacidades no servidor e interfaces. Ocultar ações de geração/pagamento não configurado; laboratório mantém inspeção GLB. Login protege todas as mutações; estado público usa lista explícita de campos permitidos. Sacola usa chave por restaurante, descartando entradas que não pertençam ao catálogo atual. Não alterar esquema de pedidos nem Mercado Pago configurável herdado.
- [x] Rodar testes novos e `npm test --prefix web`. Ajustar apenas testes upstream que exigiam instaladores/geração ativa, retirando-os do escopo ativo com justificativa em `UPSTREAM.md`; conservar testes de GLB, servidor e laboratório.
- [x] Commit restrito: `feat: enforce browser-only operation and disabled reconstruction`.

## Task 3: Associar variantes ao modelo e às medidas corretas

**Files:** criar `web/model-assets.js`, `web/tests/model-assets.test.js`; modificar `web/server.js` nos fluxos de cadastro, upload, aprovação, remoção e projeção pública.

**Interfaces:** `modelIdentity(modelUrl, dimensions, upAxis): string`, serialização determinística de URL e dimensões numéricas normalizadas; `selectModelAssets(portion): {originalUrl, webUrl, posterUrl, iosUrl}`; `invalidateModelAssets(portion): void`. Campo opcional `portion.modelAssets = {identity, sourceSha256, webUrl, posterUrl, iosUrl, credits}`. Modelo sem metadados usa `modelUrl` e foto atuais. `iosUrl` somente se identidade corresponder, modelo aprovado e URL local permitida. Metadados não são aceitos diretamente de cliente comum.

- [x] Escrever `oldCatalogUsesOriginal`, `changedDimensionsInvalidateAssets`, `changedModelInvalidatesAssets`, `otherPortionCannotBorrowUsdz`, `draftNeverExposesAssets` e `unsafeAssetUrlRejected`. Exigir ausência de `iosUrl` para identidade divergente; não reutilizar USDZ do exemplo.
- [x] Executar `node --test web/tests/model-assets.test.js`, esperando falha por módulo inexistente.
- [x] Implementar funções puras; guardar extensão dentro do JSON de catálogo existente, sem novo banco/tabela. Invalidar em alteração de dimensões/eixo/modelo/fotos, preservar metadados em alteração só de texto/preço. A revisão é reaberta conforme política existente. Projeção pública exclui origem interna, jobs e variantes não aprovadas; validação impede URLs externas/arbitrárias.
- [x] Rodar `node --test web/tests/model-assets.test.js web/tests/web-runtime.test.js web/tests/web-policy.test.js`, esperando PASS, incluindo reinício de catálogo legado.
- [x] Commit restrito: `feat: bind model variants to calibrated portions`.

## Task 4: Incorporar recuperação 3D e AR móvel

**Files:** criar `web/public/ar-capabilities.js`, `web/public/viewer-controller.js`, `web/tests/viewer-controller.test.js`; modificar `web/public/{ver.html,view.js,styles.css}`.

**Interfaces:** `isAppleMobile(userAgent, platform, touchPoints): boolean`; `supportsWebGl2(canvas): boolean`; `createViewerController({viewer, photo, feedback, retryButton, arButton, quickLookLink, detectCapabilities}): {select(portion), retry(), launchAr(), destroy()}`. Cada seleção recebe token crescente; ignorar eventos/async antigos. Consumir seleção pública da tarefa 3. Sem importar React, Next ou bibliotecas Supabase.

- [x] Escrever testes `noWebGlKeepsPhoto`, `androidRequiresClick`, `matchingUsdzUsesNativeLink`, `staleLoadIgnored`, `failedOptimizedModelRetriesOriginal`, `contextLossRestoresPhoto` e `destroyClearsTimers`. Usar elementos/eventos simulados sem fingir abertura de câmera real.
- [x] Rodar `node --test web/tests/viewer-controller.test.js`, esperando falha por módulos inexistentes.
- [x] Implementar seleção segura, poster visível até renderização, progresso de eventos reais, timeout de feedback em 25 segundos e retry manual. Antes de trocar porção, limpar timers, estado e recursos da anterior. Android chama AR apenas no gesto; iPhone com USDZ validado recebe `rel=ar` e `#allowsContentScaling=0`; sem preparado mantém alternativa model-viewer. Falha de carga da variante oferece original; perda de WebGL restaura foto. Destruir controller ao sair.
- [x] Integrar com seletor de porção e comparação Mesa3D sem alterar sua identidade visual. Configurar decoder local antes de atribuir variante Draco; manter link nativo utilizável sem GLB carregado.
- [x] Rodar testes do controller e conferir no navegador desktop/mobile: troca rápida de porções, falta de WebGL, erro/timeout, retry e seleção iPhone simulada. Esperar foto contínua e nenhuma abertura Android automática. Registrar que não comprova AR física.
- [x] Commit restrito: `feat: improve mobile AR and model recovery`.

## Task 5: Preparação offline e entrega HTTP de variantes

**Files:** criar `web/tools/prepare-model-assets.mjs`, `web/tests/asset-preparation.test.js`, `web/tests/model-delivery.test.js`; modificar `web/package.json`, lock, `web/server.js`, `web/UPSTREAM.md`; adicionar decoder local e avisos de licença em `web/public/decoders/draco/`.

**Interfaces:** CLI `node web/tools/prepare-model-assets.mjs --data-dir <fixture-or-authorized-path> --restaurant <id> --dish <id> --portion <id>`. Exportar `prepareModelAssets({sourcePath, dimensions, outputDir}): Promise<{sourceSha256, webUrl, iosUrl, credits}>`; execução de CLI protegida por entrypoint, sem disparar ao importar em testes. Consumir identidade da tarefa 3. Geração USDZ usa exportador oficial Three offline; não exige serviço/Python no runtime. Nenhum arquivo novo é apresentado como USDZ validado se exportação/inspeção falhar.

- [x] Escrever `preparedModelKeepsBounds`, `preparationFailureDoesNotPublish`, `staleIdentityRefusesAttach`, `immutableOnlyForHashedVariants`, `rangeAndMimeAreCorrect` e `traversalCannotReadOutsideMedia`. Usar GLB fixture com textura e dimensões conhecidas, jamais baixar dados de usuário.
- [x] Rodar `node --test web/tests/asset-preparation.test.js web/tests/model-delivery.test.js`, esperando falha nos contratos novos.
- [x] Adaptar técnicas dos scripts PratoAR com glTF Transform, Draco, sharp e exportador USDZ Three, como devDependencies. Preservar triângulos; verificar bounds/base antes de anexar. Arquivos SHA-256 versionados são gravados em temporário e renomeados atomicamente. Depois revalidar identidade/hash da origem dentro da transação SQLite antes de anexar; concorrência ou erro deixa catálogo anterior intacto. Registrar dimensões, créditos e mudanças; não importar automaticamente exemplos de outra licença/porção.
- [x] Ajustar entrega para `model/gltf-binary` e `model/vnd.usdz+zip`, Range 206, decoder JS/WASM e cache imutável apenas em nomes hash produzidos. Manter cache seguro para URLs mutáveis. Erros não retornam HTML como modelo.
- [x] Rodar testes de preparação/HTTP e suítes de modelos. Conferir arquivos USDZ com parser ZIP e conteúdo de unidade/escala, registrando limitações do material exportado. Se uma preparação falhar, o original permanece utilizável e erro é explícito.
- [x] Commit restrito: `feat: prepare and serve calibrated model variants`.

## Task 6: Tornar Mesa3D o produto ativo e verificar a integração

**Files:** modificar `README.md`, `web/README.md`; criar `docs/MESA3D-INTEGRACAO.md`, `web/public/cardapio-legado.html`; modificar `web/server.js` para orientação de URLs antigas e `web/tests/web-runtime.test.js` para seus contratos. Manter arquivos legados sem exclusão.

**Interfaces:** URLs upstream continuam idênticas. `/cardapio/:slug` pode direcionar ao cardápio `/?loja=<slug>` validado; `/cardapio/:slug/:id` e descendentes não têm mapa de IDs e respondem 404 com página orientando abrir o cardápio daquele slug, sem selecionar prato fictício. Nenhuma redireção de IDs numéricos para UUIDs por posição.

- [x] Escrever teste HTTP `legacyDishDoesNotOpenUnrelatedDish`: URL antiga recebe 404 com orientação, sem dados de outro restaurante; QR upstream mantém destino. Rodar `node --test web/tests/web-runtime.test.js`, confirmar falha, implementar handlers antes do fallback estático e repetir esperando PASS.
- [x] Reescrever README principal com `cd web`, `npm ci`, `npm start`, localhost:8080, Node >=24, persistência e ausência de instalação no restaurante. Explicar configuração administrativa e uso de banco existente sem solicitar segredos no chat. Documentar backup consistente: parar servidor antes de copiar banco e uploads, restaurar juntos em diretório isolado e ensaiar leitura antes de troca. Documentar proteção e localização do `.env` e chave de criptografia existente.
- [x] Identificar frontend/desktop/backend/worker anteriores como legado; atualizar links ativos de execução/distribuição sem tocar nas modificações alheias existentes. Registrar que Vercel Functions não é destino SQLite persistente e que não houve deploy ou contratação.
- [x] Executar `npm test --prefix web` e `git diff --check -- web README.md .gitignore docs/MESA3D-INTEGRACAO.md`. Revisar alterações com a skill ECC `security-review` e executar verificações pertinentes de `verification-loop`; corrigir problemas encontrados e repetir somente checks afetados.
- [x] Conferir cardápio, busca, categoria, sacola, acesso, estúdio, laboratório e visualizador em desktop e viewport móvel; comparar com arquivos visuais upstream. Testar login, dois restaurantes, upload/revisão/QR e pedido na mesa com dados temporários. Usar ferramentas de navegador disponíveis; não instalar automação de teste só para screenshots. Registrar comandos, resultados e limites em `docs/MESA3D-INTEGRACAO.md`.
- [x] Confirmar ausência de credenciais/dados no diff e que o produto inicia sem serviços externos. Fazer commit restrito `docs: make Mesa3D the active browser application` e relatar estado local, limitações de hospedagem e teste físico pendente.

## Revisão do plano

Cobertura: tarefas 1/6 tratam organização, execução, URLs e documentação; 2 cobre contas, pedidos, custo zero e geração; 3/5 cobrem persistência e identidade de variantes; 4 cobre fluxo móvel e falhas. As cinco condições do Review Focus têm testes nas tarefas responsáveis. Não há migração Supabase, implantação, exclusão do legado ou ativação de processamento neste plano.

## Método de execução

Recomendação: execução nativa nesta conversa, seguindo `superpowers:executing-plans`, porque as seis tarefas dependem dos contratos do mesmo servidor e visualizador. O usuário aprovou o plano; seguida execução nativa recomendada nesta conversa, com uma revisão independente final. Tarefas 1–6 implementadas e verificadas; resultados em docs/MESA3D-INTEGRACAO.md.
