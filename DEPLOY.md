# Publicar o Mesa3D com HTTPS

O projeto completo precisa de Node.js, SQLite e armazenamento persistente para fotos, modelos, pedidos e sessões. Apenas a pasta public em Cloudflare Pages não publica esse backend. A implantação preparada usa uma VM Linux, Docker Compose e Caddy para obter HTTPS automaticamente.

## Antes de instalar

1. Crie uma conta Oracle Cloud e uma VM Ubuntu elegível ao Always Free, com IP público. A Oracle pode exigir cartão na verificação; capacidade gratuita e continuidade não são garantidas.
2. Aponte um domínio ou subdomínio para o IP da VM. DuckDNS permite criar um subdomínio sem comprar domínio.
3. Libere TCP 80 e 443 na rede Oracle e no firewall da VM. A câmera AR no site exige HTTPS.
4. Instale Docker Engine e o plugin Docker Compose conforme a documentação oficial para o Ubuntu da VM.

Não é necessária conta Cloudflare para essa rota. O Iniciar-teste-celular.bat continua criando um link HTTPS temporário para teste privado a partir do PC.

## Instalar na VM

Envie a pasta do projeto por SCP, por exemplo: scp -r Mesa3D-Atelier ubuntu@IP-DA-VM:~/mesa3d

Conectado por SSH, execute:

    cd ~/mesa3d
    sudo bash deploy/prepare-production.sh

O script pede domínio e e-mail, gera senha inicial do administrador, código de convite e chave de criptografia, cria .env.production, prepara runtime-data/ e sobe os containers. Guarde a senha e o código mostrados em um gerenciador de senhas. Nunca envie .env.production para alguém ou para Git.

Abra https://SEU-DOMINIO/convite.html com o código e depois https://SEU-DOMINIO/acesso.html com e-mail e senha. O painel fica em /owner.html após o login. Ele não aparece na navegação pública; a proteção real é a sessão com senha.

Para atualizar, envie o código novo sem substituir .env.production nem runtime-data/ e execute:

    sudo docker compose --env-file .env.production up -d --build
    sudo docker compose --env-file .env.production ps

Se o HTTPS não abrir, confira DNS, portas e os logs com sudo docker compose --env-file .env.production logs caddy.

## Primeiro uso

1. No painel do administrador, crie um restaurante. E-mail e senha de responsável são opcionais. Você pode cadastrar pratos com sua própria conta.
2. Abra Gerenciar pratos. Cadastre uma porção, preço, peso, medidas em centímetros e fotos da comida realmente servida.
3. Para 3D na câmera, envie um GLB texturizado dessa porção. O sistema calibra a escala, pede revisão e libera AR após aprovação. Fotos sozinhas mostram o cardápio, sem geometria 3D fiel.
4. Compartilhe o link ou QR Code do restaurante gerado no estúdio. O link contém ?loja=... . Compare o modelo com o prato físico em celulares compatíveis. Veja /guia-3d.html.

O site começa com código de convite para piloto privado. Para abrir o cardápio a qualquer pessoa, esvazie PILOT_ACCESS_CODE em .env.production e reinicie os containers. Faça isso quando cardápio, cobrança e suporte estiverem prontos. URLs de mídia são acessíveis a quem tem o link para permitir que visualizadores AR nativos carreguem GLB; nunca armazene segredos nos uploads.

## API 3D e pagamentos

- Fluxo sem custo de API: crie ou escaneie o GLB em uma ferramenta externa e envie no estúdio.
- Geração automática opcional: preencha MESHY_API_KEY em .env.production e reinicie. A API da Meshy exige plano pago para criar chave. O resultado ainda precisa ser conferido visualmente e com régua.
- Pedidos com pagamento na mesa funcionam sem provedor.
- Checkout online: crie uma aplicação Mercado Pago para a plataforma, preencha MP_CLIENT_ID, MP_CLIENT_SECRET, MP_WEBHOOK_SECRET, MP_OWNER_ACCESS_TOKEN e PUBLIC_BASE_URL, configure OAuth em /api/mp/callback e webhook em /api/payments/webhook, reinicie. Cada restaurante conecta sua conta no estúdio. Para cobrar mensalidade dos restaurantes, defina PLAN_MONTHLY_CENTS maior que zero.

Provedores de pagamento cobram tarifas e não eliminam impostos do negócio. Confira taxas no painel de cada conta. A integração externa ainda não foi validada ao vivo neste pacote porque não existem credenciais; antes de cobrar pessoas reais, teste OAuth, checkout, webhook e conciliação com contas de teste.

## Backup e operação

Execute regularmente sudo bash deploy/backup-production.sh. Ele cria um backup SQLite e um arquivo dos uploads. Copie ambos para fora da VM, proteja-os e teste a restauração. Guarde MESA3D_ENCRYPTION_KEY separadamente: sem ela, conexões de pagamento gravadas não podem ser recuperadas. Nunca sobrescreva runtime-data/ durante atualizações.

A implantação usa um único processo Node e SQLite. Não escale para várias instâncias sem migrar banco, arquivos e sessões para serviços compartilhados. Monitore espaço em disco, logs e HTTPS. Para operação comercial crítica, planeje hospedagem com garantia e backup externo.

## Referências oficiais

- Oracle Always Free: https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm
- Docker Engine no Ubuntu: https://docs.docker.com/engine/install/ubuntu/
- DuckDNS: https://www.duckdns.org/
- Meshy API: https://docs.meshy.ai/en/api/developer-platform
- Mercado Pago Checkout Pro: https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-preferences/overview
