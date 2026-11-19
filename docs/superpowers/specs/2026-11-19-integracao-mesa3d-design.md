# Integração Mesa3D e PratoAR

Data: 19/11/2026. Estado: arquitetura e especificação escrita aprovadas pelo usuário; implementação depende da revisão do plano e escolha do método de execução.

## Objetivo e decisões aprovadas

Unificar o produto usando o web e o visual do Mesa3D como base, incorporando recursos úteis do PratoAR. O restaurante e o consumidor acessam o navegador; o aplicativo Windows deixa de fazer parte da solução ativa. Não exigir Supabase, PostgreSQL ou a criação de outro banco: aproveitar a persistência SQLite já implementada pelo Mesa3D.

“Sem banco” foi esclarecido em conversa como sem um novo banco ou serviço de banco. O arquivo `.env` configura o servidor e não substitui o SQLite. Não há evidência de que o banco com dados reais ou o `.env` do Mesa3D estejam disponíveis neste workspace.

## Fontes examinadas

- Mesa3D: https://github.com/josedaviocs288-hue/mesa3D, referência examinada `bba11fcf87a20349e7c27149028fa9724e23ce5b`.
- Mesa3D: `server.js`, `platform.js`, `public/index.html`, `public/studio.html`, `public/styles.css`, `public/menu.js`, `public/view.js`, `public/laboratorio-3d.js` e README.
- PratoAR: `frontend/AGENTS.md`, componentes e bibliotecas de AR, scripts/testes disponíveis, documentação de iPhone, carregamento 3D, reconstrução e aplicativo Windows.

## Alternativas e escolha

1. **Mesa3D como aplicação principal, escolhida:** preserva telas, fluxos, contratos HTTP e SQLite; adapta recursos específicos do PratoAR sem carregar Next.js e Supabase para o novo produto.
2. PratoAR como base: exigiria substituir sua persistência/autenticação e reproduzir as telas do Mesa3D. Maior retrabalho e risco de descaracterizar a interface solicitada.

## Organização do código e execução

Importar a aplicação Mesa3D para `web/` neste workspace, com origem e revisão registradas, dependências próprias e execução Node.js 24 ou superior. `web/` será a única aplicação web ativa descrita no README principal. Não instalar nem modificar código de produto nesta etapa de especificação.

Manter `frontend/`, `desktop/`, `backend/` e `worker-3d/` como legado preservado, fora da execução e distribuição padrão. Retirar do fluxo ativo os instaladores, atalhos e instruções que exigem aplicativo ou motor no computador do restaurante. Não apagar modificações locais existentes nem dados para efetuar a substituição. A retirada definitiva dos diretórios legados não faz parte desta integração.

Um servidor Express entrega páginas, APIs e arquivos. SQLite e uploads ficam no servidor definido por `MESA3D_DATA_DIR`; o navegador do restaurante não inicia banco, Electron ou worker. Não abrir outro backend nem executar duas aplicações para completar o fluxo normal.

## Interface e escopo funcional

Preservar a identidade Mesa3D: verde floresta, creme, terracota, títulos serifados, cardápio com busca/categorias, pratos e porções, sacola, estúdio com navegação lateral, administração e laboratório de inspeção de GLB. Manter marca Mesa3D e nomes personalizáveis do restaurante. Não redesenhar essas telas com o estilo anterior do PratoAR.

Preservar cadastro de restaurantes e responsáveis, sessões, isolamento entre restaurantes, pratos, porções, medidas, fotos, revisão/publicação de modelos, QR Codes e pedidos com pagamento na mesa. Pagamentos externos permanecem indisponíveis sem configuração; não importar cobrança Stripe nem onboarding condicionado a pagamento do PratoAR. Não configurar credenciais financeiras, iniciar cobranças ou ativar Meshy.

O laboratório mantém prévia, comparação com fotos e análise de GLB. A geração por fotos e os endpoints de processamento devem ficar desativados por padrão e informar indisponibilidade; a capacidade pública não deve anunciar geração disponível. Não baixar binários de reconstrução nem exigir instalação local.

## Persistência, autenticação e dados

Usar `platform.js` do Mesa3D e suas tabelas SQLite. Preservar IDs, slugs, catálogos, contas e referências de uploads de uma instalação existente. Antes de testar com dados reais, realizar backup consistente do banco e dos uploads juntos; não copiar um SQLite ativo ignorando seu WAL. Testes automatizados usam diretório temporário isolado.

Alterações de esquema, se necessárias para metadados 3D, são aditivas e idempotentes. A ausência de `.env` não autoriza recuperar senhas, substituir usuários existentes ou inventar chaves. Sem credenciais administrativas válidas, preservar o comportamento de demonstração com administração bloqueada. Documentar nomes das configurações com valores fictícios, sem ler ou copiar segredos existentes.

Não migrar dados reais do Supabase automaticamente: não foi solicitado e o banco de destino real não foi fornecido. Não fingir que demonstrações equivalem a dados restaurados.

## Integração dos recursos 3D do PratoAR

