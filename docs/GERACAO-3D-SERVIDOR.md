# Mesa3D: preparação e operação da geração no servidor

Implementação de 23/11/2026. **Desativada por padrão; nenhum servidor foi publicado ou habilitado.**

## Componentes implementados

- Site Express em `web/`, com rotas autenticadas `/api/reconstruction/*`.
- Fila durável SQLite: `reconstruction_jobs` e `reconstruction_workers`, adicionadas sem substituir dados existentes.
- Worker Node separado: `web/tools/reconstruction-worker.mjs`.
- Adaptador Python: `worker-3d/scripts/mesa3d-job.py`, reutilizando fotos → COLMAP/OpenMVS → segmentação/Blender. O cliente Supabase antigo não é usado.
- Laboratório com seleção de fotos, disponibilidade real, etapas, cancelamento, prévia privada e publicação explícita.
- Preparação de GLB web/USDZ após aprovação em tarefa distinta. O GLB aprovado continua disponível se a preparação falhar.

O computador do restaurante só precisa do navegador. O motor deve estar instalado **no servidor**, não no computador do cliente.

## Ambiente exigido antes de habilitar

Um host Linux com Node >=24, Python e o runtime fixado por `worker-3d/sources.lock.json`. O perfil de isolamento desta integração é `lan`, com runtime em `/opt/pratoar-...`, venv, OpenMVS e pesos MobileSAM já conferidos. O nome histórico do perfil não significa processar no computador do restaurante; aqui ele limita os mounts do sandbox no servidor.

Não usar o perfil `standard`, que permite leitura ampla da raiz, para esta integração. O adaptador Node força o perfil restrito, e o Python recusa o restante. Não habilitar contêiner privilegiado, SYS_ADMIN nem desativar namespaces/proteções para contornar falha do preflight.

O diagnóstico conservador exige pelo menos **8 GiB de memória efetiva e 12 GiB livres** no volume de dados. Uma tarefa tem limite de scratch de 10 GiB e prazo de uma hora; esses números não garantem qualidade ou desempenho. Medir uma captura real e validar os limites do serviço no host antes de aceitar o ambiente. Usar supervisor/cgroup para o processo worker, com limites de CPU, memória, processos e disco e encerramento de todo o grupo ao parar o serviço.

Web e worker compartilham **o mesmo disco local e banco SQLite**. Não montar SQLite em NFS ou filesystem efêmero de funções Vercel. Executar uma instância do site no piloto; o bloqueio de upload em andamento é por restaurante e por processo HTTP. As aquisições de trabalho entre workers são serializadas por transação SQLite.

## Instalação e configuração

1. Disponibilizar `web/` e `worker-3d/` no servidor, preservando sua relação de diretórios ou definindo `MESA3D_PIPELINE_ROOT` explicitamente.
2. Instalar as dependências do Node com `npm ci` dentro de `web/`. O worker de variantes também precisa das dependências de preparação atualmente em devDependencies; não usar `--omit=dev` nesse ambiente do worker. Não executar ferramentas de instalação Windows do restaurante.
3. Preparar o runtime Linux seguindo os locks e instruções existentes de `worker-3d/`, sem serviços de geração externos. Runtime/contêiner precisa de validação real; não há host gratuito confirmado por esta entrega.
4. Definir, em configuração privada, os caminhos e valores abaixo. Não enviar credenciais no chat ou versionar o `.env` real.

| Variável | Uso |
| --- | --- |
| `MESA3D_DATA_DIR` | Mesmo diretório persistente para SQLite, uploads e capturas privadas nos dois processos |
| `MESA3D_PUBLIC_ORIGIN` | Origem HTTPS canônica, sem credenciais, caminho, query ou fragmento |
| `RECONSTRUCTION_ENABLED` | `false` até concluir a validação e a aceitação do host |
| `RECONSTRUCTION_RUNTIME_DIGEST` | Digest exato produzido pelo novo adaptador no host validado |
| `MESA3D_PIPELINE_ROOT` | Caminho absoluto da pasta `worker-3d` no servidor |
| `MESA3D_PYTHON` | Executável Python do runtime/venv validado; padrão `python3` |
| `PRATOAR_LAN_RUNTIME_ROOT` | Runtime isolado em `/opt/pratoar-...` |
| `PRATOAR_SEGMENTATION_WEIGHTS` | Pesos MobileSAM correspondentes ao lock |
| `MESA3D_WORKER_ID` | Identificador estável do processo worker; padrão `server-worker` |

