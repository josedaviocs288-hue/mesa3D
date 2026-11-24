# Relatório final — Mesa3D + PratoAR

**24 de novembro de 2026 · Entrega para revisão do dono · Sem merge ou deploy automático**

## Resultado

O produto ativo mantém o web e o visual do Mesa3D, com recursos 3D do PratoAR. O restaurante opera pelo navegador. A aplicação ativa usa Node.js 24+, Express e SQLite persistente; o aplicativo Windows e os projetos Next.js/Java anteriores ficam fora do fluxo ativo.

## Entregas e pendências

| Área | Entregue | Pendente |
| --- | --- | --- |
| Cardápio | Fotos, busca, categorias, porções, carrinho, QR e pedidos na mesa | Aceite com dados reais |
| Gestão | Autenticação, administração e estúdio | Configuração privada da instalação |
| Visual | Identidade Mesa3D, refinamentos MengTo, foco e adaptação móvel | Aceite visual do dono |
| 3D | GLB, calibração, revisão, variantes, fallback e nova tentativa | Avaliação de qualidade de cada modelo |
| AR | Integração nativa e entrega GLB/USDZ | Teste de câmera, rastreamento e escala em aparelhos físicos |
| Fotos para 3D | Upload privado, fila, worker, pipeline Python e aprovação | Ambiente Linux gratuito validado e reconstrução real |
| Afiliados | Proposta comercial documentada | Aprovar regras e implementar comissões |
| Pagamentos | Pedidos para pagamento na mesa | Homologação de integrações externas |

## Backend

Express atende arquivos e APIs de autenticação, catálogo, gestão, pedidos e reconstrução. SQLite mantém as sete tabelas de base e duas adicionais para tarefas e presença de workers. Modelos publicados e capturas privadas são separados no armazenamento.

Site e worker compartilham banco e disco no servidor. O worker chama o adaptador Python sem shell e com ambiente restrito. A fila controla lease, repetição, cancelamento e resultado obsoleto. A aprovação verifica a identidade de fotos, medidas e modelo; não há publicação automática. A retenção limpa entradas privadas de tarefas terminadas após sete dias, preservando modelos públicos e tarefas em revisão.

A geração está desativada por padrão. Exige Linux compatível, digest do runtime, HTTPS, worker recente, memória/disco suficientes e aceite de captura real. Nenhum serviço pago, túnel ou deploy foi ativado. O host gratuito adequado ainda não foi validado.

## Evidências

A rodada de implementação passou 54 testes Node e 21 testes Python, sem fotogrametria pesada. A auditoria Node não encontrou vulnerabilidades. Houve smoke HTTP de catálogo, dois GLBs, Range/MIME e biblioteca/decoder; avaliação de desktop e tela de 390 px; revisão independente com dois achados importantes corrigidos por regressões. As suítes são repetidas na cópia do GitHub e o resultado atualizado fica no PR.

Essas verificações não comprovam aceitação do servidor futuro, qualidade comercial da reconstrução nem AR física. A recusa do preflight no Windows é esperada; não foi criada uma nova reconstrução de produção nesta entrega.

## Dados e publicação

O envio ao GitHub contém código, documentação e imagens de demonstração. Não inclui `.env` real, banco, contas, capturas privadas, uploads de clientes ou dependências instaladas. Alterações locais do frontend legado ficam preservadas fora deste pacote. O motor inclui avisos de terceiros; validar as obrigações das licenças para a distribuição final.

O conteúdo de `web/` deste workspace ocupa a raiz do repositório Mesa3D. O motor opcional ocupa `worker-3d/`. Documentos históricos com caminhos `web/` devem ser lidos com essa correspondência.

## Entrada em operação

1. Revisar o PR e escolher host gratuito com disco persistente.
2. Configurar HTTPS, contas, variáveis e backup sem publicar segredos.
3. Validar cardápio, pedidos e importação com dados autorizados.
4. Executar uma reconstrução real no runtime Linux e avaliar qualidade, duração, recursos e cancelamento.
5. Registrar digest e aceite somente após validação; habilitar geração controladamente.
6. Testar AR em iPhone e Android físicos, incluindo escala.
7. Aprovar regras de afiliados antes de implementar comissões e pagamentos.

## Documentação de apoio

- [Operação e rollback da geração](GERACAO-3D-SERVIDOR.md)
- [Integração](MESA3D-INTEGRACAO.md)
- [Visual MengTo](VISUAL-MENGTO.md)
- [Proposta de afiliados](PROPOSTA-AFILIADOS.md)
- [Backend antes da inclusão da fila](BACKEND-ESTADO-2026-11-23.md)
- [PR para revisão do dono](https://github.com/josedaviocs288-hue/mesa3D/pull/1)

## Configuração encontrada no upstream

A branch main recebeu um arquivo .env rastreado antes desta atualização. O PR remove seu rastreamento, sem exibir seu conteúdo. Isso não apaga o histórico remoto; o dono deve revisar privadamente se havia credenciais reais e substituí-las se necessário.
