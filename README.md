# LIDERY MEDIA AGENCY — SISTEMA WEB DE GESTÃO COMERCIAL, NFC & COMISSÕES

Sistema web completo, profissional, responsivo e integrado para controle de vendas de **Plaquinhas NFC de avaliação do Google**, vendedores, representantes comerciais, comissões em múltiplos níveis e pagamentos.

---

## 1. ACESSO RÁPIDO & CREDENCIAIS INICIAIS

- **URL Padrão Local:** `http://localhost:3000`
- **Link Unificado:** Todos os perfis utilizam o mesmo endereço de acesso.
- **Administrador Inicial Configurado:**
  - **Usuário:** `publisher1490`
  - **Senha Inicial:** `lid54321@!`
  - **Segurança:** O sistema exige alteração de senha no primeiro acesso (`must_change_password`). A senha é armazenada com hash criptográfico `scrypt` salteado com 64 bytes de chave. Nunca é exposta no frontend.

---

## 2. ARQUITETURA E TECNOLOGIAS UTILIZADAS

| Camada | Tecnologia | Descrição & Justificativa |
| :--- | :--- | :--- |
| **Backend** | Node.js v24 Nativo | Arquitetura de alto desempenho sem dependências externas frágeis (`node:http`, `node:crypto`, `node:sqlite`). |
| **Banco de Dados** | SQLite 3.53 com WAL | Banco de dados relacional persistente com modo WAL (*Write-Ahead Logging*), suporte a chaves estrangeiras (`PRAGMA foreign_keys = ON`), transações ACID completas e zero necessidade de configuração de servidores externos. Portável para PostgreSQL sem alterações conceituais. |
| **Frontend** | SPA Responsivo (HTML5 / CSS3 / Vanilla JS) | Design minimalista, elegante e profissional em preto, branco e tons de cinza. Layout adaptável para celular, tablet e computador com menus colapsáveis e cálculo de comissões em tempo real. |
| **Autenticação** | Sessões Seguras + Scrypt | Tokens criptograficamente seguros de 256 bits, limitação de taxa contra força bruta (15 minutos de bloqueio após 5 tentativas incorretas) e validação estrita de perfis. |
| **Auditoria** | Trilha Rastreável Permanente | Tabela `audit_logs` que registra criação de usuários, alterações de vínculos, aprovações, recusas, cancelamentos, pagamentos e estornos. |

---

## 3. REGRAS COMERCIAIS & FÓRMULAS DE COMISSÃO

O produto principal inicial é a **Plaquinha NFC de avaliação do Google**. O sistema já está preparado para o administrador cadastrar novos produtos.

### Parâmetros de Preço:
- **Preço Mínimo:** R$ 70,00 por plaquinha.
- **Preço Sugerido:** R$ 85,00 por plaquinha.
- **Preço Máximo:** Sem teto (sem limite superior).

Exibido em destaque nos painéis de vendedores e representantes:
> *"Nosso preço mínimo é de R$ 70,00 por plaquinha e o preço sugerido é de R$ 85,00. Você pode vender por um valor superior, sem limite máximo. Quanto maior o valor da venda, maior será sua comissão!"*

### Regras de Venda e Validação no Backend:
1. **Venda a R$ 85,00 ou mais:** Aprovada e processada normalmente.
2. **Venda entre R$ 70,00 e R$ 84,99:** Permitida, exibindo aviso de valor abaixo do sugerido.
3. **Venda abaixo de R$ 70,00:** Exige **justificativa obrigatória** e **autorização explícita do administrador**. A venda entra com flag `below_min_price` e status `pending_approval`.

### Regras de Comissionamento:
- **Comissão do Vendedor:** **10%** sobre o valor total aprovado da venda.
  $$\text{Comissão Vendedor} = \text{Valor da Venda} \times 0{,}10$$
- **Comissão Própria do Representante:** **20%** sobre suas próprias vendas aprovadas.
  $$\text{Comissão Própria Rep} = \text{Valor da Venda} \times 0{,}20$$
  *(Uma venda própria do representante NÃO gera 5% indireto adicional para ele mesmo).*
- **Comissão Indireta do Representante:** **5%** adicional sobre as vendas aprovadas dos vendedores vinculados à sua equipe.
  $$\text{Comissão Indireta Rep} = \text{Valor da Venda do Vendedor} \times 0{,}05$$
  *(Os 5% são pagos pela empresa e NÃO são descontados dos 10% do vendedor).*
- **Vendedor sem Representante Vinculado:** Gera exclusivamente a comissão direta de 10% para si.