Adaptar para módulos JavaScript independentes do Next.js os comportamentos pertinentes de `DishModel`, `TableEntry` e bibliotecas de AR/capacidades. Não transplantar componentes React inteiros nem importar autenticação ou banco do PratoAR.

- Manter calibração uniforme, medidas por porção e revisão do Mesa3D. Não afrouxar sua validação de proporções ou limites móveis para acomodar exemplos do PratoAR.
- Distinguir GLB original e variante web otimizada. Metadados opcionais por porção relacionam arquivo de origem, variante, poster e USDZ à revisão e às dimensões calibradas. Troca de modelo ou medidas invalida as associações anteriores e devolve o modelo à revisão.
- Quick Look pode usar USDZ preparado somente quando corresponder ao mesmo modelo e à mesma escala. Não associar arquivos de exemplos a modelos arbitrários. Sem USDZ preparado, manter a alternativa compatível do model-viewer sem prometer conversão antecipada.
- Android inicia AR por gesto real. Desktop e dispositivos incompatíveis mantêm foto e exploração 3D. Exibir progresso real, erro, recuperação de WebGL e nova tentativa manual; falha da variante otimizada pode oferecer o original.
- Servir modelos com MIME correto, Range e cache apropriado. Cache imutável somente para arquivos versionados por conteúdo; não adicionar cache offline de APIs, sessões ou uploads privados.
- Preservar créditos e licenças dos arquivos efetivamente reutilizados. Otimização é ferramenta de preparação, sem serviço pago e sem promessa de tempo fixo de carregamento.

Importação GLB existente permanece obrigatória. Formatos extras do PratoAR, como glTF ZIP, ficam fora desta primeira integração; evitam expandir o contrato de upload e a superfície de validação sem necessidade.

## URLs e compatibilidade

Manter URLs Mesa3D por `loja`, prato e porção, assim como seus QR Codes. Não redirecionar todos os links antigos do PratoAR para um prato demonstrativo. A correspondência entre IDs numéricos do PratoAR e IDs do Mesa3D não existe no material disponível. URLs antigas sem correspondência recebem orientação clara para localizar o cardápio; compatibilidade individual depende de um mapa explícito com dados reais e não bloqueia esta entrega.

## Segurança e tratamento de falhas

Manter verificação de sessão e permissão no servidor para todas as escritas, inspeções e acessos administrativos. O estado público não pode expor rascunhos, credenciais ou dados de outros restaurantes. Validar tipo, assinatura, tamanho, referências externas e caminhos dos uploads; nenhuma integração deve permitir leitura arbitrária do servidor. Valores de pedido são recalculados pelo servidor.

Banco indisponível, upload inválido, prato inexistente e modelo não aprovado retornam erros compreensíveis sem simular sucesso. Nenhum `.env`, banco, upload real, sessão ou chave entra no Git. A implementação deve revisar explicitamente os controles herdados do Mesa3D, sem presumir que a existência dos testes comprova segurança completa.

## Hospedagem e custo zero

Executar e testar localmente com Node é o primeiro alvo verificável. Hospedagem pública exige processo Node e disco persistente. Não publicar SQLite em filesystem efêmero de funções Vercel nem pressupor que a Vercel atual do PratoAR hospeda este backend.

Não provisionar infraestrutura, ativar serviços pagos, abrir túnel público ou publicar automaticamente. Um host público gratuito disponível à conta ainda não foi validado. A integração pode ser concluída localmente com essa limitação registrada; operação pública não será declarada concluída sem host persistente e testes HTTP reais.

## Validação e critérios de aceite

1. Uma única aplicação em `web/` inicia e entrega cardápio e estúdio com o visual Mesa3D, sem Supabase/PostgreSQL nem aplicativo Windows.
2. Sem `.env`, a demonstração abre e a administração permanece protegida; com configuração de teste, login, logout e isolamento entre dois restaurantes passam.
3. Em banco temporário existente, reiniciar preserva restaurantes, contas, pratos, porções, pedidos e uploads; extensões não destroem dados anteriores.
4. Upload GLB válido, calibração, revisão, publicação e QR funcionam. Modelo inválido, medidas incompatíveis e acesso indevido são rejeitados.
5. Pedido na mesa funciona com cálculo no servidor; pagamento externo e reconstrução estão desativados sem configuração.
6. Testes de seleção de USDZ, invalidação de metadados, falha de modelo, gesto Android e alternativa sem WebGL passam. Verificar MIME/Range de arquivos e ausência de associação incorreta por porção.
7. Comparar telas em desktop e viewport móvel com o Mesa3D original; executar sua suíte e testes novos de integração pertinentes. Documentar comandos e resultados reais.
8. Testes desktop com identificação iPhone não comprovam câmera, rastreamento, aparência ou escala em iPhone físico. Essa aceitação permanece explícita para teste no aparelho.

## Próxima etapa

Após aprovação desta especificação escrita pelo usuário, usar a skill `superpowers:writing-plans` para detalhar a implementação e apresentar o plano e método de execução. A aprovação da arquitetura em conversa autorizou este documento; código de produto ainda não foi alterado.
