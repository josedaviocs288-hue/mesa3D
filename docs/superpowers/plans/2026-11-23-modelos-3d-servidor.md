# Modelos 3D no servidor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox syntax for tracking.

**Goal:** Conectar fotos → worker real → revisão → GLB/USDZ no Mesa3D, com prontidão verificável e geração desligada por padrão.

**Architecture:** Express e worker Node separados compartilham SQLite e disco local persistente. Worker chama CLI Python do pipeline existente em ambiente Linux validado; não usa o cliente Supabase legado. Prévia e capturas privadas, publicação explícita, preparação de variantes em tarefa separada.

**Tech Stack:** Node 24, Express, SQLite, Python/COLMAP/OpenMVS/Blender/bubblewrap existentes; sem nova API paga.

**Spec:** `docs/superpowers/specs/2026-11-23-modelos-3d-servidor-design.md`.

## Global Constraints

- Usuário aprovou a arquitetura e pediu execução sem novas perguntas; seguir nativamente até concluir, preservando a revisão independente final.
- Desativado por padrão. Não ativar produção, contratar, publicar ou alegar teste real sem servidor validado.
- SQLite/disco persistentes; nenhum novo banco remoto. Preservar dados, modelos publicados e mudanças locais alheias.
- Dados privados não entram em `/media/`, Git ou logs. Não ler `.env` real.
- Limites: 30–100 JPG/PNG; 12 MiB/foto, 300 MiB total; resultado 20 MiB/180 mil triângulos. Lease 5 min, heartbeat 30 s, duas tentativas, 1 h por tentativa; retenção terminal 7 dias.
- Git raiz é pasta do usuário: todos os caminhos de staging/commit ficam dentro do PratoAR. Trabalhar em módulos novos no workspace atual.

## Review Focus

1. Cancelamento em execução não libera a fila antes de interromper o processo: testes de fila/worker.
2. Resultado de tarefa antiga não sobrescreve modelo/medidas alterados: teste de publicação.
3. Upload parcial/inválido e fotos com decompression bomb não ficam públicos: testes HTTP e CLI Python.
4. Worker offline/incompatível ou flag isolada nunca libera geração: teste de prontidão.
5. Preparação USDZ falha sem derrubar GLB aprovado; erros não apagam modelo anterior: testes worker/publicação.

## Task 1: Fila SQLite e prontidão

**Files:** criar `web/reconstruction/{store,readiness,files}.js`, `web/tests/reconstruction-store.test.js`.
**Interfaces:** `ReconstructionStore(db,{now})` fornece `enqueue`, `claim`, `heartbeat`, `finish`, `fail`, `cancel`, `list`, `get`, `presence`; transições cercadas por runToken/lease. `readiness({store,dataDir,env})` retorna enabled/ready/reasons; requisitos reais só no runtime, injetáveis apenas em teste de módulo.
- [x] Escrever e observar falha dos testes para duplicidade, lease, duas tentativas, cancelamento, persistência e flags isoladas.
- [x] Implementar migração aditiva, exclusividade global de execução, identidade/versionamento e diagnóstico fechado por padrão.
- [x] Rodar testes de módulo e regressões SQLite existentes; registrar resultado.

## Task 2: Upload privado e publicação autenticada

**Files:** criar `web/reconstruction/routes.js`, `web/tests/reconstruction-http.test.js`; modificar `web/server.js`/`features.js`.
**Interfaces:** rotas autenticadas `/api/reconstruction/status`, `/api/reconstruction/jobs`, `/api/reconstruction/jobs/:id/{cancel,approve,model,poster}`. Upload por prato/porção, autorização antes de multipart; status/cancelamento/prévia não exigem geração habilitada para consultar tarefas anteriores.
- [x] Testar ausência de sessão, isolamento, acesso privado, multipart inválido e aprovação obsoleta antes de implementar.
- [x] Validar arquivos no disco, limites agregados e assinaturas; só adicionar à fila após upload completo. Aprovação valida modelo, medidas e identidade, preserva original anterior e enfileira variantes.
- [x] Rodar testes HTTP com dados temporários e regressões; falhas de readiness nunca consomem upload grande.

## Task 3: Worker e entrada Python reais

**Files:** criar `web/reconstruction/worker.js`, `web/tools/reconstruction-worker.mjs`, `worker-3d/scripts/mesa3d-job.py`, testes Node/Python correspondentes.
**Interfaces:** `runWorkerOnce({store,dataDir,execute})` com executor de processo real padrão e injeção explícita só em testes. CLI Python `--preflight` ou `--job-dir PATH --width-cm N`; entrada fixa manifest/photos, saída fixa model.glb/poster.png/result.json e progresso JSON por linha.
- [x] Testar falha, cancelamento, heartbeat, resultado inválido e variante isolada; teste Python roda validações sem ferramentas de reconstrução.
- [x] Reutilizar preflight/run_pipeline, ZIP interno seguro e cancelamento/deadline; não importar cliente Supabase. Bloquear perfis que exponham credenciais do servidor ao sandbox.
- [x] Supervisionar subprocesso sem shell, limites de tempo/disco, encerramento de grupo e lease; digest real e presença com status. Não executar pipeline pesado nesta máquina como substituto do servidor futuro.

## Task 4: Interface do restaurante

**Files:** criar `web/public/reconstruction.js`; modificar laboratório, estúdio e folha de refinamentos.
- [x] Usar status real de prontidão, seleção 30–100 fotos, etapas reais, cancelamento, prévia privada e aprovação explícita.
- [x] Não remover importação manual nem inventar porcentagens. Preservar preview publicado em erros e texto de indisponibilidade quando servidor não está pronto.
- [x] Verificar navegação/estado desabilitado e responsividade no navegador com fixture; testes de endpoint cobrem autorização.

## Task 5: Operação e verificação de implantação

**Files:** criar `web/tools/check-model-delivery.mjs`, `docs/GERACAO-3D-SERVIDOR.md`; atualizar scripts/configuração exemplo/documentação.
- [x] CLI de smoke aceita origem HTTPS explícita, valida API pública e modelos/decoders por MIME/Range/assinatura; rejeita origem com credenciais e localhost em modo público.
- [x] Documentar comando do worker, volumes, runtime fixado, aceitação do host, backup, rollback e limpeza terminal restrita.
- [x] Testar smoke com servidor local em modo de teste explícito. Não chamar domínio de produção desconhecido.

## Task 6: Revisão e conclusão

- [x] Rodar suíte Node sequencial, testes Python específicos, sintaxe, audit e diff scoped.
- [x] Uma revisão independente final, correções RED→GREEN necessárias e nova suíte afetada.
- [x] Registrar resultado local e requisitos exatos pendentes do host; marcar passos concluídos somente com evidência. Sem nova pergunta ao usuário.

## Resultado

Implementado localmente. 54 testes Node e 21 Python passaram; revisão final com dois achados importantes corrigidos e nenhum crítico/menor pendente. Aceitação do host Linux, captura real autenticada no servidor, recursos/supervisor, domínio HTTPS público e AR em aparelhos físicos continuam pendentes e não são declarados aprovados. Consulte docs/GERACAO-3D-SERVIDOR.md.
