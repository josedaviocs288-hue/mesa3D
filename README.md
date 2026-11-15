# Mesa3D v8.3 — instaladores Windows e Linux

**Para testar no Linux Mint, abra [`GUIA-LINUX.md`](GUIA-LINUX.md) e execute `Instalar-Mesa3D-Linux.sh`. Para testar no Windows, comece por [`LEIA-PRIMEIRO.md`](LEIA-PRIMEIRO.md) e execute `Instalar-Mesa3D.bat`.** O instalador baixa Node e motor 3D e abre o site automaticamente.

---

## 3D local sem API (versao 8.3)

O Laboratorio 3D recebe 20–80 fotografias, aciona o motor OpenMVS no proprio computador, acompanha as etapas e permite visualizar o GLB reconstruido. **O gerador de fotos nao depende de API nem de hospedagem.** O instalador Linux/Windows baixa o motor e o Node.js na primeira execucao. Se os binarios oficiais nao estiverem disponiveis ou nao iniciarem no computador, a instalacao falha de forma explicita.

- **[GUIA-LINUX.md](GUIA-LINUX.md)**: instalacao guiada para Linux Mint 22.x e Ubuntu 24.04 (x86_64).
- **[LEIA-PRIMEIRO.md](LEIA-PRIMEIRO.md)**: instalacao automatica Windows 10/11 x64.
- **[INSTALAR-3D-LOCAL.md](INSTALAR-3D-LOCAL.md)**: instalacao manual alternativa e explicacao da captura.
- **[TESTAR-TUDO.md](TESTAR-TUDO.md)**: roteiro de verificacao das funcoes.

**Beta:** o instalador Linux foi validado por testes de codigo e simulacoes; nao foi executado integralmente numa maquina Linux Mint real. A qualidade de reconstrucoes de pratos reais ainda necessita teste pratico.

---

# Mesa3D Atelier 8 — teste 3D e hospedagem gratuita

Cardápio de restaurantes com fotos, porções medidas, modelos GLB em escala física, realidade aumentada em celulares compatíveis, pedidos, contas por restaurante e integração preparada para Mercado Pago. O código foi montado para Node.js 24 ou superior.

**Teste privado pelo celular:** no Windows, extraia o projeto, execute `Iniciar-teste-celular.bat` e siga o [guia de teste com Cloudflare](TESTE-NO-CELULAR.md). O iniciador cria um link HTTPS temporário e um código de convite sem exigir uma conta Cloudflare.

## Novidades da versão 8

- `Iniciar-Mesa3D-Gratis.bat` ou `Iniciar-Mesa3D-Gratis.sh`: primeira execução local com credenciais aleatórias sem configurar manualmente `.env`.
- `/laboratorio-3d.html`: teste visual de GLB (girar, zoom, AR em dispositivo compatível), relatório de malha/texturas/peso, comparação com fotos e verificação de proporções sem alterar o cardápio.
- `DEPLOY-GRATIS.md`: implantação gratuita com persistência em Oracle Always Free, instalador simplificado e HTTPS pelo Caddy.
- `TESTAR-TUDO.md`: roteiro de testes ponta a ponta e limitações do que é verificável automaticamente.

**Limitação:** a geração integrada de fotos usa uma API externa opcional da Meshy que requer chave/créditos. Não há promessa de fotogrametria gratuita dentro da hospedagem. O envio de GLB pronto e a validação no próprio site não exigem essa API.

## Começar manualmente (alternativa)

1. Copie `.env.example` para `.env`.
2. Defina `OWNER_EMAIL` e uma `OWNER_PASSWORD` de pelo menos 12 caracteres. Gere `MESA3D_ENCRYPTION_KEY` com o comando indicado no arquivo. Guarde essa chave: sem ela, conexões de pagamento já gravadas não poderão ser lidas.
3. Execute `start.bat` (ou `npm install && npm start`).
4. Abra `http://localhost:8080/acesso.html` e entre como proprietário. O painel de administração fica em `/owner.html`, protegido por sessão e sem link no cardápio público.
5. Crie um restaurante no painel. E-mail e senha de um responsável são opcionais. Clique em **Gerenciar pratos** e cadastre a primeira porção com sua conta. Se tiver criado uma conta separada, o responsável entra em `/acesso.html` para editar o cardápio, acompanhar pedidos, conectar pagamentos e trocar a senha.

Se `OWNER_EMAIL` ou `OWNER_PASSWORD` estiver vazio, o servidor mostra apenas o cardápio de demonstração e desativa a administração. A senha é transformada com scrypt antes de entrar no banco.

## Fluxo do restaurante

