# Pagamentos e custos

A integração preparada usa Mercado Pago Checkout Pro. O restaurante autoriza sua própria conta e recebe as vendas nela. A plataforma pode usar uma conta separada para cobrar mensalidade. O checkout de cartão fica no provedor; o Mesa3D valida webhook e consulta a API antes de marcar um pedido como pago.

Essa escolha favorece um fluxo conhecido no Brasil e evita armazenar dados de cartão no projeto. Ela **não significa taxa zero**. Taxa de Pix, cartão, parcelamento e prazo de recebimento dependem do contrato e da configuração de cada conta. Compare o custo total no painel da conta do restaurante antes de ativar. Tributação da atividade continua sendo responsabilidade do negócio.

O pagamento na mesa não precisa de API. Para pagamento online ou mensalidade pelo site, são necessários conta Mercado Pago, aplicação da plataforma, credenciais, domínio HTTPS estável e testes de ponta a ponta. O pacote contém a integração, mas ainda não foi validado com transações reais porque essas contas não existem.

Fontes oficiais:

- Mercado Pago Checkout Pro: https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-preferences/overview
- Mercado Pago, taxas de venda online: https://www.mercadopago.com.br/blog/quanto-custa-vender-on-line-com-mercado-pago
- Mercado Pago, OAuth: https://www.mercadopago.com.br/developers/pt/docs/split-payments/split-1-1/additional-content/security/oauth/introduction
