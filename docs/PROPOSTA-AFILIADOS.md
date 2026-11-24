# Proposta de programa de afiliados — Mesa3D

**Documento para aprovação · 19 de novembro de 2026**  
**Status:** proposta inicial. Nenhum percentual, compromisso de pagamento ou regra comercial foi ativado.

## 1. Objetivo

Permitir que parceiros indiquem restaurantes para contratar o Mesa3D e recebam uma porcentagem das vendas efetivamente pagas e atribuídas às suas indicações.

O programa busca ampliar as vendas com remuneração vinculada ao resultado. O afiliado acompanha suas indicações e comissões; a administração confere os pagamentos e controla os repasses.

**Escopo desta proposta:** comissão pela contratação do Mesa3D pelo restaurante. Não inclui comissão sobre os pedidos de comida feitos pelos consumidores.

## 2. Funcionamento proposto

1. A pessoa solicita participação e a administração aprova seu cadastro como afiliado.
2. O afiliado recebe um código exclusivo e um link de indicação.
3. O restaurante chega pelo link ou informa o código no cadastro/contratação.
4. O sistema registra a indicação, sem gerar comissão apenas por visita ou cadastro.
5. Após confirmação do pagamento da contratação, a comissão entra como **pendente**.
6. Encerrado o prazo de validação, sem cancelamento, estorno ou irregularidade, a comissão fica **disponível para pagamento**.
7. A administração faz o repasse manual, registra o comprovante e marca a comissão como **paga**.

O restaurante continua pagando pelo fluxo comercial definido para o Mesa3D. O programa de afiliados não cria, por si só, um meio de cobrança ou uma contratação paga que ainda não exista.

## 3. Modelos de comissão para escolha

| Modelo | Como funciona | Ponto de atenção |
| --- | --- | --- |
| **Primeiro pagamento** | O afiliado recebe uma porcentagem apenas do primeiro pagamento elegível do restaurante. | Menor compromisso futuro; precisa definir tratamento de planos anuais e descontos. |
| **Recorrência limitada** | O afiliado recebe uma porcentagem de cada pagamento elegível durante um número definido de meses. | Exige acompanhar renovações e encerrar o benefício na data prevista. |
| **Recorrência contínua** | O afiliado recebe uma porcentagem enquanto a assinatura indicada continuar elegível e paga. | Gera obrigação de acompanhamento e repasses por prazo indeterminado, conforme as regras aprovadas. |

**Proposta para o piloto:** começar com comissão sobre o primeiro pagamento elegível, com repasse manual. O percentual será definido pela pessoa responsável, após avaliar o preço do plano e quanto pode ser destinado à comissão. Essa sugestão não fixa uma taxa.

### Exemplos ilustrativos

Para um pagamento elegível de **R$ 100,00**, a comissão seria:

| Percentual a avaliar | Comissão |
| --- | ---: |
| 10% | R$ 10,00 |
| 20% | R$ 20,00 |
| 30% | R$ 30,00 |

Os valores servem somente para demonstrar a conta. Não representam preço aprovado do Mesa3D, taxa escolhida ou previsão de ganho.

**Base proposta de cálculo:** valor do plano efetivamente pago, após descontos, excluindo valores devolvidos. No piloto, taxas do meio de pagamento não seriam descontadas dessa base. Essa regra precisa de aprovação explícita.

## 4. Regras sugeridas para o piloto

Todas as regras abaixo são propostas sujeitas à aprovação.

