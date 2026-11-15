# Mesa3D 8.3 — Linux Mint / Ubuntu (beta)

## Abrir e testar com 2 passos

**Compatibilidade prevista:** Linux Mint 22.x XFCE/Cinnamon e Ubuntu 24.04, computadores Intel/AMD **x86_64**. Não testado em todas as distribuições Linux, nem em Linux ARM.

1. **Extraia o ZIP inteiro** para `Documentos/Mesa3D` ou outra pasta na qual seu usuário tenha permissão de escrita. Dê dois cliques em **`Instalar-Mesa3D-Linux.sh`** e selecione **Executar no terminal** (o Linux Mint pode perguntar se deseja executar ou apenas visualizar). A primeira vez requer internet, vários GB de espaço livre e pode demorar devido ao download do Node.js, OpenMVS e bibliotecas NPM. O instalador **não** pede conta, hospedagem ou API. Se o arquivo abrir como texto, clique com botão direito → Propriedades → Permissões → **Permitir executar como programa**; ou use o terminal uma única vez: `bash Instalar-Mesa3D-Linux.sh` dentro da pasta extraída.
2. Ao terminar, o instalador **abre o site**. Nas próximas vezes dê dois cliques em **`Abrir-Mesa3D-Linux.sh`** ou no atalho **Mesa3D** criado na área de trabalho. O Linux pode pedir que você confie no atalho na primeira vez. Abra `ACESSO-LOCAL.txt` na pasta do Mesa3D para ver login e senha; isso é gerado localmente e não pode ser compartilhado.

O site é `http://127.0.0.1:8080/acesso.html`. O laboratório é `http://127.0.0.1:8080/laboratorio-3d.html` depois do login.

## O instalador realmente configura

- Node.js 24 portátil: transferido do `nodejs.org`, com SHA256 validado a partir da lista oficial, sem mexer no Node já instalado no PC.
- Bibliotecas JavaScript do Mesa3D (`npm ci`) e credenciais locais aleatórias.
- OpenMVS **v2.4.0 para Ubuntu x64**, obtido da release oficial do GitHub com verificação do campo **SHA256** da API; se não houver pacote ou verificação, interrompe a instalação com erro em vez de executar um binário de origem incerta.
- Se a release não incluir `CreateStructure`, tenta instalar `colmap` pelo gerenciador APT (pode pedir a senha do Linux). Caso a instalação não seja possível, informa a falha.
- Verifica os executáveis do motor antes de permitir que o teste seja considerado instalado; cria atalho `.desktop`.

O instalador não exige GPU dedicada. **Reconstruir em CPU pode ser lento e exigir bastante RAM**. Quando usar um notebook com 8 GB, reduza resolução e evite rodar outros aplicativos pesados durante a geração.

## Validar um prato real

1. No laboratório, clique em **Usar modelo demonstrativo** para confirmar que o visualizador GLB funciona. Este arquivo é ilustrativo.
2. Tire **20 a 80 fotos reais**, com aproximadamente 60–80% de sobreposição, câmera em movimento e comida parada, sob luz difusa. Use JPG ou PNG.
3. Clique **Gerar modelo 3D local** e acompanhe os registros. Ao terminar, o próprio site mostra o GLB; o arquivo pode ser baixado ou vinculado a um prato para revisão.
4. Confira contornos, texturas e escala. Uma execução que termine com erro **não** é tratada como GLB bem-sucedido.

**Limitação central:** esta integração não foi homologada com fotos reais no Linux Mint. Os testes internos verificam os scripts, a fila e o tratamento do GLB, mas não garantem boa reconstrução de qualquer prato. Superfícies brilhantes, reflexos, pouca textura e fotos ruins podem falhar.

## Problemas comuns

- Instalador não abre: extraia os arquivos e marque o `.sh` como executável ou rode `bash Instalar-Mesa3D-Linux.sh` em um terminal.
- Falha em download: confira a conexão e tente novamente; pacotes verificados são reaproveitados.
- Motor faltando: confira `data/instalacao-linux.log`. Caso queira diagnosticar no terminal, execute `.mesa3d/node/bin/node --env-file=.env tools/check-local-3d.mjs` a partir da pasta do projeto.
- Pacote do OpenMVS incompatível / bibliotecas ausentes: o instalador mostrará erro e não marcará a instalação como concluída. O binário para Ubuntu pode variar de compatibilidade entre versões do Linux.
- Site não abre: veja `data/servidor-erros.log`; a porta 8080 pode estar ocupada.
- Para executar novamente, **não apague** `.env`, `ACESSO-LOCAL.txt`, `data`, nem `.mesa3d`. O instalador reaproveita dados existentes.

## Privacidade

O site usa `127.0.0.1`, sem hospedagem pública nem API de 3D. A instalação inicial baixa software livre dos fornecedores oficiais; depois fotos/modelos ficam no disco local. **Não exponha a instância de teste diretamente na internet.** Para mandar a outro usuário, encaminhe o ZIP original, nunca a pasta depois de instalada (ela contém credenciais privadas).
