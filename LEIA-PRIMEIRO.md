# Mesa3D v8.3.1 — instalacao automatica para TESTES (Windows e Linux Mint)

**Correção de novembro/2026:** consulte `CORRECAO-v8.3.1.md` se você já instalou a v8.3 e recebeu falso `[FALTA]` para OpenMVS.

**No Linux Mint:** abra [`GUIA-LINUX.md`](GUIA-LINUX.md), extraia o ZIP e clique em `Instalar-Mesa3D-Linux.sh`. Depois use `Abrir-Mesa3D-Linux.sh`.

**No Windows:** nao precisa saber programacao. Voce nao precisa instalar Node, COLMAP ou OpenMVS manualmente.

## Windows: apenas dois passos

1. **Extraia todo o ZIP** para uma pasta comum (por exemplo `Documentos\\Mesa3D`) e abra `Instalar-Mesa3D.bat` com dois cliques. Deixe o Windows conectado a internet para **baixar** as ferramentas oficiais. Nao execute dentro da janela do ZIP. A primeira instalacao precisa de internet, pode baixar mais de 200 MB e utiliza espaco adicional durante a extracao. **Nao execute como administrador.**
2. O **site abre automaticamente** no navegador. Para reabrir outra vez, clique no atalho **Mesa3D** criado na sua area de trabalho (ou `Abrir-Mesa3D.bat`). O bloco de notas abre as credenciais de teste `ACESSO-LOCAL.txt`; use-as na tela de login. Entre no **Laboratorio 3D** e selecione 20 a 80 fotos do mesmo prato.

Apos a instalacao, o gerador e o site funcionam no proprio computador, sem hospedagem e sem API. A primeira instalacao precisa de internet para baixar programas e bibliotecas.

## O que o instalador configura

- Node.js 24, isolado na pasta do Mesa3D (sem alterar a instalacao do sistema), com verificacao SHA256 da versao oficial.
- Dependencias NPM do projeto.
- OpenMVS 2.4.0 CPU para Windows x64 (hash oficial verificado). Se nao oferecer a reconstrucao das cameras, baixa tambem COLMAP 4.2.1 CPU (hash oficial verificado).
- Credenciais aleatorias para o painel (criadas apenas no PC de cada pessoa), servidor local e atalho na area de trabalho.
- Checagem real das ferramentas antes de declarar o motor 3D pronto.

Se alguma dependencia falhar ou um antivirus bloquear o programa, o instalador **mostra erro em vez de declarar que funcionou**. Ele nao instala programas sem seu conhecimento: os downloads sao das releases oficiais do Node.js, OpenMVS e COLMAP. O Windows pode pedir confirmacao por serem programas de terceiros nao assinados.

## Teste do 3D

1. Primeiro clique no **Usar modelo demonstrativo** para confirmar a visualizacao. Ele **nao** e uma reconstrucao real.
2. Tire 20–80 fotos JPG/PNG com boa luz, movendo a camera em volta de um prato **imovel**, com sobreposicao entre as imagens (60–80%).
3. No Laboratorio 3D clique em **Gerar modelo 3D local** e observe as etapas. O processamento pesado pode exigir muita memoria e levar bastante tempo. Evite encerrar o PC durante a reconstrução.
4. Se aparecer **GLB gerado**, gire o modelo, compare as fotos e baixe o arquivo. Para publicar, faca a revisao no Estudio.

**Importante:** modelo geometrico correto e bonito depende da captura, do hardware e das ferramentas. A instalacao automatica e o fluxo programado nao significam que um prato real ja tenha sido escaneado e validado. Fotogrametria de alimentos pode falhar com reflexos, superficies uniformes, transparencias e falta de fotos.

## Privacidade e seguranca

- Em testes, a aplicacao usa `127.0.0.1:8080` e os dados ficam no seu computador.
- Nao envie `ACESSO-LOCAL.txt`, `.env`, `data` ou a pasta `.mesa3d` quando compartilhar o projeto; envie o ZIP original.
- **Nao exponha esta instalacao direta na internet**: as credenciais locais e a configuracao de teste nao foram feitas para acesso publico.
- Para compartilhar com outro tester basta enviar o ZIP; cada instalacao criara senha separada.

## Problemas

- **Windows 32 bits / PC ARM:** este instalador foi projetado para Windows x64.
- **Sem internet na primeira instalacao:** rode o instalador conectado. Depois nao precisa de API ou conta na nuvem.
- **Instalador falhou:** leia a mensagem no terminal e execute novamente `Instalar-Mesa3D.bat`. O instalador preserva dados existentes.
- **Site nao abre:** veja `data/servidor-erros.log`, e certifique-se que a porta 8080 nao esta sendo usada por outro programa.
- **Motor 3D incompleto:** o processo interrompe a instalacao; nunca diz que o modelo foi gerado se nao produziu GLB binario.

Testes automatizados internos ficam em `npm test`, mas nao substituem uma reconstrucao com fotografias reais no Windows.
