# Mesa3D v8 — Hospedagem sem mensalidade de servidor

## O que foi escolhido

**Oracle Cloud Always Free (VM Ubuntu + Docker + Caddy)** é a opção de implantação gratuita com persistência do SQLite e dos GLB que exige menos alterações do projeto atual. O serviço público funciona em HTTPS e todo fluxo de restaurante, fotos, geração opcional por API, pedidos, 3D e revisão fica no site. **Não depende de Cloudflare nem Supabase.**

Limites: conta e cartão de verificação; capacidade disponível pode faltar na região; VMs ociosas podem ser recuperadas; cotas Always Free e políticas mudam. O Mesa3D não foi implantado em uma conta Oracle nesta entrega. Não há garantia de disponibilidade comercial contínua.

**A API Meshy para reconstrução de 2–4 fotos é OPCIONAL e pode exigir créditos pagos.** Hospedagem grátis e geração de GLB gratuita são serviços distintos. Sem chave Meshy, upload de GLB, visualização, escala, aprovação e AR continuam disponíveis. O projeto não promete recriar pratos por fotogrametria sem uma API ou um modelo externo.

## Publicar (Windows + Oracle)

1. Crie a conta em https://www.oracle.com/cloud/free/ .
2. Crie instância Ubuntu Always Free, preferencialmente A1 Flex; escolha 1 OCPU/6 GB RAM ou mais, respeitando suas cotas. Marque IPv4 público e baixe a **chave privada SSH**, guardando-a localmente.
3. Na Security List ou NSG, libere TCP 80/443 para a internet. SSH TCP 22 para **seu IP**, não para todos.
4. Crie um domínio como `seu-mesa3d.duckdns.org` em https://www.duckdns.org/ e aponte o registro A para o IP da VM.
5. No PowerShell do Windows, na pasta que contém Mesa3D-Atelier:

   ```powershell
   scp -i "C:\CHAVE\minha-chave.key" -r ".\Mesa3D-Atelier" ubuntu@IP_DA_VM:/home/ubuntu/mesa3d
   ssh -i "C:\CHAVE\minha-chave.key" ubuntu@IP_DA_VM
   ```

6. Dentro da VM execute **apenas**:

   ```bash
   cd /home/ubuntu/mesa3d
   sudo bash deploy/instalar-oracle-gratis.sh
   ```

7. Informe seu domínio sem HTTPS, e-mail e guarde as credenciais geradas. Abra `https://SEU-DOMINIO/acesso.html` para o proprietário; `https://SEU-DOMINIO/convite.html` para o piloto privado, e `/laboratorio-3d.html` para análise de GLBs.

## Se a porta 80/443 não abrir

Verifique tanto as regras OCI quanto firewall Ubuntu. Na VM, `sudo docker compose --env-file .env.production ps` e `sudo docker compose --env-file .env.production logs -f caddy`.

## Para ficar online com custo zero no piloto

- Site+API: VM Oracle Always Free.
- Banco e arquivos: volume persistente da própria VM, não Render Free.
- SSL: Caddy/Let's Encrypt.
- Domínio: DuckDNS gratuito.
- Geração 3D: upload GLB sem API paga; integração Meshy opcional, cuja API pode ser cobrada.

Sem pagamento online, os pedidos podem seguir pelo fluxo do restaurante. Se ativar Mercado Pago, haverá possíveis taxas do processador; não é exigido para testar o cardápio.

## Alternativas que **não** foram escolhidas

Render Free e Koyeb Free desligam instâncias ociosas e **não oferecem disco persistente gratuito** para este SQLite e seus uploads. Cloudflare Workers/Pages não pode executar diretamente o servidor Node/SQLite em sua forma atual, exigindo reescrita para armazenamento externo. Para evitar perda de pedidos e imagens, não recomendo simplesmente copiar a aplicação para um desses serviços.

## Antes de receber pedidos reais

Faça backup do `runtime-data` junto com o banco, configure monitoramento de falhas, revise permissões e teste os pagamentos com contas de testes. Nunca publique `.env` ou `.env.production` em GitHub. Teste GLB e AR em celulares reais; o simulador não prova escala física.
