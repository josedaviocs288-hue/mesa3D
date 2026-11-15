# Mesa3D v8.3.1 — Correção de detecção e exportação 3D

Esta atualização corrige o diagnóstico de executáveis OpenMVS no Windows 11 e melhora o pipeline COLMAP → OpenMVS → GLB. A correção foi preparada a partir dos logs de teste do OpenMVS x64 v2.4.0.

## Atualizar a v8.3 sem baixar o motor novamente

1. **Feche o Mesa3D**, se ele estiver aberto. Não apague arquivos do projeto.
2. Baixe o pacote `Mesa3D-v8.3.1-correcao-rapida.zip` e **extraia seu conteúdo sobre a pasta PAI que já contém `Mesa3D-Atelier`**. Permita substituir arquivos de mesmo nome. Exemplo: se o projeto está em `C:\Users\nokia\OneDrive\Documentos\trabalho\Mesa3D-v8.3-Linux-Windows-instalador-automatico-beta\Mesa3D-Atelier`, extraia o ZIP em `C:\Users\nokia\OneDrive\Documentos\trabalho\Mesa3D-v8.3-Linux-Windows-instalador-automatico-beta`.
3. Dentro de `Mesa3D-Atelier`, abra **`Conferir-3D-Local.bat`**. Esperado: `[OK] DensifyPointCloud`, `[OK] ReconstructMesh`, `[OK] TextureMesh`, `[OK] colmap` e `[OK] InterfaceCOLMAP`. `CreateStructure` e `TransformScene` são opcionais neste fluxo. A mensagem informa apenas que o motor foi detectado — não que um prato já foi reconstruído.
4. Abra **`Instalar-Mesa3D.bat` novamente**. Ele reaproveita Node.js, OpenMVS e COLMAP já baixados, preserva as credenciais e abre o site. Caso o site estivesse rodando, encerre apenas o servidor Mesa3D antes de reabrir, para carregar o código atualizado.

**Não exclua**: `.env`, `ACESSO-LOCAL.txt`, `data/` ou `.mesa3d/`. Essas pastas/arquivos não fazem parte do ZIP de correção.

Para instalações novas, extraia o ZIP completo v8.3.1 e abra `Instalar-Mesa3D.bat` normalmente.

### Atenção ao OneDrive

Para trabalhos grandes de fotogrametria, recomenda-se uma pasta local fora da sincronização, como `C:\Mesa3D`. Mover uma instalação existente exige preservar `.env`, `data/` e `.mesa3d/` e executar novamente o instalador para atualizar os caminhos absolutos; não apague esses arquivos para tentar corrigir o motor.

## Mudanças técnicas

- Detecção compatível com executáveis Windows que mostram `--help` mas encerram com código 1; códigos de falha de DLL, erros de processo e arquivo ausente continuam sendo rejeitados.
- `Conferir-3D-Local` passa a usar o Node portátil, carregar `.env` e configurar as DLLs como o iniciador principal.
- `CreateStructure` ausente deixa de bloquear a instalação quando COLMAP + `InterfaceCOLMAP` estão disponíveis.
- `TransformScene` é opcional. GLB é exportado pelo `TextureMesh --export-type glb`, conforme suporte informado pelo OpenMVS 2.4.0.
- Pipeline verifica cena intermediária, nuvem densa, malha, GLB, estrutura glTF 2.0, geometria e presença de triângulos. Falhas não geram status de sucesso.
- Limites conservadores para extração de pontos em CPUs com pouca RAM; `.env` gravado em UTF-8 sem BOM no Windows.
- Testes de regressão para o caso do Windows e para dois pipelines com ferramentas simuladas; não são prova de qualidade fotogramétrica real.

## Teste decisivo do 3D (ainda pendente)

Fotografe o mesmo prato IMÓVEL em 25–40 ângulos com boa iluminação e fundos texturizados. Abra o site em `http://127.0.0.1:8080/laboratorio-3d.html`, faça login, envie JPG/PNG e clique **Gerar modelo 3D local**. Confira os logs, a prévia GLB e os detalhes no estúdio. Recomenda-se pelo menos 20 GB de disco livre e fechar programas pesados. O resultado pode falhar por fotos sem detalhes, objetos reflexivos, memória insuficiente ou diferenças da build nativa.

Se falhar, envie as últimas linhas de `data/reconstrucoes/<ID>/processamento.log` e a mensagem do laboratório, sem compartilhar `.env`/senhas.

## Limites da validação

Os scripts e os testes independentes foram executados neste ambiente Linux, **não em Windows real com os binários OpenMVS/COLMAP instalados**, e não foi feita uma reconstrução fotográfica real. A suíte completa do servidor depende de `npm ci` com Node 24; como o ambiente de execução não disponibilizou todas as dependências, ela ainda precisa ser rodada no computador Windows. Não use esta beta como sistema comercial homologado.
