# Mesa3D 8.3.1 — Oracle Ubuntu 24.04 com geração de GLB a partir de fotos

Esta edição preserva o aplicativo e adiciona o script `deploy/instalar-oracle-com-3d-local.sh`. Ele tenta instalar COLMAP, compilar OpenMVS para CPU ARM64/AMD64 e executar o Node 24 **diretamente na VM** com Caddy, HTTPS e diretório persistente. Não requer Meshy.

**ATENÇÃO:** a integração do sistema existe, mas a compilação do OpenMVS na Oracle e uma reconstrução real de ponta a ponta **não foram testadas** neste ambiente. A compilação pode exigir ajustes nas dependências ou opções do OpenMVS conforme a revisão do GitHub, e processar 20–80 fotos pode ser lento ou ficar sem memória/disco na cota gratuita. A versão Docker antiga continua disponível, mas não inclui o motor local; use o instalador novo para esta modalidade.

## Na Oracle

1. Crie uma VM Ubuntu 24.04 Ampere A1 com, idealmente, **2 OCPUs e 12 GB de RAM** disponíveis dentro de sua cota, e disco suficiente (recomenda-se ao menos 80 GB, sujeito a sua cota real). Conserve backup: a VM não é armazenamento infalível.
2. Configure DNS (por exemplo DuckDNS) para o IP da VM; libere TCP 80/443 no OCI e no firewall do SO, mantendo a porta 8080 fechada externamente. Restrinja SSH 22 ao seu IP.
3. Envie a pasta `Mesa3D-Atelier` ao servidor, por exemplo com `scp -i ~/Downloads/chave.key -r Mesa3D-Atelier ubuntu@SEU_IP:/home/ubuntu/mesa3d`.
4. Conecte-se por SSH e execute:

```bash
cd ~/mesa3d
sudo bash deploy/instalar-oracle-com-3d-local.sh
```

5. Informe domínio e e-mail. **Guarde** a senha e o convite exibidos na primeira instalação. Abra `https://SEU_DOMINIO/acesso.html` e depois `/laboratorio-3d.html`.
6. Confira o estado do motor no laboratório. Envie de 20 a 80 fotos do objeto imóvel, com grande sobreposição; a primeira reconstrução real é o teste indispensável.

## Diagnóstico

```bash
sudo systemctl status mesa3d caddy
sudo journalctl -u mesa3d -n 100 --no-pager
sudo journalctl -u caddy -n 50 --no-pager
cd /opt/mesa3d
sudo node --input-type=module -e 'import {nativeStatus} from "./local-3d.js"; console.log(nativeStatus())' 
```

Se a compilação falhar, consulte a mensagem do `cmake` e o guia oficial de build do OpenMVS. **Não utilize `sudo bash deploy/instalar-oracle-gratis.sh` para este modo**: aquele script usa Docker sem as ferramentas 3D. O aplicativo só consegue reconstruir de fato se o motor informar que está pronto e o teste com fotos produzir um GLB íntegro.

Os dados são persistidos em `/var/lib/mesa3d`. Faça backups externos regulares. A chave e a senha ficam em `/etc/mesa3d.env`, que não deve ser compartilhado. O código executa até um trabalho de reconstrução por vez. Para uso comercial ou várias reconstruções simultâneas, considere máquina mais forte ou fila de processamento isolada.