| Tema | Regra proposta |
| --- | --- |
| Participação | Cadastro de afiliado aprovado manualmente pela administração. |
| Atribuição | Código informado pelo restaurante prevalece; na ausência dele, usar o último link válido registrado antes da contratação. |
| Prazo de indicação | Link válido por 30 dias, quando o navegador permitir registrar a indicação. O código é alternativa quando esse registro não estiver disponível. |
| Registro definitivo | Fixar o afiliado na contratação. Alterações posteriores somente pela administração, com justificativa e histórico. |
| Elegibilidade | Somente novos restaurantes contratantes; não atribuir clientes anteriores retroativamente. |
| Pagamento elegível | Cobrança confirmada por fonte confiável. Retorno de página, visita ou cadastro não comprovam pagamento. |
| Liberação | Aguardar 30 dias após a confirmação, condicionada à ausência de devolução ou irregularidade. Esse prazo é operacional proposto e não define direitos legais de cancelamento. |
| Repasses | Conferência e repasses uma vez por mês, manualmente, com comprovante. Sem saque automático no piloto. |
| Valor mínimo | Sem mínimo no piloto; eventuais alterações devem ser previamente aprovadas e comunicadas. |
| Autoindicação | Não remunerar contratação do próprio afiliado ou indicação simulada. Casos suspeitos vão para revisão humana. |
| Duplicidade | Cada pagamento gera no máximo uma comissão para um único afiliado. |
| Cancelamento e inadimplência | Não gerar comissão sobre cobranças não pagas. Cancelar comissões pendentes de pagamentos integralmente devolvidos. |
| Devolução parcial | Recalcular a comissão proporcionalmente ao valor que permaneceu pago. |
| Estorno após repasse | Registrar ajuste vinculado à comissão original, sem apagar o histórico. Compensação em saldo futuro depende dos termos aprovados. |
| Mudança de percentual | Aplicar novas regras apenas às contratações futuras; preservar a regra registrada nas contratações anteriores. |

## 5. Telas necessárias

### Painel do afiliado

- Link e código de indicação, com botão para copiar.
- Quantidade de restaurantes indicados e contratações confirmadas.
- Comissões pendentes, disponíveis, pagas e canceladas.
- Histórico de repasses e explicação de ajustes.
- Acesso às regras do programa e canal de suporte.

O afiliado vê somente suas próprias indicações. Não terá acesso aos cardápios privados, pedidos de comida, dados financeiros completos ou informações pessoais desnecessárias dos restaurantes.

### Painel da administração

- Aprovar, suspender e consultar afiliados.
- Consultar a atribuição de cada contratação e a confirmação de pagamento.
- Conferir e liberar comissões, com motivo para bloqueios e ajustes.
- Registrar repasses e comprovantes.
- Consultar totais e exportar relatório de conferência.
- Manter histórico de quem alterou regras, indicações ou pagamentos.

## 6. Controles essenciais

- Comissão calculada no servidor; valores enviados pelo navegador não determinam o saldo.
- Confirmações repetidas do mesmo pagamento não podem duplicar a comissão.
- Percentual, modelo e base de cálculo ficam registrados junto à contratação/comissão, preservando o histórico.
- Valores monetários armazenados em centavos, com regra única de arredondamento.
- Estornos e ajustes geram registros rastreáveis, em vez de apagar lançamentos anteriores.
- Suspensão de afiliado impede novas indicações elegíveis, mas não apaga valores anteriores; valores sob investigação são analisados conforme os termos.
- Links sem código válido não criam indicação fictícia.
- Perda de cookies, troca de aparelho ou armazenamento bloqueado podem impedir atribuição automática; o código informado na contratação oferece uma alternativa.

## 7. Estrutura técnica proposta

Integrar o módulo ao web do Mesa3D, mantendo seu visual e o SQLite existente. Não exigir outro serviço de banco ou aplicativo instalado.

Adicionar registros para afiliados, indicações/atribuições, regras de comissão, lançamentos e repasses. As mudanças de banco devem ser aditivas, com backup e teste de restauração antes de usar dados reais.

**Dependência principal:** definir e validar como a plataforma confirma o pagamento da contratação do restaurante. Se a cobrança ainda for manual, o piloto pode usar confirmação administrativa com referência e evidência; o sistema não deve apresentar essa conferência como confirmação automática do provedor. A automação por webhook só entra depois de validar a integração de cobrança.

Se o fluxo atual do Mesa3D não permitir contratar um plano de ponta a ponta, esse fluxo precisa ser definido antes de liberar comissões reais. O desenvolvimento das telas de afiliado não resolve essa dependência sozinho.

## 8. Custo e limites

