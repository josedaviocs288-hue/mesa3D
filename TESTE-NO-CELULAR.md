# Teste privado pelo celular com Cloudflare

Este modo mantém o servidor, banco de dados, fotos e modelos **no seu computador**. A Cloudflare fornece um link HTTPS temporário sem exigir uma conta. O próprio site pede um código de convite para abrir páginas e APIs. Não é hospedagem permanente: o computador e a janela do iniciador precisam continuar ligados; o endereço muda a cada reinício.

## Começar no Windows

1. Instale Node.js **24 ou superior** e extraia o ZIP em uma pasta local fora do OneDrive/Dropbox.
2. Clique duas vezes em `Iniciar-teste-celular.bat`.
3. Na primeira execução, informe seu e-mail de administrador. O iniciador cria uma senha forte, uma chave de criptografia e um **código de convite separado** em `.env`; copie a senha exibida e guarde-a com segurança. O arquivo `.env` nunca deve ser enviado ao cliente.
4. Aceite o download do `cloudflared` oficial se solicitado. O terminal mostrará o código de convite e o link `https://...trycloudflare.com`. Envie **somente o link e o código de convite** às pessoas escolhidas. Nunca envie a senha de administrador.
5. Entre em `/acesso.html` com seu e-mail e a senha inicial. No painel, crie o restaurante e abra **Gerenciar pratos**. Uma conta separada para o responsável é opcional. Você pode trocar a senha inicial na área **Conta**.

O iniciador salva logs em `data/teste-celular-out.log` e `data/teste-celular-err.log`. Se fechar a janela ou desligar o computador, o link para de funcionar. Ao iniciar novamente, envie o **novo** link. Pare o iniciador antes de copiar a pasta `data` para backup. O código de convite fica válido enquanto estiver no `.env`; troque `PILOT_ACCESS_CODE` nesse arquivo para revogar convites anteriores.

### Se aparecer "Cloudflare error 1003"

Esse erro indica que o navegador tentou acessar diretamente um endereço **IP** da Cloudflare. Na janela do iniciador, aguarde o `cloudflared` mostrar um endereço completo no formato `https://palavras-aleatorias.trycloudflare.com`. Copie **essa URL inteira** para o celular, incluindo `https://`; não copie `127.0.0.1:8080`, números de IP nem apenas a parte depois de `https://`. Abra o link diretamente no Chrome ou Safari, sem trocar o domínio pelo IP. O computador e a janela do iniciador devem continuar ligados. Se reiniciar o iniciador, descarte o link antigo e use o novo. Referência: https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-1xxx-errors/error-1003/.

## Testar a câmera antes de cadastrar comida

Abra `https://SEU-LINK/teste-camera.html` no celular. A régua 3D mede 10 cm de ponta a ponta no arquivo. Posicione-a em uma mesa iluminada e compare com uma régua física. Caminhe ao redor para conferir o rastreamento por vários ângulos. Se a AR não existir no navegador/aparelho, a página ainda oferece a visualização 3D giratória.

Depois abra o cardápio. O prato de demonstração é **ilustrativo**, útil para verificar o fluxo, mas não prova fidelidade ao alimento servido.

## Testar um prato real

1. Prepare a porção exatamente como será servida. Meça a largura, profundidade e altura externas em centímetros; registre o peso e tire fotos nítidas de frente, lado, cima e a 45°, com iluminação semelhante.
2. Envie um GLB texturizado e autocontido do prato real. O site aceita modelos de até **20 MB** e **180 mil triângulos** para o teste móvel. A escala é uniforme; se a proporção do modelo divergir mais de 3% das medidas, o upload é recusado para evitar deformação.
3. Abra a revisão no celular. Compare geometria, ingredientes, textura e tamanho projetado com a porção real e uma régua. Só então marque as confirmações e aprove.
4. Peça ao cliente para abrir o cardápio no celular, girar o modelo com o dedo, entrar na câmera e **mover o aparelho ao redor da mesa**. O objeto deve permanecer ancorado; a taxa de quadros depende do hardware, navegador, tamanho do modelo e iluminação.

A geração de um GLB por IA com Meshy é opcional e requer `MESHY_API_KEY`; ela pode consumir créditos. Um modelo gerado a partir de poucas fotos ainda precisa de inspeção humana. Para alta fidelidade, prefira fotogrametria ou escaneamento do prato real com boas vistas e textura.

## O que funciona neste teste

- Cardápio, login, administração, fotos, modelos, QR, pedidos e pagamento **na mesa** usam o servidor local pelo túnel privado.
- Páginas e APIs pedem o código de convite. Arquivos de fotos e modelos usam endereços longos e aleatórios e podem ser buscados diretamente se alguém receber o endereço do arquivo. Isso permite que os visualizadores nativos de AR carreguem o GLB fora do navegador. Compartilhe o link apenas com os testadores e retire o túnel após o teste.
- O teste de AR usa WebXR, Scene Viewer ou Quick Look conforme o aparelho. Não há garantia de AR em todos os celulares; navegadores sem suporte mostram o 3D giratório.
- Pagamento online e mensalidade continuam desativados até existir conta Mercado Pago configurada e **endereço HTTPS estável** para OAuth e webhook. O link temporário muda a cada reinício.
- O conteúdo fica no seu computador, então faça backup da pasta `data` depois de encerrar o iniciador.

Para publicar de modo contínuo, use o `DEPLOY.md` ou migre a aplicação para persistência em nuvem. Quick Tunnels são destinados a desenvolvimento e teste, sem garantia de disponibilidade: https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/.

