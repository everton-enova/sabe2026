# SABE 2026

Base inicial da plataforma de aplicações SABE 2026 em Next.js, TypeScript e App Router.

## Rotas

- `/` — seleção da modalidade
- `/aplicacao/cp` — aplicação CP
- `/aplicacao/sm` — aplicação SM

## Executar

```bash
pnpm install
pnpm dev
```

## Validar

```bash
pnpm lint
pnpm typecheck
pnpm build
```

O próximo passo é mapear os campos e regras de CP e SM e definir a base PostgreSQL central.
