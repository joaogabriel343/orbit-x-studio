# Orbit — X Studio

React + TypeScript + Supabase + worker Node com Playwright para gerenciar até 10 contas do X, preparar textos por perfil e publicar imediatamente ou por agendamento. Sem login próprio e sem usar a API paga do X.

## Abrir a demonstração

Requisitos: Node.js 22 ou superior e npm. No PowerShell:

```powershell
cd C:\API-x\x-studio
npm install
Copy-Item .env.example .env
npm run dev
```

Abra `http://localhost:5173`. O `.env` local já pode existir; nesse caso, preserve suas configurações. O modo de demonstração vem ativo, salva dados apenas no navegador e **não publica no X**. Permite explorar o editor, a agenda, filtros, rascunhos e o acompanhamento por conta.

## Conectar ao seu Supabase

1. Execute [a migration SQL](supabase/migrations/202611120001_x_studio.sql) no SQL Editor do seu projeto **existente**. Ela cria as tabelas e RPCs desta aplicação, incluindo dez slots de contas. Execute uma vez, ou aplique-a como migration pelo CLI.
2. Autorize os usuários que já existem no Auth do sistema principal. No SQL Editor, substitua o email:

```sql
insert into public.x_studio_admins(user_id)
select id from auth.users where email='seu-email@dominio.com'
on conflict do nothing;
```

Todos os operadores dessa allowlist administram as mesmas dez contas nesta instalação. Não há isolamento de vários clientes/workspaces.

3. Configure no `.env`:

```dotenv
VITE_DEMO_MODE=false
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=SUA-CHAVE-PUBLICA-OU-ANON
VITE_PARENT_ORIGIN=https://sistema-principal.seudominio.com
SUPABASE_URL=https://SEU-PROJETO.supabase.co
SUPABASE_SERVICE_ROLE_KEY=SUA-CHAVE-SECRETA-SERVICE-ROLE
```

`VITE_` fica público no build. A chave secreta existe somente no ambiente do worker. O frontend não acessa diretamente as tabelas: RLS e grants bloqueiam `anon`/`authenticated`; a Edge Function valida o JWT com `getUser()` e a allowlist antes de acessar os dados.

4. Faça deploy da Edge Function no mesmo projeto:

```powershell
npx supabase login
npx supabase link --project-ref SEU-PROJECT-REF
Copy-Item supabase/functions/.env.example supabase/functions/.env
# Edite ALLOWED_ORIGINS: origem do painel e localhost, se necessário.
npx supabase secrets set --env-file supabase/functions/.env
npx supabase functions deploy x-studio --no-verify-jwt
```

O gateway usa `verify_jwt=false` para compatibilidade com as chaves atuais; a própria função exige e valida o token do usuário em **todas** as rotas. Não existe endpoint público para publicar. `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` são fornecidas automaticamente no runtime das funções hospedadas.

5. Reinicie `npm run dev`, ou gere um novo build. As variáveis do Vite são incorporadas durante o build.

## Integrar no sistema React principal

Use [docs/INTEGRATION.tsx](docs/INTEGRATION.tsx) como componente do sistema que já possui autenticação. Passe o cliente Supabase existente e altere `PANEL_URL`. Configure `VITE_PARENT_ORIGIN` com a origem exata do sistema principal.

O iframe pede a sessão com `orbit:ready`; o sistema principal envia `orbit:session` via `postMessage`, com `targetOrigin` específico. O painel verifica `origin` e `source`, mantém o token recebido em memória e limpa os dados no logout/troca de usuário. Renovações da sessão também são transmitidas. Não há tokens na URL ou um novo formulário de login.

Se o painel estiver na mesma origem e compartilhar o armazenamento padrão do Supabase, ele também pode recuperar a sessão existente ao ser aberto diretamente. Em outra origem, use o componente de integração.

## Preparar o worker Playwright

O Supabase guarda a fila; o **processo Node** executa o navegador. Não há necessidade de cron, pg_net ou API do X. As Edge Functions não executam Chromium.

```powershell
npm run browser:install
# Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env deste computador.
npm run account:connect -- 1
```

O comando abre um navegador visível, exclusivo do slot 1. Entre no X e conclua a autenticação normalmente. Quando estiver na página inicial, volte ao terminal e pressione Enter. O script identifica o perfil, registra a conta no Supabase e preserva a sessão no computador. Repita para os slots 2 a 10:

```powershell
npm run account:connect -- 2
npm run account:connect -- 10
npm run worker
```

