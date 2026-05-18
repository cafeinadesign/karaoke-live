
You are an expert in TypeScript, Angular, and scalable web application development. You write functional, maintainable, performant, and accessible code following Angular and TypeScript best practices.

## TypeScript Best Practices (STRICT)

- Use strict type checking. No exceptions.
- Prefer type inference when the type is obvious.
- **Proibido o uso de `any`.** Todos os tipos devem ser explicitamente declarados. Use `unknown` quando a forma do dado não é conhecida e estreite com type guards.
- Tipagem estrita para eventos, retornos de função e fluxos de dados do Supabase. Gere tipos do schema com `supabase gen types typescript` e use-os.
- Trate `null` e `undefined` explicitamente. Para dados de SSO (ex.: avatar do Google), use uniões como `string | null` e renderize defensivamente (`@if (user.avatar_url) { ... } @else { ... }`).

## Angular v22 Best Practices (ZONELESS)

- **Arquitetura zoneless nativa.** Não dependa do Zone.js. `provideZonelessChangeDetection()` é o padrão no `appConfig`.
- **Signals first.** Use `signal`, `computed`, `effect` para todo estado local e reatividade. Converta Observables (incl. Realtime do Supabase) com `toSignal()`.
- Always use standalone components over NgModules.
- Must NOT set `standalone: true` inside Angular decorators. It's the default in Angular v20+.
- Implement lazy loading for feature routes (`loadComponent`).
- Do NOT use the `@HostBinding` and `@HostListener` decorators. Put host bindings inside the `host` object of the `@Component` or `@Directive` decorator instead.
- Use `NgOptimizedImage` for all static images. (`NgOptimizedImage` does not work for inline base64 images.)
- Use a nova sintaxe nativa de controle de fluxo (`@if`, `@for`, `@switch`, `@empty`). Nunca `*ngIf`/`*ngFor`/`*ngSwitch`.

## Accessibility Requirements

- It MUST pass all AXE checks.
- It MUST follow all WCAG AA minimums, including focus management, color contrast, and ARIA attributes.

### Components

- Keep components small and focused on a single responsibility
- Use `input()` and `output()` functions instead of decorators
- Use `computed()` for derived state
- Set `changeDetection: ChangeDetectionStrategy.OnPush` in `@Component` decorator
- Prefer inline templates for small components
- Prefer Reactive forms instead of Template-driven ones
- Do NOT use `ngClass`, use `class` bindings instead
- Do NOT use `ngStyle`, use `style` bindings instead
- When using external templates/styles, use paths relative to the component TS file.

## State Management

- Use signals for local component state
- Use `computed()` for derived state
- Keep state transformations pure and predictable
- Do NOT use `mutate` on signals, use `update` or `set` instead

## Templates

- Keep templates simple and avoid complex logic
- Use native control flow (`@if`, `@for`, `@switch`) instead of `*ngIf`, `*ngFor`, `*ngSwitch`
- Use the async pipe to handle observables
- Do not assume globals like (`new Date()`) are available.

## Services

- Design services around a single responsibility
- Use the `providedIn: 'root'` option for singleton services
- Use the `inject()` function instead of constructor injection

## Style & Design (Angular Material MD3 + YouTube Premium Dark)

- Use componentes nativos do Angular Material configurados para **Material Design 3** (`mat.theme(...)` no `styles.scss`).
- Design **mobile-first**, limpo, geométrico, otimizado para uso com uma mão.
- Paleta (YouTube Premium Dark) via tokens MD3 sobrescritos em CSS custom properties:
  - Background absoluto: `#0f0f0f`
  - Superfícies/cards: `#212121`
  - Texto primário: `#ffffff`
  - Texto secundário: `#aaaaaa`
  - Acento ativo (YouTube Red): `#ff0000`
  - Acento de destaque alternativo (Ouro Elétrico V2): `#ffb511` — uso **exclusivo** no estado de notificação "Sua Vez" (bottom-sheet com mensagem do Gemini).
- **SASS puro, ESTRITAMENTE.** Sintaxe indentada, extensão `.sass`, **zero chaves `{}`, zero ponto-e-vírgula `;`**. Vale para arquivos `.sass` **e** para `styles: \`...\`` inline em componentes (template literals com sintaxe SASS indentada). `inlineStyleLanguage: sass` no `angular.json`. Imports: `@use '@angular/material' as mat`. Nunca gere SCSS.

## Domínio (Karaokê Live Mode)

App de karaokê multi-sala com duas visões:

- **`/mobile` (Convidado):** busca de vídeos via YouTube Data API, lista de resultados com thumbnails, botão para enfileirar no Supabase. Exibe `mat-bottom-sheet` em ouro elétrico (#ffb511) quando é a vez do usuário cantar, com texto sarcástico do Gemini.
- **`/host-dashboard` (Dono da Sala):** controle da fila em tempo real (Supabase Realtime), player do YouTube embutido, botão mestre "Próxima Música" que avança o estado.

Integração reativa Supabase → Angular usa `toSignal()` sobre o canal de Realtime.

## Contrato de Output (Determinístico)

- Ao entregar componentes, forneça **somente** o código limpo, dividido por arquivo (Componente TS, Template HTML, Estilos SCSS).
- Não adicione introduções, explicações, notas de rodapé ou desculpas no conteúdo do arquivo.
- Comentários no código apenas quando o **porquê** for não-óbvio.