---

## 4. FUNCIONALIDADES DOS MÓDULOS

### 👤 Módulo do Vendedor
- **Dashboard Pessoal:** Total vendido no período, quantidade de vendas, ticket médio, comissões geradas, aguardando aprovação, aprovadas pendentes de repasse e já pagas.
- **Filtros de Período:** Hoje, Últimos 7 dias, Mês Atual, Mês Anterior, Ano Atual e Personalizado.
- **Registro de Vendas:** Formulário intuitivo com cliente, telefone/WhatsApp, cidade, produto, quantidade, valor unitário, forma de pagamento (Pix, Dinheiro, Débito, Crédito parcelado, Boleto, etc.), com cálculo automático de comissão estimada.
- **Histórico e Status:** Acompanhamento de aprovação e pagamento do cliente. Permite solicitar correções ou cancelamentos com justificativa direcionada ao administrador.
- **Extrato de Comissões:** Detalhamento por venda e previsão de quitação.
- **Perfil & Segurança:** Alteração da própria senha mediante confirmação da senha atual.

### 👔 Módulo do Representante
- **Dashboard Consolidado:** Separação visual clara entre **Vendas Próprias (20%)** e **Vendas da Equipe (5%)**.
- **Minha Equipe:** Visualização de todos os vendedores vinculados, data de vinculação, vendas aprovadas, faturamento gerado e comissão indireta proporcionada ao representante.
- **Vendas da Equipe em Tempo Real:** Atualização automática das vendas realizadas pelos vendedores vinculados sem recadastro.
- **Vendas Próprias:** Permite registrar vendas com comissão automática de 20%.
- **Financeiro:** Extrato de comissões próprias, indiretas e pagamentos recebidos.

### 👑 Módulo do Administrador
- **Dashboard Executivo:** Faturamento registrado, valores efetivamente recebidos (pagamentos confirmados dos clientes), valores a receber (parcelados/pendentes), comissões a pagar, comissões pagas e saldo financeiro estimado após comissões.
- **Gestão Geral de Vendas:** Aprovação com 1 clique, recusa com motivo, cancelamento rastreável e atualização do status de pagamento do cliente.
- **Gestão de Usuários:** Criação de contas de vendedores e representantes, redefinição segura de senhas, ativação/desativação e vinculação/desvinculação de equipes com histórico completo.
- **Central de Pagamentos:** Quitação de comissões individualmente ou em lote para um mesmo profissional, prevenindo duplicidades e registrando comprovante de transação (ex: Pix).
- **Estorno Rastreável:** Caso uma venda cancelada já tenha tido sua comissão paga, o sistema gera automaticamente um ajuste financeiro rastreável (`financial_adjustments`) com saldo negativo, mantendo a integridade contábil.
- **Relatórios & Exportação:** Vendas por período, ranking de vendedores e representantes, desempenho de equipes e **exportação completa em CSV** compatível com Excel.
- **Parâmetros Comerciais:** Painel para ajustar percentuais de comissão e preços mínimo e sugerido para vendas futuras.
- **Auditoria:** Registro imutável de todas as ações sensíveis com data, usuário e detalhes.

---

## 5. RELATÓRIO DOS TESTES OBRIGATÓRIOS (14/14 APROVADOS)

O sistema conta com suíte de testes de ponta a ponta automatizada que valida os 14 requisitos obrigatórios:

