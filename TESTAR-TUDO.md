# Teste completo do Mesa3D v8.3.1

## Instalação em um clique no computador

- **Windows:** extraia o ZIP e execute `Instalar-Mesa3D.bat`; o instalador configura Node 24, COLMAP/OpenMVS e abre o site.
- **Linux Mint/Ubuntu x64:** execute `Instalar-Mesa3D-Linux.sh`; outras distribuições exigem configuração manual.
- Na primeira execução, o iniciador cria um `.env` local, com senha forte aleatória, **e mostra a senha no terminal**. Guarde-a. Nas próximas utilizações, use as credenciais já salvas. Para redefinir, altere a senha no painel; não apague o `.env` sem cuidar do banco.
- Abra `http://localhost:8080/acesso.html` no computador. Para celular com AR use HTTPS (veja `TESTE-NO-CELULAR.md`).

## Teste do novo motor local (sem API)

1. Execute `Conferir-3D-Local.bat` (Windows) ou `bash Conferir-3D-Local.sh`. Se faltar ferramenta, siga `INSTALAR-3D-LOCAL.md`.
2. Faça login e abra `/laboratorio-3d.html`. Envie 20–80 fotos e clique em Gerar modelo 3D local.
3. Observe as etapas no site, aguarde a exportacao do GLB, compare no visualizador e baixe o arquivo.
4. Para ligar ao cardapio, comece pelo Estudio, abra o prato salvo e use Criar GLB local; quando terminar clique Enviar ao prato para revisao, depois confira a escala e aprove.
5. Se a geracao falhar, leia o log e tente com fotos melhores. Os testes automatizados NAO substituem esse teste real.

## Automáticos

`npm test` cobre fluxos de autenticação, multi-restaurante, GLB, aprovação e pedido. `npm run test:3d` executa apenas testes locais de geometria e escala **sem chamar API externa**.

## Roteiro manual, sem fingir que passou

Marque cada item quando de fato testar:

- [ ] Proprietário entra com senha, cria restaurante e uma conta separada.
- [ ] Conta de restaurante não consegue abrir cardápio privado de outro restaurante.
- [ ] Restaurante cadastra porção com preço, gramas e medidas reais em cm.
- [ ] Restaurante envia 2–4 fotos e vê miniaturas.
- [ ] Entre em `/laboratorio-3d.html`, carregue GLB válido e veja a geometria ao girar.
- [ ] Faça a análise: menos de 20 MB, menos de 180 mil triângulos, textura e proporções.
- [ ] Compare o 3D com fotos reais do prato. Corrija modelo se a análise de medidas falhar.
- [ ] Envie GLB pelo estúdio, revise, aprove com confirmação e abra o prato pelo link público.
- [ ] Use `/teste-camera.html` em celular com HTTPS e câmera AR; confira régua de 10 cm.
- [ ] Compare escala física do 3D com o prato real na mesa; iluminação e textura variam.
- [ ] Um pedido feito na vitrine aparece no painel e preço é recalculado no servidor.
- [ ] Alterações e uploads continuam disponíveis depois de reiniciar o servidor.
- [ ] Teste se HTTPS, QR Code, convite e domínio funcionam na VM.
- [ ] **Opcional pago:** configure MESHY_API_KEY no servidor; clique em “Gerar 3D das fotos”, acompanhe o job e revise o GLB. A API pode cobrar créditos; execução real NÃO foi feita nesta entrega.
- [ ] **Opcional externo:** configure Mercado Pago, teste OAuth, callbacks e webhooks com contas de teste, sem afirmar que o pagamento funciona apenas pela tela.

## Critérios técnicos

Um arquivo GLB inválido é rejeitado. Se medidas cadastradas diferirem mais de 3% das proporções do GLB, não há deformação silenciosa para modelo real. Modelos muito grandes devem ser reduzidos antes de publicar para celular. Testes automáticos verificam estrutura/escala, mas **não confirmam que um scan tem a aparência de um prato real**. Isso requer fotos reais e revisão humana.
