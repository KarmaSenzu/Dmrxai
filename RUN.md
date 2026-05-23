# Dmr x AI — Docker Deployment

> 📚 Lihat juga: [`../ARCHITECTURE.md`](../ARCHITECTURE.md) untuk gambaran besar setup multi-project.

Quickstart deploy stack AI chat (dmrxai + 9Router) ke container + Cloudflare Tunnel.

## URL Publik

| URL | Untuk | Container |
|---|---|---|
| https://dmrxai.devplay.online | Chat UI (untuk user) | dmrxai-app |
| https://9router.devplay.online | Admin AI router (untuk admin/owner) | dmrxai-9router |

Tunnel: `dmrxai` (UUID `118d08ad-88c0-416e-9b53-fc32f3381f0a`) handle 2 hostname dengan tunnel yang sama.

## Prasyarat

- Docker Desktop + WSL2 (sama dengan setup vps-dashboard)
- WSL2 cap 4GB sudah aktif (lihat `~/.wslconfig` di Windows host, set `memory=4GB`)
- Tunnel `dmrxai` sudah dibuat di Cloudflare (lihat sister doc)
- File `cloudflared-config/credentials.json` ada (otomatis ditulis saat setup tunnel)
- File `cloudflared-config/config.yml` ada (otomatis ditulis saat setup tunnel)

## 5 Langkah

### 1. Siapkan env

Dari WSL2:

```bash
cd "/mnt/c/PRIVAT SERVER PROJECT WEB AUTO/Dmr x - Ai"
cp .env.docker.example .env
# AI_API_KEY masih kosong — diisi setelah Step 4 (lihat 9ROUTER_SETUP.md)
```

### 2. Build & Start

```bash
docker compose up -d --build
```

Build pertama kali ~3-5 menit (npm install + Next.js build). Hasil = 3 container running (app + 9router + tunnel).

### 3. Cek Status

```bash
docker compose ps
docker compose logs -f app
```

Expected output:

```
NAME             STATUS
dmrxai-app       Up X (healthy)
dmrxai-9router   Up X
dmrxai-tunnel    Up X
```

`dmrxai-tunnel` log harus muncul `Registered tunnel connection`.

### 4. Setup 9Router Provider

Lihat [`9ROUTER_SETUP.md`](./9ROUTER_SETUP.md) untuk:

- Connect provider AI (Kiro AI, OpenAI, Anthropic, dll)
- Generate API key 9Router
- Inject ke `.env` dmrxai

Tanpa langkah ini, chat akan return error karena `AI_API_KEY` masih kosong.

### 5. Akses dmrxai dan Test Chat

```bash
# Verifikasi config endpoint
curl -s https://dmrxai.devplay.online/api/config
# Expected: {"aiConfigured":true,"usageConfigured":false,"aiBaseUrlHint":"http://9router:20128/v1"}
```

Buka `https://dmrxai.devplay.online` di browser. Pilih model dari dropdown, kirim pesan test.

## File Penting

| File | Fungsi |
|---|---|
| `Dockerfile` | Multi-stage build Next.js standalone |
| `docker-compose.yml` | 3-service stack (app + 9router + tunnel) |
| `.env.docker.example` | Template env (`AI_BASE_URL`, `AI_API_KEY`, dll) |
| `.env` | Env aktual (TIDAK di-commit) |
| `cloudflared-config/config.yml` | 2 hostname routing |
| `cloudflared-config/credentials.json` | Tunnel credentials (TIDAK di-commit) |
| `9router-data/` | 9Router persistent data (SQLite, providers config) |
| `next.config.js` | `output: 'standalone'` wajib |
| `RUN.md` | File ini (quickstart) |
| `9ROUTER_SETUP.md` | Setup provider AI di 9Router |

## Operasional

```bash
docker compose ps                   # status
docker compose logs -f app          # tail log Next.js
docker compose logs -f 9router      # log AI router
docker compose logs -f cloudflared  # tail log tunnel
docker compose restart app          # restart app
docker compose restart 9router      # kalau ganti config provider via UI tapi belum ke-pickup
docker compose down                 # stop semua
docker compose up -d --build        # rebuild kalau code berubah
```

## Update Setelah Code Berubah

```bash
# Dari WSL, di folder ini:
docker compose build app
docker compose up -d app
```

## Troubleshooting

**Tunnel error "credentials not found"**
- Pastikan `cloudflared-config/credentials.json` exist
- Cek isi `cloudflared-config/config.yml`

**App start tapi 502 di domain**
- Cek `docker compose logs app` — Next.js sudah listen di port 3000?
- Cek service name di `cloudflared-config/config.yml` harus `http://app:3000`

**Build out of memory**
- Standalone Next.js build butuh ~1.5 GB RAM. Pastikan WSL2 cap minimal 4 GB
  (di `C:\Users\<user>\.wslconfig` set `memory=4GB`)

**9router restart loop dengan error setgroups**

Service punya `cap_drop: ALL` tanpa `cap_add: SETGID`. Pastikan compose punya:

```yaml
cap_add: [CHOWN, SETUID, SETGID, DAC_OVERRIDE]
```

**Chat di dmrxai return error "API not configured"**
- Cek `AI_API_KEY` sudah diisi di `.env`
- Restart app: `docker compose up -d app`
- Verifikasi via `/api/config` endpoint: harus `{"aiConfigured":true}`

**9router.devplay.online return 404 walaupun container Up**
- Restart cloudflared untuk reload config: `docker compose restart cloudflared`
- Pastikan DNS CNAME ada: `cloudflared tunnel route dns dmrxai 9router.devplay.online`

**Setting di 9Router hilang setelah restart**
- Cek volume `./9router-data/` ada dan tidak terhapus
- Backup folder ini berkala untuk safety
