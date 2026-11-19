# Mesa3D — integração PratoAR

Aplicação web para restaurantes publicarem pratos e porções com fotos, modelos GLB calibrados, visualização 3D/AR e pedidos para pagar na mesa. O web e o visual são do Mesa3D; recursos de recuperação e preparação de modelos vêm do PratoAR.

## Executar

Requer **Node.js 24 ou superior**. Na pasta do projeto:

```powershell
npm ci
npm start
```

Abra http://localhost:8080. Sem configuração administrativa, o cardápio demonstrativo funciona e o painel exige autenticação. Para administrar uma instalação nova, siga [OPERACAO.md](OPERACAO.md). As contas de uma instalação existente continuam no SQLite; não é preciso criar outro banco.

O restaurante usa o navegador. Não precisa instalar aplicativo Windows, motor 3D, Supabase ou PostgreSQL. A execução acima inicia o **servidor** nesta máquina; o acesso público por outros aparelhos depende de hospedagem HTTPS com armazenamento persistente.

## Dados e configuração

O padrão é `data/mesa3d.sqlite` e `data/uploads/`. Para aproveitar uma instalação Mesa3D existente, configure `MESA3D_DATA_DIR` para seu diretório de dados, após backup. O `.env` apenas configura a aplicação: não contém o banco. Não versionar credenciais, banco nem uploads reais.

[Configuração e backup](web/README.md) · [Integração, verificações e limites](docs/MESA3D-INTEGRACAO.md)

## Escopo atual

- Cardápio, estúdio, administração, fotos, porções, medidas, revisão GLB, QR e pedidos na mesa.
- Foto durante carregamento/falha, nova tentativa e alternativa sem WebGL.
- Preparação offline opcional de GLB otimizado e USDZ, vinculados ao modelo e às medidas corretas.
- Geração por fotos desativada. Nenhum processamento ou serviço pago foi ativado.
- Pagamento externo exige configuração e validação próprias; não foi ativado nesta integração.

## Verificar

```powershell
npm test
npm audit
```

Desktop e simulação móvel não validam câmera, rastreamento ou escala em iPhone físico. A hospedagem pública gratuita ainda não foi validada. SQLite exige disco persistente; não usar o filesystem efêmero de funções Vercel.

## Origem e layout

Esta integração foi desenvolvida em `web/` no workspace PratoAR e aplicada à raiz do Mesa3D para manter `npm ci` / `npm start` como fluxo principal. Veja [operação](OPERACAO.md), [origem](UPSTREAM.md) e [evidências](docs/MESA3D-INTEGRACAO.md).

Os instaladores e ferramentas do motor local anteriores permanecem como legado histórico, fora da execução/distribuição padrão. Não são necessários para operar pelo navegador. Os testes de instaladores/motor local também são históricos; `npm test` executa a suíte ativa da aplicação web.
