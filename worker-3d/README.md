# Motor 3D próprio

## Integração Mesa3D no servidor

A entrada atual para geração no servidor Mesa3D é `scripts/mesa3d-job.py`, chamada pelo worker Node em `web/tools/reconstruction-worker.mjs`. Consulte [operação da geração no servidor](../docs/GERACAO-3D-SERVIDOR.md). Não usa o cliente Supabase nem instala motor no computador do restaurante. Continua desativada até validar o host e seu runtime. As seções abaixo documentam executores/pilotos anteriores, não a ativação automática desta integração.

O executor local do restaurante usa uma distribuição WSL 2 dedicada e o
pacote de `distribution/build-runtime.sh`. Consulte o
[manual do Windows](../docs/MOTOR-3D-CLIENTE-WINDOWS.md) para instalação,
homologação, atualização e revogação. A geração continua desativada enquanto
o pacote e o ambiente real aguardam homologação.

## Piloto legado

Pipeline implementado para FFmpeg → COLMAP → OpenMVS → preparação/exportação em Blender.
**O runtime foi construído no Vercel Sandbox e gerou GLB texturizado real.
O recorte ainda não foi aceito visualmente; o Dockerfile permanece sem build.**
Os testes de unidade não comprovam fidelidade do prato. Operação remota permanece
desabilitada até validação e disponibilidade de host.

Consulte `docs/RECONSTRUCAO-OPERACAO.md` na raiz para implantação, licenças e limites.
O processo de trabalho é `python -m app.runner`; a API FastAPI abaixo serve apenas
para healthcheck. Os antigos jobs em memória retornam 410.

Para executar:

```bash
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001
```

API em `http://localhost:8001/docs`.

## Etapas da reconstrução

1. Armazenar vídeo original em bucket privado com URL assinada.
2. Extrair frames e validar qualidade da captura.
3. Realizar reconstrução 3D (avaliar fotogrametria/NeRF/Gaussian splatting + conversão para mesh).
4. Limpar malha, reduzir polígonos, gerar textura e exportar GLB.
5. Calibrar escala com medida conhecida e comparar o resultado ao prato real.
6. Entregar a prévia e o resultado à API de controle autenticada.

Nem todo prato admite reconstrução automática de qualidade. Prever revisão humana e possibilidade de regravação.
