# MODO AUTOMATICO (Windows e Linux Mint/Ubuntu x64)

**Linux:** execute `Instalar-Mesa3D-Linux.sh` e consulte `GUIA-LINUX.md`. O instalador pode baixar o OpenMVS oficial verificado e dispensa configurar o terminal manualmente quando as dependencias sao compativeis.

## Windows 10/11 x64

**Use `Instalar-Mesa3D.bat` na pasta principal.** Ele baixa as dependencias e abre o site. Veja `LEIA-PRIMEIRO.md`.

O guia abaixo continua disponivel para Linux, instalacao manual e diagnosticos.

---

# Mesa3D 8.3.1 — gerar GLB de fotos reais SEM API e SEM hospedagem

O site roda no computador (`http://localhost:8080`). O motor e **LOCAL**: nenhuma fotografia precisa ser enviada para um servico externo. Nao ha custos de API. A configuracao inicial das ferramentas pode precisar de internet para baixar programas.

**Importante:** o ZIP inclui a **integracao**, mas NAO distribui binarios grandes de fotogrametria. Voce precisa instalar COLMAP e OpenMVS (ambos gratuitos) e disponibilizar no PATH os seis comandos. Em particular, use OpenMVS com `TextureMesh --export-type glb`; a build do Windows 2.4.0 não expõe obrigatoriamente `TransformScene --convert`. Nao ha garantia de bom resultado com qualquer lote de fotos.

## Passo 1 — abrir o site

1. Instale Node.js 24 ou superior.
2. Extraia o ZIP em uma pasta normal (nao execute de dentro do ZIP).
3. Execute `Iniciar-Mesa3D-Gratis.bat` (Windows) ou `bash Iniciar-Mesa3D-Gratis.sh` (Linux).
4. Na primeira abertura, o terminal exibe login e senha gerados automaticamente. Guarde a senha.
5. Entre em `http://localhost:8080/acesso.html` e abra `http://localhost:8080/laboratorio-3d.html`.

## Passo 2 — instalar o motor local

- Baixe e instale **COLMAP** pela documentacao oficial: https://colmap.github.io/install.html
- Baixe **OpenMVS** (binaries de release para Windows/Ubuntu) por: https://github.com/cdcseacave/openMVS/releases e consulte https://github.com/cdcseacave/openMVS/blob/develop/docs/wiki/Building.md
- Coloque as pastas que contem os executaveis no `PATH` do sistema. Se preferir uma so pasta com todos os executaveis, configure `MESA3D_3D_BIN_DIR` no `.env` com esse caminho (sem aspas). 
- Conferir: execute `Conferir-3D-Local.bat` ou `bash Conferir-3D-Local.sh`.

O checker deve encontrar estes comandos:

```
colmap
InterfaceCOLMAP
DensifyPointCloud
ReconstructMesh
TextureMesh
TransformScene
```

**Windows:** nas releases do COLMAP, pode ser necessario usar o executavel CLI e adicionar tambem o diretorio de DLLs ao PATH. Feche e reabra o terminal depois de alterar o PATH. Se os programas estiverem em pastas diferentes, use o PATH, nao `MESA3D_3D_BIN_DIR`.

**Ubuntu/Linux Mint:** a instalacao de `colmap` pode ser feita com `sudo apt install colmap`, dependendo da distribuicao. O OpenMVS pode exigir usar uma release precompilada ou build conforme as instrucoes oficiais. `node:sqlite` requer Node.js 24+ para a configuracao testada do site.

## Passo 3 — fotografar e gerar

1. Deixe o prato imovel sobre superficie com detalhes visiveis. Prefira luz difusa, sem reflexo e sem pessoas no enquadramento.
2. Tire entre **20 e 80 fotos** em circulos completos, em duas ou tres alturas, com 60–80% de sobreposicao. Use sempre o MESMO prato sem mover a comida.
3. Abra o Laboratorio 3D, selecione JPG/PNG e clique em **Gerar modelo 3D local**.
4. Deixe o servidor ligado; uma reconstrucao pode durar muito tempo e usar bastante RAM. O painel mostra as etapas, um percentual **aproximado**, logs e falhas.
5. Se gerar um GLB, gire e compare com as fotos. Use **Baixar GLB**. Se veio do Estudio de um prato, use **Enviar ao prato para revisao**, depois confirme o resultado no Estudio antes de aprovar.

**Teste com prato cadastrado:** entre no Estudio, crie e salve um prato (com porcao, medidas reais e pelo menos uma foto), reabra para editar e clique em **Criar GLB local com 20–80 fotos**. O Laboratorio vai associar o GLB a essa porcao (apos sua confirmacao).

## O que o motor realmente faz

COLMAP encontra correspondencias entre as fotos, estima a posicao das cameras e corrige as lentes; OpenMVS calcula pontos densos, cria uma malha, textura e exporta um GLB. O GLB gerado NAO e uma copia de um modelo demonstrativo. Tudo roda no seu computador e e chamado pelo site. O codigo de orquestracao fica em `local-3d.js`.

**Limites importantes:** pouca textura, superfices brilhantes/transparentes, fotos desfocadas, pouca sobreposicao e PCs com memoria limitada podem produzir falhas ou modelos ruins. Com 8 GB de RAM use fotos moderadas e nenhum outro programa pesado. A geracao nao exige GPU dedicada, mas pode ser MUITO lenta e depende das versoes das ferramentas instaladas. O arquivo precisa de revisao humana antes da publicacao.

## Erros e dicas

- `Ferramentas faltando`: instale as ferramentas e reinicie o Mesa3D; rode `Conferir-3D-Local`.
- `Nao foi possivel alinhar as fotos`: tire fotos com maior sobreposicao, de pelo menos duas alturas, em torno do prato imovel.
- `DensifyPointCloud` falhou: limite de RAM, problemas de GPU/CPU ou fotografias ruins. Tente reduzir as fotos e confira o log.
- `Nao gerou GLB`: verifique `TextureMesh --help` e o registro de `TextureMesh --export-type glb` em `processamento.log`.
- `Proporcoes incompatíveis`: verifique as medidas reais e o eixo vertical Y/Z antes de ajustar para a porcao; o sistema nao deve deformar um prato para passar na verificacao.
- `GLB excede 20MB/180mil triangulos`: otimize o modelo localmente antes de publicar no celular. A reconstrucao pode gerar GLBs maiores do que o permitido no Estudio.
- `Servidor reiniciou`: o trabalho em progresso e marcado como falha e exige novo envio; o programa nao finge que ele terminou.

## Comprovação e privacidade

O codigo tem testes de fluxo, seguranca e verificacao de GLB (`npm test`). Os testes de orquestracao nao garantem que uma foto real gerou um modelo fotorealista. **Para comprovar o motor completo, e necessario instalar COLMAP/OpenMVS e testar fotos reais na sua maquina**. O projeto foi preparado para esse teste, nao entregue como scan fotograficamente validado.
