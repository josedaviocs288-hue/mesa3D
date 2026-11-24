# Mesa3D — visualização, AR e geração por fotos no servidor

Data: 23/11/2026. Estado: aprovada pelo usuário e implementada como preparação local; liberação depende da validação no servidor real.

## Objetivo solicitado

Preparar o produto para que, quando houver um servidor apto a executá-lo, o restaurante envie fotos pelo navegador, acompanhe a reconstrução real, revise o resultado e publique o modelo para exploração 3D e AR. O restaurante não instala motor ou aplicativo Windows. Manter SQLite, visual Mesa3D e exigência de custo zero de infraestrutura/serviços contratados.

## Estado comprovado e lacunas

O web atual já oferece upload/revisão de GLB, entrega de mídia, exploração 3D e seleção de USDZ correspondente. O motor Python existente possui pipeline de fotos → COLMAP/OpenMVS → segmentação/exportação Blender. Há evidência histórica de reconstrução de pizza, com qualidade visual ainda não aprovada comercialmente; não significa que o novo fluxo Mesa3D foi validado.

O `worker-3d/app/client.py` antigo exige rotas de controle PratoAR e URLs Supabase. A API FastAPI de health não é uma API de geração funcional: `/jobs` retorna 410. O web Express atual responde 503 às solicitações de reconstrução. Não basta mudar uma flag para unir essas partes.

## Alternativas

1. **Um servidor, site e worker em processos separados — recomendada.** SQLite e disco persistente locais, com fila durável. Reutiliza o pipeline real sem exigir outro banco, Supabase ou serviço de geração pago. Pressupõe host Linux compatível com isolamento e recursos suficientes.
2. **Site e worker em servidores distintos.** Separa a capacidade de processamento, mas exige protocolo autenticado, transferência segura de capturas e armazenamento acessível entre hosts. Maior escopo e mais dependências operacionais; não faz parte da primeira entrega.

## Arquitetura escolhida para a proposta

Um único host Linux com disco persistente e HTTPS. O site Node/Express recebe requisições, controla autenticação e registra tarefas. Um processo worker separado consulta a fila SQLite e chama uma entrada de linha de comando Python que reutiliza `run_pipeline`. O processo HTTP não executa reconstrução nem fica aguardando sua conclusão.

O servidor pode futuramente usar processos supervisionados ou contêineres com volumes locais consistentes. SQLite não deve estar em filesystem efêmero ou compartilhamento de rede sem validação. Não exige GPU por definição; o host e os tempos reais precisam ser medidos. A configuração histórica de piloto é referência de ensaio, não dimensionamento comercial garantido.

## Fluxo do restaurante

1. Cadastrar prato/porção, foto de apresentação e medidas reais conforme o Mesa3D.
2. Enviar 30–100 fotos JPG/PNG da mesma porção, com sobreposição e vários ângulos. Limites propostos: 12 MiB por foto e 300 MiB no total. Recepção em disco com limite de partes/bytes e limpeza segura de envio incompleto.
3. O backend valida sessão, propriedade do restaurante e arquivos, grava captura privada e cria uma única tarefa ativa por porção.
4. O worker adquire a tarefa, valida ambiente/captura e executa a reconstrução real. O painel mostra etapas reais, sem porcentagem inventada.
5. Resultado recebe validação de GLB, textura embutida e limites móveis atuais de 20 MiB e 180 mil triângulos. A escala é uniforme; não esticar o alimento para forçar dimensões.
6. A prévia fica privada e pendente de revisão. Modelo anterior publicado continua funcionando durante processamento e falhas.
7. O restaurante confere geometria, textura e medidas e testa no aparelho. Resultado incompatível não pode ser publicado como aprovado; deve permitir ajustar medidas ou refazer captura com explicação clara.
8. Somente a ação explícita de aprovação publica a nova versão. Preparação de GLB web/USDZ pode ser feita pelo worker como tarefa distinta, sem bloquear a requisição de aprovação. Enquanto não houver variante válida, o GLB original aprovado continua disponível.

## Fila e recuperação

Adicionar tabelas SQLite de tarefas e presença do worker, sem substituir tabelas existentes. Cada tarefa registra restaurante, prato/porção, tipo, estado, etapa, tentativas, lease, referência privada de entrada/saída e identidade do modelo/medidas capturada na criação.

Estados: aguardando, processando, aguardando revisão, concluída, falhou e cancelada. Uma execução pesada por vez no piloto; heartbeat a cada 30 segundos; lease de cinco minutos; no máximo duas tentativas quando o erro for recuperável. Prazo máximo inicial de uma hora por tentativa, sujeito à validação do host antes de ativação.

Aquisição e transições em transações. Lease vencido pode permitir recuperação; um worker antigo não pode concluir uma execução substituída. Repetição de callbacks/ações não duplica publicação. Reinício do site não perde a fila. Mudança de modelo/medidas durante geração exige reconciliação/revisão, sem sobrescrever a porção silenciosamente.