| Nº | Teste | Resultado | Detalhes da Validação |
| :---: | :--- | :---: | :--- |
| **1** | **Login** | ✅ PASSOU | Login com credenciais válidas, bloqueio de senha incorreta, bloqueio de elevação por perfil selecionado na tela inicial e proteção de rotas privadas. |
| **2** | **Venda de Vendedor** | ✅ PASSOU | Venda de R$ 100,00 gerou comissão de exatamente R$ 10,00 (10%). |
| **3** | **Venda Própria de Representante** | ✅ PASSOU | Venda própria de R$ 100,00 gerou exatamente R$ 20,00 (20%), sem os 5% indiretos duplicados. |
| **4** | **Venda de Vendedor Vinculado** | ✅ PASSOU | Venda de R$ 100,00 gerou R$ 10,00 para o vendedor e R$ 5,00 para o representante (total R$ 15,00) integrados nos 3 módulos. |
| **5** | **Vendedor sem Representante** | ✅ PASSOU | Venda de R$ 100,00 gerou 10% para o vendedor e zero comissão indireta para terceiros. |
| **6** | **Preços** | ✅ PASSOU | Validação de R$ 70,00, R$ 85,00, R$ 100,00 e R$ 200,00 (sem teto). Bloqueio estrito de vendas abaixo de R$ 70,00 sem justificativa. |
| **7** | **Cancelamento & Estorno** | ✅ PASSOU | Cancelamento de comissões pendentes e criação de ajuste financeiro negativo (-R$ 10,00) rastreável para comissões já quitadas. |
| **8** | **Pagamento** | ✅ PASSOU | Pagamento em lote consolidado, atualização atômica de status para pago e bloqueio total de duplicidade de pagamento. |
| **9** | **Segurança** | ✅ PASSOU | Isolamento de dados entre usuários e bloqueio de adulteração de IDs em URLs/APIs. |
| **10** | **Persistência** | ✅ PASSOU | Validação de persistência física dos registros no banco de dados SQLite entre reinicializações do servidor. |
| **11** | **Integridade Financeira** | ✅ PASSOU | Reconciliação dos indicadores dos painéis com a soma das comissões e vendas individuais. |
| **12** | **Responsividade** | ✅ PASSOU | Interface com viewport responsiva, sistema de grid, badges e drawer colapsável para celular e tablet. |
| **13** | **Hospedagem & Servidor** | ✅ PASSOU | Servidor HTTP nativo com headers de segurança (`nosniff`, `SAMEORIGIN`), roteamento de SPA e resposta 200 OK. |
| **14** | **Backup & Restauração** | ✅ PASSOU | Criação de arquivo de backup SQLite íntegro e validação de restauração completa dos dados. |

Para reexecutar a suíte completa de testes:
```powershell
.\node.cmd scripts/test-runner.js
```

---

## 6. INICIALIZAÇÃO, HOSPEDAGEM E IMPLANTAÇÃO

### Execução Local Rápida:
Execute o script fornecido no diretório raiz:
```powershell
.\start.cmd
# ou via PowerShell:
.\start.ps1
```
O servidor será iniciado em `http://localhost:3000`.

### Execução com Docker:
```bash
docker build -t lidery-app .
docker run -d -p 3000:3000 -v lidery-data:/app/data --name lidery-media lidery-app
```

### Publicação em Nuvem (Render, Railway, Fly.io ou VPS):
O projeto é 100% autossuficiente e roda em qualquer ambiente Node.js moderno (versão >= 22.0.0):
1. **Render.com:**
   - Tipo de serviço: *Web Service*
   - Ambiente: *Node*
   - Build Command: *(nenhum necessário ou `npm --version`)*
   - Start Command: `node server.js`
   - Adicione um disco persistente montado em `/app/data` para reter o banco de dados entre deploys.
2. **Railway.app / Fly.io:**
   - Detecta o `Dockerfile` automaticamente.
   - Configure a variável de ambiente `PORT=3000`.
   - Adicione um volume persistente apontado para `/app/data`.
3. **Domínio Personalizado:**
   - No painel da hospedagem (ex: Render ou Cloudflare), configure o registro CNAME apontando para seu subdomínio corporativo (ex: `sistema.liderymedia.com.br`).

---

## 7. BACKUP, RESTAURAÇÃO E PORTABILIDADE

### Criar Backup do Banco de Dados:
O comando cria uma cópia atômica consistente e segura em `backups/`:
```powershell
.\node.cmd scripts/backup.js
```

### Restaurar Backup:
```powershell
.\node.cmd scripts/restore.js backups/backup-lidery-YYYY-MM-DD.db
```

### Periodicidade e Políticas Recomendadas:
- **Frequência:** Diária automática (configurável via agendador de tarefas do Windows ou cron no Linux).
- **Retenção recomendada:** Últimos 30 dias de backups diários e 12 backups mensais.
- **Custo:** R$ 0,00 (armazenamento local ou sincronizado em Google Drive / AWS S3).
- **Tamanho médio:** Menos de 1 MB para milhares de vendas e usuários.

---

## 8. CUSTOS E LIMITES DE SERVIÇOS

- **Banco de Dados:** SQLite nativo integrado — Custo R$ 0,00. Sem limites arbitrários de conexão ou linhas impostos por terceiros.
- **Backend & Servidor:** Node.js nativo de alta eficiência, consumindo menos de 50 MB de RAM. Pode rodar nos planos gratuitos ou básicos (US$ 0 a US$ 5/mês) do Render, Railway ou VPS.
- **Sem Dependências Pagas:** Não exige contratação de provedores terceiros de banco de dados (ex: Supabase, Neon) nem serviços de autenticação pagos (ex: Auth0).
