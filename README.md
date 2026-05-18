# Karaokê Live

App de karaokê multi-sala onde convidados entram via código/QR, enfileiram músicas do YouTube e o host controla o player + fila em tempo real. Quando chega a vez do convidado, um bottom-sheet em ouro elétrico anuncia com uma frase irônica gerada pelo Gemini.

- **Produção:** https://karaoke-live.app.br
- **Repositório:** https://github.com/cafeinadesign/karaoke-live
- **Versão:** mostrada no rodapé do app, com link pro commit no GitHub.

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Frontend | Angular 22 (zoneless, standalone, signals, SSR/prerender) |
| UI | Angular Material MD3 + SASS indentado, tema YouTube Dark |
| i18n | `@angular/localize` — `pt-BR` (default) + `en-US` |
| Auth + DB + Realtime | Supabase (`kfyubxcnouhtgqtfejoh`, sa-east-1) |
| Edge functions | Deno — `youtube-search`, `gemini-roast` |
| Modelo Gemini | `gemini-2.5-flash` |
| Hospedagem | Netlify (PWA + SPA fallback + redirect por Accept-Language) |
| App Android | TWA via Bubblewrap (`br.app.karaokelive.twa`) |

## Estrutura

```
src/app/
├── auth/                     # AuthService + authGuard
├── rooms/                    # RoomsService (create / join / current)
├── queue/                    # QueueService (Realtime channel filtered by room)
├── youtube/                  # YoutubeService (chama edge function youtube-search)
├── song-search/              # Componente compartilhado: busca + enfileirar
├── version-footer/           # Rodapé com versão e link pro commit
├── pages/
│   ├── landing/              # /
│   ├── login/                # /login (Google SSO via Supabase)
│   ├── mobile/               # /mobile e /mobile/:code (convidado)
│   ├── host-dashboard/       # /host-dashboard/:roomId (host)
│   └── privacy/              # /privacy (LGPD)
├── app.routes.ts             # Rotas com lazy load + guards
├── supabase.service.ts       # Cliente Supabase tipado (PKCE)
└── types.ts                  # Re-exports de database.types.ts

supabase/
├── migrations/               # Schema inicial (profiles, rooms, queue_items + RLS + RPCs)
└── functions/                # youtube-search, gemini-roast

public/
├── icons/                    # PWA icons (gerados de icon-source.svg)
├── manifest.webmanifest      # PWA manifest, tema YouTube Dark
└── .well-known/
    └── assetlinks.json       # Android App Links (TWA verification)

play-store/                   # Assets pra Google Play Console
├── play-icon-512.png
├── feature-graphic-1024x500.png
├── screenshots/              # 1080x1920 phone screenshots
└── listing.md                # Textos prontos pra submission
```

## Desenvolvimento

Pré-requisitos: Node 24+, npm.

```bash
npm install
npm start          # http://localhost:4200
```

A primeira execução gera `src/version.generated.ts` com a versão e o SHA do último commit.

### Edge functions (local)

```bash
supabase start
supabase functions serve youtube-search gemini-roast --env-file .env.local
```

### Migrations

```bash
supabase db push --linked
```

### Tipos do banco

```bash
supabase gen types typescript --project-id kfyubxcnouhtgqtfejoh > src/app/database.types.ts
```

## Build

```bash
npm run build      # gera dist/karaoke-live/browser/{pt-BR,en-US}
```

O `prebuild` regenera `src/version.generated.ts`. O `postbuild` copia `public/.well-known/` para a raiz do `dist/` (necessário pro `assetlinks.json` ficar em `/.well-known/`, pois o glob do Angular pula dotfiles).

Em produção (Netlify), `COMMIT_REF` substitui o `git rev-parse`.

## i18n

- Marcar string nova: `i18n="@@chave"` em template ou `` $localize`:@@chave:texto` `` em TS.
- Extrair: `npx ng extract-i18n --output-path src/locale`.
- Adicionar tradução: editar `src/locale/messages.en-US.xlf` (adicionar `<target>` ao novo `<trans-unit>`).

A rota raiz `/` faz redirect 302 baseado no header `Accept-Language` (Netlify edge), com fallback para `/pt-BR/`.

## TWA / Android

Projeto Bubblewrap em **`../karaoke-live-android/`** (fora deste repo).

```bash
cd ../karaoke-live-android
export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home
export ANDROID_HOME=/Users/thiago/.bubblewrap/android_sdk
export PATH="$JAVA_HOME/bin:$PATH"
export BUBBLEWRAP_KEYSTORE_PASSWORD="..."   # ver .env.local
export BUBBLEWRAP_KEY_PASSWORD="..."

bubblewrap update --appVersionName=1.0.0 --appVersionCode=N --skipVersionUpgrade
bubblewrap build --skipPwaValidation
# → app-release-bundle.aab (Play Store)
# → app-release-signed.apk  (adb install)
```

A SHA-256 da upload key está em `public/.well-known/assetlinks.json`. Quando aceitarmos Play App Signing, o Google gera uma App Signing Key adicional — o fingerprint dela precisa ser adicionado ao mesmo arquivo (array com 2 entries).

> ⚠️ **Backup do keystore (`android.keystore` + senha em `.env.local`) é crítico.** Perder a chave significa perder a capacidade de atualizar o app na Play Store.

## Deploy

Push em `main` dispara auto-deploy no Netlify. Workflow:

1. `gen-version.mjs` → escreve `src/version.generated.ts`
2. `ng build` (localize=true) → `dist/karaoke-live/browser/{pt-BR,en-US}/`
3. `post-build.mjs` → copia `.well-known/` pro root do dist
4. Netlify edge serve: `/` redireciona por idioma, `/pt-BR/*` e `/en-US/*` fazem SPA fallback dentro do locale

## Acessibilidade

- AXE / WCAG AA: focus management, contraste, ARIA labels em todos os botões com ícone.
- Sintaxe nativa de controle de fluxo (`@if`, `@for`, `@switch`) — sem `*ngIf`/`*ngFor`.
- `NgOptimizedImage` quando aplicável (não para data URLs).

## Licença

Privado — Cafeína Design.
