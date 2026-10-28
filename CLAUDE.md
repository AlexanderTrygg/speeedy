# 10.7 Speed Reader

Alexanders egen RSVP-läsare: ladda upp PDF/EPUB/DOCX/TXT och läs ett ord i
taget. Fork av [sami-29/speeedy](https://github.com/sami-29/speeedy) (MIT —
behåll `LICENSE` och upphovsraden). Används främst till kurslitteratur och
Thrydle-läsning, på svenska och engelska, mest på iPhone.

## Stack

Lit + TypeScript + Vite + Tailwind v4/DaisyUI. pdfjs-dist, mammoth, JSZip.
Allt körs i webbläsaren, data i IndexedDB, PWA (vite-plugin-pwa). Ingen server.

- `pnpm` via `npx -y pnpm@10` (lockfilen är pnpm). `node_modules` har
  iCloud-flaggan `com.apple.fileprovider.ignore#P` så att den inte synkas.
- `npx pnpm@10 dev` · `npx vitest run` · `npx tsc --noEmit` · `npx vite build`
- Biome-lint har gamla `!important`-varningar i `src/index.css` från originalet.

## Viktiga filer

| Fil | Vad |
|---|---|
| `src/services/rsvp-engine.ts` | Tokenisering, ORP, timing (`chunkDelayMs`), meningshopp |
| `src/services/text-parser.ts` | Filparsning per format |
| `src/services/storage-service.ts` | IndexedDB: profil, bibliotek (max 20 dokument) |
| `src/components/rsvp-reader.ts` | Läsvyn: tryck, svep, tangenter, kontroller |
| `src/utils/ids.ts` | UUID/hash med reserv när sidan inte är https |

## Gjort hittills (gren `main-alexander`)

- Bantat: landningssida, learn, donate, promote, changelog, share, juridik,
  benchmark, feedback (Formspree), onboarding och Umami-spårning borta.
- Pauser har ett minimum (`PAUSE_FLOOR_MS`) så att de inte försvinner i högt
  tempo; separat kommapaus; reglage i Advanced timing.
- Svenska: vanliga ord går fortare, långa sammansättningar (12+/16+ bokstäver) får mer tid.
- Meningshopp: ↑/↓, knapparna och svep höger/vänster i läsvyn.
- Bugg #21 (uppladdning "slutar fungera"): gick inte att återskapa i Chromium
  eller WebKit; troligen icke-https där `crypto.randomUUID` saknas. Reserv i `ids.ts`.

## Nästa

1. Forka på GitHub och deploya på Vercel (kräver `gh auth login`).
2. Använd en vecka. Sedan: PDF-städning för kurslitteratur (sidhuvud/sidfot,
   avstavning, referenslista), rubriker som hoppmärken, Web Share Target,
   förståelsestopp per stycke, banta ljud/Pomodoro, ev. svenskt gränssnitt.
3. Design-pass med `design-taste-frontend`, audit med `web-design-guidelines`,
   test i iPhone-vy med `playwright-cli` (WebKit är installerat).
4. `/replica-entrepreneur` (i `.claude/skills/`) för en riktig recensionsgenomgång
   av Spreeder/Outread/Swiftread innan större funktioner.

Planen: `~/.claude/plans/s-jag-har-sett-misty-toast.md`.

## Regler

- Inga externa anrop, spårare eller konton — dokumenten stannar på enheten.
- Nya funktioner får tester i `*.test.ts` bredvid koden.
- Commit på `main-alexander`; `upstream` = originalet, för att kunna hämta fixar.
