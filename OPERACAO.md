# Mesa3D web

## Iniciar

Node >=24. Na raiz do repositório: `npm ci` e `npm start`. Abra http://localhost:8080. `HOST` padrão é `127.0.0.1`. Para servir em uma rede, configure deliberadamente o host e use HTTPS no acesso público; AR em celulares exige contexto seguro. Não há publicação automática.

## Administração

Para uma **instalação nova**, copie `.env.example` para `.env` e preencha localmente `OWNER_EMAIL` e `OWNER_PASSWORD` (mínimo de 12 caracteres). Nunca use exemplos como senha real e não envie segredos no chat. O proprietário inicial só é criado quando ainda não existe proprietário no banco. Alterar `.env` não redefine uma conta existente.

Entre em `/acesso.html`; administração em `/owner.html`; estúdio em `/studio.html`. O cadastro de restaurante pode incluir uma conta do responsável. Com banco existente, as contas e senhas existentes continuam valendo mesmo sem credenciais de bootstrap no `.env`.

## Banco existente e backup

`MESA3D_DATA_DIR` deve apontar para a pasta que contém `mesa3d.sqlite` e `uploads/`. O padrão é `data/`. Antes de apontar para dados reais:

1. Pare o servidor original, aguarde o encerramento e preserve sua configuração de forma privada.
2. Faça cópia consistente da pasta de dados inteira, incluindo banco, uploads e qualquer WAL/SHM remanescente. Nunca copie somente o SQLite enquanto há escritas.
3. Restaure a cópia em outra pasta, aponte `MESA3D_DATA_DIR` para ela e confira contas, restaurantes, modelos e pedidos.
4. Só depois faça a troca da instalação. Para voltar, pare o novo servidor e restaure banco e uploads juntos.

Não substituir ou recriar `MESA3D_ENCRYPTION_KEY` se já houver credenciais de pagamento criptografadas. A ausência dessa chave não apaga dados nem impede pedidos para pagar na mesa, mas impede decifrar conexões financeiras. Sem configuração de pagamento válida, não oferecer pagamento online.

## Preparar modelos para web/iPhone

Ferramenta **offline**, executada pelo operador do servidor depois da revisão do modelo, sem serviço pago. Instale também devDependencies (`npm ci` padrão). Identificadores estão no estado administrativo autorizado; nunca exponha esse endpoint publicamente.

```powershell
node tools/prepare-model-assets.mjs --data-dir C:/caminho/dados --restaurant ID_RESTAURANTE --dish ID_PRATO --portion ID_PORCAO
```

Use diretório de teste primeiro. O comando preserva o GLB calibrado, cria variantes com hash e só as associa se modelo, aprovação, medidas e bytes de origem ainda coincidirem. Alterar medidas/modelo/fotos invalida a associação. Falha mantém o modelo anterior; arquivos novos sem referência podem permanecer após interrupção e devem ser avaliados pelo operador, sem limpeza automática.

USDZ tem limitações de material: somente malhas estáticas e materiais compatíveis; normais ausentes são calculadas e faces passam a frontais para o exportador. Alterações ficam registradas nos metadados. Confira superfícies abertas, textura e escala no iPhone real antes de uso comercial. Arquivos preparados não são prova de rastreamento AR físico.

A ferramenta rejeita GLB com recursos externos e não baixa modelos pela rede. Os créditos originais do catálogo devem acompanhar o modelo. O decoder Draco conserva Apache 2.0 em `public/decoders/draco/LICENSE.txt`.

## Testes e implantação

A integração de geração por fotos no servidor está preparada, mas desativada por padrão. Consulte [operação da geração](docs/GERACAO-3D-SERVIDOR.md) para runtime, fila SQLite, fotos privadas, revisão, diagnóstico e teste de entrega HTTPS. `npm run worker:diagnose` verifica a configuração; `npm run worker` inicia o processo separado somente no ambiente validado.

`npm test` executa testes upstream pertinentes e regressões da integração com dados temporários. `npm audit` verifica dependências. Não há compilação Next.js nesta aplicação; o runtime é JavaScript ESM em Node. Hospedagem requer processo Node e disco persistente; hospedagem gratuita pública continua pendente de validação. O frontend Vercel antigo não muda ao executar este projeto localmente.