O processo Python recebe apenas as variáveis necessárias ao pipeline; não herda senhas, tokens de pagamento ou credenciais de banco do site. O worker não precisa das credenciais de bootstrap `OWNER_*` nem da chave para decifrar pagamentos. Configure ambientes separados para os processos.

## Validação e aceitação do host

Primeiro, executar preflight e uma reconstrução controlada por linha de comando com uma captura autorizada e medidas conhecidas. Esses comandos são para o **servidor preparado**, não para ativação automática nesta máquina:

```bash
cd /caminho/worker-3d
export PYTHONPATH="$PWD"
export PRATOAR_SANDBOX_PROFILE=lan
# Os caminhos do runtime e pesos precisam estar configurados no ambiente privado.
python scripts/mesa3d-job.py --preflight
python scripts/mesa3d-job.py --job-dir /caminho/captura-privada --width-cm 30
```

O job-dir deve conter `manifest.json` versão 1 e `photos/`, com 30–100 nomes UUID `.jpg`/`.png`, como os produzidos pelo upload da aplicação. Não aceitar um ZIP arbitrário vindo do navegador. A largura de 30 cm acima é apenas exemplo; usar a medida real da captura. O comando exige o isolamento válido e gera `model.glb` e `poster.png` dentro da tarefa.

Depois de validar runtime, recursos, resultado e custo zero do ambiente, o operador pode criar **privadamente** `MESA3D_DATA_DIR/reconstruction-acceptance.json` com:

- `accepted`: booleano de aceite explícito;
- `runtimeDigest`: digest real retornado pelo adaptador, igual ao da configuração;
- `captureSha256`: SHA-256 real da captura de aceitação;
- `acceptedAt`: data/hora ISO válida de quando ocorreu o aceite.

Não há comando nesta entrega que invente esse aceite. Um arquivo de exemplo não substitui teste real. A aplicação também exige Linux, espaço/memória mínimos, origem HTTPS e heartbeat recente de worker compatível; `RECONSTRUCTION_ENABLED=true` isoladamente não libera a função.

Em seguida, pode-se habilitar o piloto autenticado no host aceito e iniciar os dois processos pelo supervisor:

```bash
# Dentro de web/, com o ambiente privado correspondente carregado:
npm start
npm run worker
```

O comando do worker deve ser outro processo/serviço, não uma requisição HTTP nem uma aba do navegador. O comando `npm run worker:diagnose` só imprime as razões de prontidão; não gera um modelo nem comprova a aceitação física.

Antes de abrir a operação comercial, testar o fluxo HTTP completo com usuário do restaurante, captura real, revisão e publicação. Depois conferir os modelos no Safari/Quick Look e Android físicos. Aprovação de unidade/mocks não equivale a essa aceitação.

## Verificação do domínio publicado

```bash
cd web
npm run check:delivery -- https://seu-dominio
```

A ferramenta recusa HTTP, localhost, credenciais na URL e redirecionamentos inesperados no modo público. Confere catálogo, arquivos GLB/USDZ publicados, assinatura, MIME, Range 206, biblioteca e decoder locais. Se não houver modelo publicado, falha explicitamente. Para testes locais, existe `--local-test`, permitido somente em loopback.

O site deve ser acessado no domínio HTTPS canônico para compartilhar QR. Quando `MESA3D_PUBLIC_ORIGIN` estiver configurada, a rota de QR recusa URLs de outra origem. Câmera, rastreamento, escala e fidelidade precisam de aparelho real; o relatório HTTP mantém `physicalArVerified:false`.

## Fila, revisão e falhas

- Uma tarefa pesada por vez; lease de cinco minutos, heartbeat de 30 segundos, duas tentativas para erros recuperáveis.
- Cada tentativa usa pasta própria, evitando que um processo antigo sobrescreva os arquivos de uma execução retomada.
- Fotos: 30–100 JPG/PNG, 12 MiB por arquivo e 300 MiB total. Assinatura é verificada no upload; decodificação, dimensões, qualidade, duplicatas e expansão são verificadas no pipeline isolado.
- Capturas e prévias em `reconstruction-private/`, fora de `public/` e `/media/`. Endpoints de acesso exigem sessão e pertencimento ao restaurante; resposta não deve ser colocada em cache público.
- Cancelamento em execução mantém a vaga ocupada enquanto o processo é interrompido. O worker verifica cancelamento e lease antes de anexar um resultado.
- Alterações de modelo, fotos ou medidas invalidam a identidade anterior. Resultado obsoleto não substitui o publicado.
- A revisão verifica a política de proporções do Mesa3D, sem deformar o prato para forçar medidas. Pode exigir corrigir medidas ou refazer captura; fotogrametria não garante resultado comercial para qualquer alimento.
- Somente aprovação explícita torna o novo GLB público. Os modelos anteriores não são apagados pela fila.
- Entradas e prévias de tarefas concluídas, falhas ou canceladas são removidas após sete dias pelo worker, apenas em diretórios UUID próprios. Tarefas aguardando revisão ficam privadas até revisão/descarte. Não há coleta automática de arquivos legados desconhecidos.

