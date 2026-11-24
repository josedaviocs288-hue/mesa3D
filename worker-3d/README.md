# Motor opcional de reconstrução por fotos

Este diretório contém o pipeline Python e o adaptador usado pelo worker do servidor Mesa3D. Não é um instalador para o computador do restaurante.

A integração permanece desativada até validar um host Linux gratuito, seu runtime e uma captura real. Consulte [GERACAO-3D-SERVIDOR.md](../docs/GERACAO-3D-SERVIDOR.md) para pré-requisitos, diagnóstico, configuração e aceite.

## Componentes

- `scripts/mesa3d-job.py`: preflight, manifesto, captura e execução do pipeline.
- `app/pipeline/`: validação de fotos e etapas de reconstrução/exportação.
- `sources.lock.json` e `requirements*.lock`: versões e dependências do motor. Instalar pacotes Python não instala por si só COLMAP, OpenMVS, Blender ou o sandbox necessários.
- `tests/`: testes de fotos, adaptador e regressões; não homologam fotogrametria pesada.
- [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md): avisos e licenças dos componentes, incluindo requisitos próprios de distribuição.

O site Node e o worker ficam na raiz do repositório. O caminho do pipeline pode ser definido explicitamente com `MESA3D_PIPELINE_ROOT`. Não usar o cliente Supabase antigo nem iniciar serviços pagos para completar a configuração.