O piloto pode ser desenvolvido sem contratar uma plataforma externa de afiliados e sem ativar processamento pago. Os repasses seriam manuais.

**Custo zero de ferramentas não significa custo zero do programa:** comissões são despesas reais. Tarifas de cobrança ou transferência, obrigações aplicáveis e capacidade de hospedagem precisam ser avaliadas antes da operação real. Esta proposta não estima esses valores nem declara uma hospedagem pública gratuita já disponível.

Ficam fora da primeira versão: carteira financeira, saque automático, divisão automática do pagamento, rede de afiliados em vários níveis, comissão sobre pedidos de comida, ranking e campanhas com regras diferentes.

## 9. Etapas de entrega

| Etapa | Entrega | Condição para avançar |
| --- | --- | --- |
| **1. Aprovação comercial** | Definir percentual, modelo, base de cálculo, elegibilidade, prazo e rotina de repasse. | Aprovação da pessoa responsável e definição dos termos de participação. |
| **2. Especificação técnica** | Detalhar telas, permissões, registros e integração com a confirmação de pagamento. | Validar o fluxo de contratação/cobrança e aprovar a especificação. |
| **3. Piloto em teste** | Cadastro, código/link, atribuição, cálculo, painéis e repasses manuais registrados. | Testes completos com dados fictícios, incluindo estornos e duplicidade. |
| **4. Piloto controlado** | Operação com grupo pequeno de afiliados aprovados. | Conferência administrativa de cada comissão e repasse; dados e regras reais validados. |
| **5. Expansão** | Ajustar o programa com base no piloto. | Avaliar operação, despesas, suporte e necessidade de automação. |

Prazos e orçamento de implementação serão estimados depois da escolha das regras e da validação da cobrança. Não há data de lançamento prometida nesta proposta.

## 10. Critérios de aceite

O piloto estará pronto para avaliação quando:

1. Um afiliado aprovado conseguir compartilhar seu código/link.
2. Uma contratação indicar de forma clara a quem foi atribuída.
3. Cadastro sem pagamento não gerar comissão disponível.
4. Um pagamento confirmado gerar uma única comissão com valor correto.
5. Cancelamento e devolução, inclusive parcial, produzirem os ajustes corretos.
6. Afiliado e administração visualizarem os mesmos lançamentos, respeitando suas permissões.
7. O repasse manual puder ser registrado com comprovante, sem pagamento duplicado.
8. Mudança de percentual não alterar comissões históricas.
9. Banco existente, dados dos restaurantes e funções atuais continuarem preservados.
10. Bloqueio de armazenamento no navegador não impedir o uso do cardápio ou o preenchimento manual do código.

## 11. Quadro para aprovação

| Decisão | Definição da pessoa responsável |
| --- | --- |
| Aprovar o desenvolvimento do piloto? | ☐ Sim ☐ Ajustar ☐ Não |
| Modelo de comissão | ☐ Primeiro pagamento ☐ Recorrência limitada ☐ Recorrência contínua |
| Percentual | ______ % |
| Se recorrente, duração | ______ meses ou regra: ____________________ |
| Base de cálculo e tratamento de descontos/taxas | ________________________________________ |
| Tratamento de planos anuais, se oferecidos | ________________________________________ |
| Prazo de atribuição | ______ dias |
| Prazo para liberar comissão | ______ dias |
| Data/periodicidade dos repasses | ________________________________________ |
| Método de repasse e eventual valor mínimo | ________________________________________ |
| Confirmação do pagamento da contratação | ☐ Provedor validado ☐ Conferência administrativa no piloto |
| Responsável por regras, termos e conferência | ________________________________________ |
| Grupo inicial de afiliados | ________________________________________ |
| Observações e condições de aprovação | ________________________________________ |

**Aprovado por:** ______________________________  
**Data:** ____ / ____ / ______

**Próximo passo após aprovação:** fechar as regras selecionadas e elaborar a especificação técnica. A aprovação desta proposta não ativa pagamentos nem autoriza promessas de comissão antes da definição dos termos.
