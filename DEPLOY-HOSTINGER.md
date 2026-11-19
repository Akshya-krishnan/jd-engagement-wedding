# Hosting the invitation on a Hostinger VPS

Site address: **https://jithin-dona-bigday-invitation.upgrow.com**

How it works:

- `server.js` (Node, no extra packages) serves the site from `dist/` and the two shared APIs:
  - `/api/wishes`: every guest sees every wish on the wishes wall
  - `/api/scores`: every guest sees the Team Jithin vs Team Dona rose totals
- Wishes and scores are saved on the VPS in `data/wishes.json` and `data/scores.json`.
- Nginx sits in front for the domain and HTTPS. PM2 keeps the server running.

Replace `YOUR_VPS_IP` below with the IP shown in Hostinger hPanel → **VPS → Overview**.

---

## 1. Create the subdomain (DNS)

In hPanel → **Domains → upgrow.com → DNS / Nameservers → DNS records**, add:

| Type | Name                            | Points to     | TTL   |
|------|---------------------------------|---------------|-------|
| A    | `jithin-dona-bigday-invitation` | `YOUR_VPS_IP` | 14400 |

If the domain's DNS is managed somewhere else (e.g. Cloudflare), add the same A record there.
It can take from a few minutes up to a few hours to start working. Check with:

    ping jithin-dona-bigday-invitation.upgrow.com

## 2. Prepare the VPS (one time)

Log in from PowerShell: `ssh root@YOUR_VPS_IP`, then run:

```bash
apt update && apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs nginx certbot python3-certbot-nginx git
npm install -g pm2
ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw --force enable
```

## 3. Put the site on the VPS

**Option A: from GitHub** (if the repo is pushed; a private repo needs a GitHub token or deploy key)

```bash
mkdir -p /var/www && cd /var/www
git clone https://github.com/upgrowateam-glitch/jd-engagement-wedding.git jd-invitation
```

**Option B: upload from this computer** (run in PowerShell inside the project folder)

```powershell
npm run build
ssh root@YOUR_VPS_IP "mkdir -p /var/www/jd-invitation"
scp -r dist server.js package.json deploy root@YOUR_VPS_IP:/var/www/jd-invitation/
```

`dist/` is already built and included, so the VPS does not need to run `npm install` or build.

## 4. Start the server

```bash
cd /var/www/jd-invitation
pm2 start deploy/ecosystem.config.cjs
pm2 save
pm2 startup          # run the command it prints, so it starts again after a reboot
curl http://127.0.0.1:3000/api/health     # should print {"ok":true}
```

## 5. Connect the domain and turn on HTTPS

```bash
cp /var/www/jd-invitation/deploy/nginx.conf /etc/nginx/sites-available/jithin-dona-bigday-invitation
ln -s /etc/nginx/sites-available/jithin-dona-bigday-invitation /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d jithin-dona-bigday-invitation.upgrow.com
```

Certbot asks for an email and turns on HTTPS, renewing it automatically.
Open **https://jithin-dona-bigday-invitation.upgrow.com** and you're live.

---

## Updating the site later

1. On this computer: make changes, `npm run build`, then commit and push (or upload again with `scp` as in step 3B).
2. On the VPS:

```bash
cd /var/www/jd-invitation
git pull              # skip if you uploaded with scp
pm2 restart jd-invitation
```

Wishes and scores are kept: `data/` is never overwritten by updates.

## Looking after wishes and scores

- See all wishes: `cat /var/www/jd-invitation/data/wishes.json`
- Remove an unwanted wish: edit `data/wishes.json` (`nano`), delete that `{...}` entry, save, then `pm2 restart jd-invitation`.
- Reset the game scores: `rm data/scores.json && pm2 restart jd-invitation`
- Back up both: `scp -r root@YOUR_VPS_IP:/var/www/jd-invitation/data ./backup-data`
- Server logs: `pm2 logs jd-invitation`

## Try it on this computer first

```powershell
npm run build
npm start
```

Then open http://127.0.0.1:3000. Wishes and scores go into a local `data/` folder (not committed to git).
