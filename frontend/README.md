# frontend/

> **Niet hier ontwikkelen.** De frontend-code van De Tracémolen leeft op de
> root van deze repo, niet in deze submap.

## Waarom

Deze repo is gekoppeld aan een Lovable-project. Lovable draait standaard op
**TanStack Start v1 + Vite + React 19** (zie het systeemprompt-bestand
`LOVABLE_SYSTEM_PROMPT.md` op de root). Het origineel-bedoelde Next.js 14 +
App Router-stack is in Lovable niet ondersteund. In overleg is gekozen voor
TanStack Start op de root, met behoud van alle elf niet-onderhandelbare
principes uit het systeemprompt-bestand.

## Waar staat wat

- `src/routes/` — file-based routing (`index`, `login`, `dashboard`, `settings`)
- `src/components/` — UI-componenten (waaronder `nav/TopNav.tsx` en `ui/` shadcn)
- `src/integrations/supabase/` — Supabase clients (anon-only in browser; service-role uitsluitend in server-functies, nooit in frontend-bundel)
- `src/lib/auth.ts` — client-side auth-hook
- `src/styles.css` — design-tokens (paper / ink / signal / cyan, Fraunces + Archivo)

## Stack

| Laag | Technologie |
|------|-------------|
| Framework | TanStack Start v1 + Vite + React 19 + TypeScript |
| Styling | Tailwind CSS + shadcn/ui |
| Auth | `@supabase/supabase-js` (anon, browser-side) |
| State | Zustand (client) + TanStack Query (server) |
| Kaart | MapLibre GL (geïnstalleerd, nog niet in gebruik in MVP-1 Sprint 1) |
| Iconen | lucide-react |
| Fonts | Fraunces (display) + Archivo (body) via `@fontsource/*` |

## Hosting

In productie draait deze frontend op **Vercel** (zie `ops/vercel.json`).
TanStack Start heeft officiële Vercel-support; geen aanpassingen aan
`ops/`-config nodig op het frontend-niveau.