- Cadastre cada porção com peso, preço e **largura, profundidade e altura medidas em centímetros**.
- Fotografe a porção realmente servida. Fotos sem modelo continuam visíveis no cardápio, sem prometer AR volumétrica.
- Envie um GLB texturizado ou use a geração opcional com Meshy. **O envio do GLB não precisa de chave de API.** O modelo é calibrado em metros, centrado e apoiado no plano horizontal.
- Para modelos reais, o sistema rejeita uma diferença de proporção maior que 3% entre GLB e medidas e aplica somente escala uniforme. Assim, não estica o formato do prato. Os modelos para teste móvel devem ter até 20 MB e 180 mil triângulos.
- Revise a geometria e aprove antes de liberar a visualização AR. Uma alteração de medidas devolve o modelo à revisão.
- O exemplo incluído é **ilustrativo** e não pode ser pedido. Substitua foto e modelo por arquivos do prato real.

O estúdio inclui um [guia de captura e teste](public/guia-3d.html). O 3D fiel exige reconstruir ou modelar a porção servida, conferir os ingredientes e comparar a projeção com o alimento físico. Uma API de IA não substitui essa revisão. A Meshy permite uso grátis em seu aplicativo web, mas **a API requer uma conta paga para obter chave**; não há API de geração 3D gratuita embutida neste projeto.

Na página do prato, o cliente pode girar o modelo ou abrir a câmera AR. O aplicativo usa `<model-viewer>` com WebXR, Scene Viewer ou Quick Look, conforme o aparelho, e `ar-scale="fixed"`. O cliente deve apontar para uma mesa iluminada e tocar na superfície para posicionar. **Nenhum software consegue garantir formato, cor ou escala física exatos a partir de uma foto isolada**; é necessário validar cada prato com régua e aparelho real antes da publicação comercial.

Antes de testar um prato, abra `/teste-camera.html` no link HTTPS do celular. A régua virtual de 10 cm ajuda a verificar a escala e o rastreamento do aparelho.

## Pedidos e pagamento

O cliente escolhe pagar na mesa ou, depois que o restaurante conectar sua conta, pagar no Checkout Pro do Mercado Pago. O preço é recalculado no servidor a partir do catálogo; valores enviados pelo navegador são ignorados. O restaurante recebe o pedido no painel. Um retorno do navegador nunca marca um pedido como pago: o servidor valida a assinatura do webhook, consulta o pagamento na API e concilia o valor aprovado. O fluxo também soma pagamentos parciais aprovados do mesmo pedido.

Cada restaurante vincula a própria conta por OAuth, de modo que as vendas entrem na conta dele. A plataforma pode cobrar mensalidade pelo site com sua própria conta e `PLAN_MONTHLY_CENTS`. O painel só ativa a cobrança quando valor e credenciais estão configurados. Checkout Pro redireciona ao ambiente do Mercado Pago; dados de cartão não passam pelo Mesa3D.

Para ativar:

1. Crie uma aplicação Mercado Pago para a plataforma e configure `MP_CLIENT_ID`, `MP_CLIENT_SECRET`, `MP_WEBHOOK_SECRET`, `MP_OWNER_ACCESS_TOKEN` e `PUBLIC_BASE_URL` HTTPS.
2. Cadastre como URL OAuth exata `https://SEU-DOMINIO/api/mp/callback`.
3. Configure o evento **Pagamentos** com webhook `https://SEU-DOMINIO/api/payments/webhook` e copie a chave de assinatura.
4. Teste com contas de teste e transações pequenas antes de usar credenciais de produção.
5. Cada restaurante abre **Pagamentos → Conectar Mercado Pago** no estúdio e autoriza a própria conta.

O Checkout Pro limita cartão a uma parcela nesta implementação, mas taxas por transação ainda existem e variam conforme conta, meio e prazo de recebimento. Confirme as condições vigentes no painel de cada restaurante. Impostos do negócio não são eliminados por uma API. A integração externa ainda exige contas, credenciais e testes reais antes de receber pagamentos.

## Dados, backup e publicação

Os registros persistem em `data/mesa3d.sqlite` (WAL) e os arquivos em `data/uploads/`, ou no caminho `MESA3D_DATA_DIR`. Faça backup **do banco e dos uploads juntos**. Para operação pública, use HTTPS, um volume persistente, rotina de backup e monitoramento. O [guia de implantação](DEPLOY.md) e o pacote Docker Compose preparam a instalação em uma VM Oracle Cloud Always Free, sujeita à disponibilidade e às cotas. Cloudflare Pages sozinho não executa este backend Node/SQLite.

O arquivo `data/store.json` do pacote v5 é importado uma vez na primeira execução. Ele permanece como cópia legada. Não edite esse JSON depois da migração.

## Verificação

`npm test` cobre login obrigatório, separação entre restaurantes, aprovação de GLB, medidas físicas e cálculo de pedido no servidor. A integração externa de pagamento e o rastreamento AR exigem credenciais e celulares reais; não são simulados como produção.
