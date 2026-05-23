# Dmr x AI

> AI chat platform multi-model dengan analisis dokumen, web search, dan visualisasi data — dijalankan sendiri lewat Docker Compose.

[![Next.js](https://img.shields.io/badge/Next.js-14.2-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Docker](https://img.shields.io/badge/Docker-Compose-blue?logo=docker)](https://docs.docker.com/compose/)
[![License](https://img.shields.io/badge/License-Proprietary-red)]()

Stack siap-deploy yang ngegabungin chat AI multi-provider, ekstraksi & analisis Excel/PDF/DOCX, web search lokal via SearXNG, dan rendering chart interaktif — semuanya berjalan di container yang kamu kontrol sendiri.

URL produksi (admin internal):
- Chat UI: https://dmrxai.devplay.online
- Router admin: https://9router.devplay.online

## Fitur

### Chat & model
- Multi-model: Claude (Opus/Sonnet/Haiku), GPT, Gemini, dll — di-route via 9Router
- **Server-managed key**: pengguna tidak perlu bawa API key sendiri
- Mode Thinking & Deep Research (extended thinking budget, reasoning streaming)
- Auto mode: pilih model otomatis berdasarkan prompt
- Tool calling: web search, fetch URL, render chart

### Analisis dokumen
- Upload **Excel**, **PDF**, **DOCX**, **gambar**, dan teks biasa
- Smart sampling untuk file besar (5 MB+):
  - Schema lengkap (kolom, type, null count) per sheet
  - Statistik numerik (min/max/mean) dihitung dari **seluruh baris**
  - Sample head 50 + tail 50 baris per sheet
  - 4-tier budget reduction kalau workbook tetap melebihi cap
- Vision: gambar dianalisis langsung oleh model multimodal

### Visualisasi
- 8 tipe chart via fenced ` ```chart ` JSON: line, bar, area, pie, scatter, stacked-bar, stacked-area, composed
- Dark-mode aware (axis text, legend, grid)
- Tombol "Salin spec" untuk debug atau pakai ulang
- Mermaid diagram via fenced ` ```mermaid `

### Web search
- SearXNG terintegrasi, no-API-key, no-tracking
- Multi-engine: DuckDuckGo, Bing, Brave, Wikipedia, GitHub, Stack Overflow, dll

### UX
- Bahasa Indonesia (sebagian besar UI + error message)
- Light & dark theme
- Streaming response dengan thinking panel
- Copy + edit + retry per message

## Stack

| Layer | Tool |
|---|---|
| Framework | Next.js 14 App Router |
| Bahasa | TypeScript (strict) |
| Styling | Tailwind CSS (class-based dark mode) |
| Markdown | react-markdown + remark-gfm + rehype-highlight |
| Chart | Recharts 2.x |
| Diagram | Mermaid |
| Excel | SheetJS (xlsx) |
| PDF | pdfjs-dist |
| DOCX | mammoth |
| Container | Docker Compose (4 service stack) |
| Tunnel | Cloudflare Tunnel (cloudflared) |
| AI Router | 9Router (multi-provider proxy) |
| Search | SearXNG |

## Arsitektur

```
                         ┌─────────────────────────┐
                         │  Browser (User)         │
                         └────────────┬────────────┘
                                      │ HTTPS
                                      ▼
                         ┌─────────────────────────┐
                         │  Cloudflare Tunnel      │
                         │  dmrxai.devplay.online  │
                         └────────────┬────────────┘
                                      │
              ┌───────────────────────┼───────────────────────┐
              ▼                       ▼                       ▼
      ┌───────────────┐       ┌──────────────┐       ┌──────────────┐
      │  Next.js App  │──────▶│  9Router     │──────▶│  Provider    │
      │  (chat UI)    │       │  (multi LLM) │       │  (Anthropic, │
      └───────┬───────┘       └──────────────┘       │   OpenAI,    │
              │                                      │   Google)    │
              ▼                                      └──────────────┘
      ┌───────────────┐
      │  SearXNG      │
      │  (web search) │
      └───────────────┘
```

Semua container berjalan di network `dmrxai-net` (bridge). Hanya `cloudflared` yang punya akses outbound ke Cloudflare edge, sisanya isolated.

## Setup

### Prasyarat

- Docker Desktop dengan WSL2 backend (atau Docker Engine native di Linux)
- Cloudflare account + tunnel sudah dibuat
- WSL2 minimal 4 GB RAM (atur via `~/.wslconfig`)
- Domain yang dikelola Cloudflare

### Quickstart

Lihat [`RUN.md`](./RUN.md) untuk panduan deploy 5 langkah lengkap, dan [`9ROUTER_SETUP.md`](./9ROUTER_SETUP.md) untuk konfigurasi provider AI.

Singkatnya:

```bash
# 1. Clone
git clone https://github.com/KarmaSenzu/Dmrxai.git dmrxai
cd dmrxai

# 2. Siapkan config (file aktual digit-ignored, hanya .example yang di-commit)
cp .env.docker.example .env
cp searxng-config/settings.example.yml searxng-config/settings.yml
cp cloudflared-config/config.example.yml cloudflared-config/config.yml

# 3. Edit .env, settings.yml, config.yml — isi sesuai instruksi di tiap file

# 4. Tambahkan credentials.json dari Cloudflare
# Dapatkan via: cloudflared tunnel create dmrxai
# Copy hasil .json ke cloudflared-config/credentials.json

# 5. Build & start
docker compose up -d --build

# 6. Verifikasi
docker compose ps
curl -s http://localhost:3000/api/config
```

### Konfigurasi

Empat file utama (semua di-gitignore, di-commit hanya versi `.example`):

| File | Isi | Sumber template |
|---|---|---|
| `.env` | `AI_API_KEY` (dari 9Router), `TZ`, `AI_BASE_URL` | `.env.docker.example` |
| `searxng-config/settings.yml` | `secret_key` (generate via `openssl rand -hex 32`) | `settings.example.yml` |
| `cloudflared-config/config.yml` | Tunnel UUID + hostname routing | `config.example.yml` |
| `cloudflared-config/credentials.json` | Tunnel credentials (dari Cloudflare) | (tidak ada template, generated) |

## Development

### Local dev tanpa Docker

```bash
# 1. Install deps
npm install

# 2. Pastikan 9Router accessible (jalan di Docker atau standalone)
# .env.local:
#   AI_BASE_URL=http://localhost:20128/v1
#   AI_API_KEY=<key dari 9Router>

# 3. Start dev server
npm run dev
# → http://localhost:3000
```

### Build & test

```bash
npx tsc --noEmit -p .   # type check
npm run build           # production build
```

Belum ada test framework configured. Verifikasi via build + manual smoke test.

### Update kode

Setelah merge PR ke `main`:

```bash
git checkout main
git pull origin main
docker compose build app
docker compose up -d app
docker compose logs -f app   # sampai "Ready in Xs"
```

## Workflow kontribusi

Semua perubahan **wajib lewat branch + Pull Request**, tidak ada push langsung ke `main`.

```bash
# Mulai
git checkout main
git pull origin main
git checkout -b feat/nama-fitur

# Kerja, commit kecil-kecil
git add <files-spesifik>
git commit -m "type(scope): pesan singkat"

# Push
git push -u origin feat/nama-fitur
# Buat PR di GitHub → review → merge

# Cleanup
git checkout main
git pull origin main
git branch -d feat/nama-fitur
```

### Konvensi commit

Format: `type(scope): subject`

| Type | Untuk |
|---|---|
| `feat` | Fitur baru |
| `fix` | Bug fix |
| `refactor` | Restructure tanpa ubah behavior |
| `docs` | Dokumentasi |
| `chore` | Maintenance, tooling |
| `test` | Test |
| `ci` | CI/CD pipeline |

Scope adalah area kode: `chat`, `chart`, `auth`, `docker`, dll.

Contoh:
- `feat(chat): smart sampling for large Excel files`
- `fix(chart): dark mode axis text invisible`
- `chore: bump next to 14.2.6`

## Struktur project

```
.
├── app/                          # Next.js App Router
│   ├── api/                      # Server routes
│   │   ├── chat/                 # Main chat endpoint (streaming)
│   │   ├── config/               # Config flags untuk client
│   │   ├── fetch-url/            # Tool: ambil konten URL
│   │   ├── image/                # Image generation
│   │   ├── models/               # Daftar model dari 9Router
│   │   ├── search/               # Tool: web search via SearXNG
│   │   └── usage/                # Token usage tracking
│   ├── components/               # React components
│   │   ├── ChatInput.tsx         # File upload + smart sampling
│   │   ├── ChartBlock.tsx        # 8-type Recharts renderer
│   │   ├── MermaidBlock.tsx      # Mermaid diagram renderer
│   │   ├── MarkdownRenderer.tsx  # Markdown + code block routing
│   │   ├── MessageBubble.tsx     # Per-message UI
│   │   └── ...
│   ├── hooks/                    # React hooks (useChat, useSettings)
│   ├── lib/                      # Utilities, types, system prompt
│   └── ...
├── cloudflared-config/           # Cloudflare Tunnel config
├── searxng-config/               # SearXNG config
├── 9router-data/                 # 9Router persistent data (gitignored)
├── docker-compose.yml            # 4-service stack
├── Dockerfile                    # Multi-stage Next.js standalone build
├── RUN.md                        # Deploy guide
├── 9ROUTER_SETUP.md              # Provider config guide
└── README.md                     # File ini
```

## Lisensi

Proprietary. All rights reserved.

Repo ini private. Penggunaan di luar deployment internal `KarmaSenzu` butuh izin tertulis dari pemilik.

## Acknowledgements

- [9Router](https://github.com/decolua/9router) — multi-provider AI router
- [SearXNG](https://github.com/searxng/searxng) — privacy-respecting metasearch
- [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) — secure tunnel ke origin
- [Recharts](https://recharts.org/) — chart library
- [Mermaid](https://mermaid.js.org/) — diagram-as-code

---

Built with ❤️ in Bahasa Indonesia.
