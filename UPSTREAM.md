# Origem e adaptações

Base: https://github.com/josedaviocs288-hue/mesa3D
Revisão: bba11fcf87a20349e7c27149028fa9724e23ce5b

Importados: server.js, platform.js, glb.js, local-3d.js (retirado do runtime na integração), package.json/lock, public/, ferramentas create-scale-model.mjs e prepare-demo.js, testes server/glb/laboratorio. Sem instaladores, credenciais, banco, túneis ou execução automática de ferramentas recebidas. Não havia arquivo LICENSE na árvore examinada; a importação a pedido do usuário não atribui licença adicional ao material upstream.

Testes de instaladores e motor local não integram esta aplicação web. Manter cobertura upstream de servidor, GLB e laboratório. Recursos de recuperação/AR e preparação são adaptados do PratoAR; dependências e assets conservam seus avisos próprios. Não reutilizar modelos externos sem seus créditos e licença.

No repositório Mesa3D, web/ corresponde à raiz e o manual é OPERACAO.md. O caminho padrão do worker Python foi adaptado para worker-3d/ na raiz; nenhuma função do motor foi alterada nessa adaptação.