O Playwright usa o pacote oficial [playwright.dev](https://playwright.dev/docs/intro). A sessão de cada conta fica em `.local/profiles/account-N`; senhas e cookies não são colocados no `.env` nem enviados ao frontend. Essas pastas, locks e recibos são ignorados pelo Git e devem ser acessíveis somente ao operador do worker. Mantenha-as em armazenamento persistente ao usar um servidor.

O worker roda em segundo plano com `WORKER_HEADLESS=true`. Para inspecionar o navegador, use `WORKER_HEADLESS=false`. `PLAYWRIGHT_CHANNEL=chrome` ou `msedge` permite usar um navegador instalado. Não há proxy de evasão, replay de endpoints privados ou resolução automática de verificações: se o X pedir autenticação/verificação, reconecte manualmente.

Não execute o comando de conexão para um perfil enquanto esse perfil estiver aberto pelo worker. Um lock impede o uso simultâneo. Se o processo encerrar abruptamente, pare todos os processos desta instalação, confirme que o perfil está fechado e remova **somente** o arquivo `.local/locks/account-N.lock` correspondente antes de reconectar. Não apague o diretório do perfil para liberar um lock.

## Publicações e agendamento

- Selecione uma ou várias contas ativas no editor. Para várias contas, escreva conteúdo próprio para cada perfil; textos exatamente duplicados são bloqueados. Conteúdo muito semelhante também está sujeito às [regras do X](https://help.x.com/en/rules-and-policies/x-automation).
- O editor usa a contagem ponderada de 280 caracteres do `twitter-text`, incluindo emojis e links.
- Escolha data, horário e fuso, ou “Publicar agora”. O SQL salva instantes em UTC. O worker consulta a fila a cada 20 segundos por padrão, envia **uma entrega por vez** e considera o tempo de carregamento do navegador. Portanto, horários indicam quando o envio se torna elegível, sem garantia de precisão de segundos.
- `npm run worker:once` consulta e processa no máximo uma entrega, para diagnóstico. Para funcionamento contínuo, use `npm run worker` em um serviço permanente ou no agendador/supervisor do seu servidor, com diretório de trabalho e pasta `.local` persistentes.
- O computador deve estar ligado, conectado e sem suspensão. Com o worker desligado, as publicações ficam pendentes e serão processadas quando ele voltar.
- Pausar uma conta suspende seus envios pendentes. Reativar libera os agendamentos vencidos. Cancelar uma campanha cancela as entregas pendentes; uma já em andamento pode terminar.
- Rascunhos não entram em execução. “Usar como base” abre uma **nova** publicação com os dados preenchidos; preserva a original. É possível excluir um rascunho.
- O painel carrega as 500 campanhas mais recentes por instalação. Os indicadores são calculados a partir dos registros carregados e do filtro de conta atual.
- A confirmação é observada na resposta gerada pelo clique normal do navegador ou no link exibido pelo X. Um HTTP 200 sem ID de publicação não é tratado como sucesso. Links de posts confirmados aparecem no histórico.
- O SQL usa `FOR UPDATE SKIP LOCKED` e um token de posse para evitar dois workers enviarem a mesma entrega. Interrupções e ausência de confirmação recebem status **Conferir no X** e não são reenviadas automaticamente. Recibos locais de sucesso recuperam confirmações após falha de gravação no banco. Isso reduz duplicações, mas não oferece semântica de exactly-once para uma interface externa.
- Esta versão publica **texto e links**. Upload de imagens, vídeos e threads não foi incluído.

O Playwright não cobra por requisição. Continuam necessários computador/servidor e Supabase, conforme os planos que você usa. O X pode restringir automação da interface; seletores e sessões podem mudar. O método não usa a API oficial, e pode exigir manutenção. Não há promessa de gratuidade da infraestrutura nem de operação sem bloqueios.

## Validação e estrutura

```powershell
npm test             # regras de conteúdo, fusos, SQL PostgreSQL e fila
npm run test:browser # navegador: painel e publicação em fixture local
npm run build        # TypeScript e build de produção
```

Os testes do worker interceptam as páginas do X com fixtures locais. Não fazem login nem publicações reais. A integração no seu Supabase e o envio em contas reais precisam ser conferidos depois de configurar o ambiente e conectar os perfis.

```text
src/                       Painel React, calendário e editor
supabase/migrations/       SQL das tabelas, permissões e fila
supabase/functions/        API autenticada para o painel
worker/                    Conexão dos 10 perfis e publicação pelo navegador
docs/INTEGRATION.tsx        Componente para o sistema principal
tests/                     Validação, PostgreSQL e Playwright
.env.example               Configuração pública + worker local
```

## Hospedar

Gere `npm run build` e hospede `dist/` no seu servidor ou hospedagem estática. O painel não contém as credenciais do worker. Configure as variáveis públicas antes do build, `ALLOWED_ORIGINS` na Edge Function e a origem de integração no sistema principal. O worker Node é hospedado separadamente, em uma máquina que suporte Chromium; o Supabase permanece como banco e API.

A prévia privada publicada por Sites usa o modo de demonstração. Ela permite revisar a interface; não representa um worker ativo nem uma conexão ao seu projeto Supabase.