Cancelar solicita interrupção do processo pesado e impede publicação de resultado atrasado. A política de retenção inicial é sete dias para entradas e prévias de tarefas terminais, com limpeza restrita aos arquivos da tarefa; modelos publicados não entram nessa limpeza. Não apagar entradas em processamento ou dados legados desconhecidos.

## Capturas e segurança

Capturas, arquivos de trabalho e prévias ficam fora de `public/` e `/media/`. Acesso por rota autenticada e vinculada ao restaurante; links opacos públicos não substituem a proteção das fotos privadas. Tarefas e suas entradas não podem ser consultadas entre lojas.

O worker usa nomes/caminhos gerados pelo servidor, sem concatenar parâmetros do usuário em comandos de shell. O parser de fotos valida assinatura, dimensões e limites de descompressão; se houver ZIP interno, rejeitar travessia de diretório, symlinks e bombas de expansão. Preferir produzir o ZIP no servidor a aceitar arquivo arbitrário enviado pelo navegador.

Reutilizar o isolamento do pipeline sem conceder modo privilegiado, SYS_ADMIN ou desativar proteções para fazê-lo funcionar. Subprocessos de reconstrução não acessam rede e só escrevem no diretório da tarefa. Fixar versões/digests das ferramentas e pesos conforme os arquivos de origem já existentes; registrar preflight e erro legível sem vazar segredos ou caminhos internos.

## Visualização e AR na futura hospedagem

Preservar seleção segura de variantes, foto de alternativa, retry e proteção contra falhas da biblioteca/WebGL. Modelos publicados devem permanecer acessíveis no domínio HTTPS ao navegador e ao visualizador AR nativo, com MIME, Range e cache coerentes com o nome/versionamento.

Não embutir localhost nos QR ou URLs públicas. O domínio configurado deve ser validado para gerar links/QR; não confiar cegamente em Host ou cabeçalhos de proxy. Prever verificação pós-implantação de disponibilidade de GLB, USDZ, decoder, headers e correspondência das medidas. Link nativo iPhone somente usa USDZ do mesmo modelo e escala; Android exige gesto real.

Validação desktop não comprova câmera, Quick Look, Scene Viewer, rastreamento ou escala física. Teste com prato e régua em iPhone/Android reais continua como aceite separado.

## Ativação condicionada ao servidor

Desativado por padrão. A capacidade de geração só aparece disponível quando há habilitação administrativa explícita, runtime compatível validado, disco persistente/espaço suficiente, worker com heartbeat recente e versão/digest esperados. Sem esses requisitos, responder indisponibilidade e manter upload manual/visualização disponíveis.

Uma flag isolada não comprova prontidão. O diagnóstico deve distinguir: configuração ausente, worker offline, runtime incompatível, disco insuficiente e processamento disponível. Testes com worker falso validam contratos e recuperação, não geração real.

Não contratar host, chamar API de geração paga, ativar processamento externo, abrir túnel público ou publicar nesta etapa. Não há servidor gratuito validado disponível confirmado. A liberação real exige ambiente acessível e teste autenticado completo com fotos autorizadas.

## Entregáveis propostos

- Módulo de geração no laboratório/estúdio, mantendo a identidade visual atual.
- Fila SQLite durável, uploads privados, status/cancelamento e revisão de resultado.
- Entrada de worker no servidor adaptada ao Mesa3D, reutilizando o pipeline real sem o cliente Supabase antigo.
- Preparação de variantes depois da aprovação, com identidade/hash e preservação do original.
- Diagnóstico de prontidão e teste HTTP de mídia/AR para o domínio futuro.
- Documentação de configuração, inicialização, backup, recuperação e ativação/rollback.

## Critérios de aceite

1. Desativado por padrão e incapaz de iniciar processamento apenas com uma flag quando faltam os requisitos de prontidão.
2. Upload/cancelamento/status/prévia exigem sessão e pertencimento à loja; capturas privadas não podem ser buscadas por `/media/`.
3. Limites e arquivos inválidos rejeitados, sem publicação ou preenchimento artificial de progresso.
4. Fila sobrevive a reinícios; lease vencido, erro recuperável e conclusão tardia não duplicam nem sobrescrevem resultados.
5. Tarefa roda com navegador fechado; cancelamento interrompe e impede associação tardia.
6. Modelo anterior continua visível durante tarefa/falha; somente revisão aprovada altera o publicado.
7. Pipeline real gera GLB texturizado de uma captura autorizada no servidor-alvo, com geometria e escala conferidas. Falha de qualidade exige nova captura, não aprovação automática.
8. GLB/USDZ publicados respondem corretamente por HTTPS e continuam acessíveis ao AR nativo; aceitação física registrada separadamente.
9. Nenhum serviço pago ou novo banco externo ativado; dados existentes preservados.

## Decisão solicitada

O usuário aprovou a arquitetura de um único servidor com site e worker separados, fila no SQLite existente e geração desativada até validação do ambiente. Autorizou a execução sem novas perguntas. Plano e implementação registrados; evidências e limites em `docs/GERACAO-3D-SERVIDOR.md`. Não houve liberação comercial ou validação do servidor futuro.