A retenção roda antes da verificação de capacidade que bloqueia novas tarefas, para poder recuperar espaço de tarefas já vencidas. Também pode ser executada sem iniciar geração: `node tools/reconstruction-worker.mjs --cleanup`. A listagem por prato/porção filtra no servidor antes do limite de resultados e prioriza tarefas ativas, evitando esconder uma revisão antiga.

O worker deve terminar uma tarefa ativa ao receber parada pelo supervisor; use encerramento do grupo/cgroup como limite externo de segurança. Se o processo cair, a tarefa volta a ser elegível após expirar o lease. Não apagar banco ou diretórios manualmente para “destravar” a fila.

## Backup e rollback

Parar site e worker antes de fazer cópia consistente de **todo** o diretório de dados, incluindo SQLite/WAL, uploads, capturas e aceite. Restaurar primeiro em ambiente isolado. Não trocar chave de criptografia financeira existente.

Para suspender novos trabalhos, definir `RECONSTRUCTION_ENABLED=false` no ambiente e reiniciar os processos controladamente. Status, consulta de tarefas e cancelamento continuam acessíveis; importação manual e modelos já publicados permanecem disponíveis. Não desabilitar autenticação ou limpar o banco como rollback.

## Evidência local e limites desta entrega

Foram testados fila/lease/repetição, cancelamento, entradas privadas, isolamento entre lojas, revisão obsoleta, preservação do modelo, worker com executor de teste e verificação HTTP real de entrega dos modelos existentes. O adaptador Python valida e monta captura sem depender de Supabase; os testes de fotos usam decodificação real de imagens.

Nesta máquina Windows, o preflight do novo adaptador recusa `SANDBOX_UNAVAILABLE`, como esperado. Não foi executada uma reconstrução nova neste host nem no servidor futuro; não há digest ou aceite de produção criado. Nenhum serviço pago, túnel ou deploy foi ativado. A conclusão verificável é **integração preparada e testada localmente**, com aceitação no servidor e AR física ainda pendentes.

### Verificação final e revisão

- Suíte Node sequencial: **54 testes aprovados, zero falhas**.
- Testes Python de fotos, adaptador e regressões do pipeline: **21 aprovados** em venv de teste isolado, sem executar fotogrametria pesada.
- Auditoria das dependências Node: zero vulnerabilidades na verificação desta rodada.
- Sintaxe Node/Python e diff dos arquivos alterados sem erros.
- Smoke HTTP local: catálogo, dois GLBs, Range/MIME e biblioteca/decoder passaram. O relatório mantém `physicalArVerified:false`.
- Navegador: porção selecionada corretamente no laboratório, fotos/submit bloqueados por prontidão ausente, importação manual disponível e tela de 390 px sem rolagem horizontal.
- Revisão independente: nenhum achado crítico; dois importantes corrigidos com testes inicialmente falhando e depois aprovados (retenção antes de prontidão e visibilidade de tarefa antiga). Nenhum achado menor adiado.

Decisões de execução: mantido o workspace existente com operações Git restritas ao PratoAR, pois a raiz Git é a pasta do usuário; isso evita checkout amplo, mas mantém o histórico da branch existente. Foram versionadas as dependências do motor antes não rastreadas, porque um checkout limpo não conseguiria importar o pipeline sem elas; o custo é um diff maior do código já existente, sem execução de instaladores. O usuário aprovou a especificação e dispensou novas perguntas; o plano foi registrado e executado nativamente, com revisão final independente.

O trabalho ficou local; nenhum merge, push ou atualização automática do PR anterior foi realizado nesta etapa.

## Atualização de entrega — 24/11/2026

O PR #1 foi preparado para incluir esta etapa. No repositório Mesa3D, execute os comandos Node na raiz (web/ é o caminho do workspace original); worker-3d/ fica na raiz. O envio não habilita geração nem publica um servidor.
