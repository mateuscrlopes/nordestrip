# Nordest Trip

Fundação mobile-first de uma central de comando compartilhada para viagens. A aplicação usa somente os dados permitidos pelas políticas de RLS do projeto Supabase.

## Stack

- Next.js com App Router e TypeScript
- Tailwind CSS
- Supabase Auth e banco de dados via `@supabase/ssr` e `@supabase/supabase-js`
- Lucide React para ícones

## Configuração

1. Instale as dependências com `npm install`.
2. Copie `.env.example` para `.env.local`.
3. Preencha `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` com os valores públicos do projeto. Nunca use uma chave `service_role` no app.
4. Inicie o ambiente local com `npm run dev`.

O app estará em `http://localhost:3000`. Use um usuário existente no Supabase para entrar por e-mail e senha.

## Arquitetura inicial

- `src/app`: rotas, layouts, metadata e telas do App Router.
- `src/components`: navegação, layout e componentes das áreas da viagem.
- `src/lib/supabase`: clientes de browser e servidor e renovação da sessão no middleware.
- `src/lib/queries`: consultas centralizadas ao Supabase, sempre com a sessão do usuário e respeitando RLS.
- `src/lib/utils`: formatação de datas e valores.
- `src/types`: tipos compartilhados do domínio.

As rotas internas são protegidas pelo middleware. O servidor valida o usuário com `getUser()`, e os cookies de autenticação são renovados segundo o padrão SSR do Supabase. Esta etapa não altera o schema, não integra serviços externos e não implementa offline.

## Verificações

```bash
npm run lint
npm run build
```
