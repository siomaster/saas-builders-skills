#!/usr/bin/env bash
# Installation du relais SebPay sur ton VPS à IP fixe, à côté d'un éventuel relais MoneyFusion
# sans le modifier. À lancer en root : RELAY_DOMAIN=relay.ton-domaine.com bash sebpay-setup.sh
RELAY_DOMAIN="${RELAY_DOMAIN:-relay.example.com}"
set -uo pipefail
fail() { echo; echo "ÉCHEC : $1"; echo "Copie tout ce texte à Claude."; exit 1; }

NODE="$(command -v node || true)"
[ -n "$NODE" ] || fail "Node.js introuvable sur le serveur"
"$NODE" -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 18 ? 0 : 1)' || fail "Node.js 18 ou plus requis"

echo "== 1/4 Module SebPay"
mkdir -p /opt/sebpay-relay
cat > /opt/sebpay-relay/server.mjs <<'SEBPAYJS'
// Relais SebPay (VPS à IP fixe) : SebPay n'accepte que les adresses IP déclarées pour la clé API.
// Les fonctions Supabase n'ont pas d'IP fixe ; elles passent ici. Seuls les appels de paiement sont relayés.
import http from "node:http";
import { timingSafeEqual } from "node:crypto";

const SECRET = process.env.SEBPAY_RELAY_SECRET || "";
const API = "https://newapi.sebpay.bj/api/v1";
const PATHS = /^\/(checkout\/sessions(\/[A-Za-z0-9:_.-]{1,120})?|collections(\/[A-Za-z0-9:_.-]{1,120})?|countries|operators(\?country=[A-Z]{2})?|c\/calculate-fee(\?[A-Za-z0-9=&_.-]{0,200})?)$/;

const same = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const send = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
};

http
  .createServer(async (req, res) => {
    if (req.url === "/sebpay/health") return send(res, 200, { ok: true });
    if (req.method !== "POST" || req.url !== "/sebpay/proxy") return send(res, 404, { error: "not found" });
    if (!SECRET || !same(String(req.headers["x-relay-secret"] || ""), SECRET)) return send(res, 401, { error: "unauthorized" });
    let raw = "";
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 100_000) return send(res, 413, { error: "too large" });
    }
    let call;
    try {
      call = JSON.parse(raw);
    } catch {
      return send(res, 400, { error: "bad json" });
    }
    const method = call.method === "GET" ? "GET" : "POST";
    if (!PATHS.test(String(call.path))) return send(res, 400, { error: "path not allowed" });
    try {
      const upstream = await fetch(API + call.path, {
        method,
        headers: {
          "X-Public-Key": String(req.headers["x-public-key"] || ""),
          "X-Secret-Key": String(req.headers["x-secret-key"] || ""),
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: method === "POST" ? JSON.stringify(call.body ?? {}) : undefined,
        signal: AbortSignal.timeout(20_000),
      });
      return send(res, upstream.status, await upstream.text());
    } catch {
      return send(res, 502, { error: "sebpay unreachable" });
    }
  })
  .listen(8788, "127.0.0.1", () => console.log("sebpay-relay on 127.0.0.1:8788"));
SEBPAYJS
# Code secret partagé avec le site : gardé s'il existe déjà, sinon créé.
if ! grep -q '^SEBPAY_RELAY_SECRET=.\{32,\}' /etc/sebpay-relay.env 2>/dev/null; then
  printf 'SEBPAY_RELAY_SECRET=%s\n' "$(openssl rand -hex 24)" > /etc/sebpay-relay.env
fi
chmod 600 /etc/sebpay-relay.env

cat > /etc/systemd/system/sebpay-relay.service <<UNIT
[Unit]
Description=Relais SebPay (IP fixe)
After=network.target

[Service]
EnvironmentFile=/etc/sebpay-relay.env
ExecStart=$NODE /opt/sebpay-relay/server.mjs
Restart=always
User=nobody

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable sebpay-relay >/dev/null 2>&1
systemctl restart sebpay-relay
sleep 1
curl -fsS http://127.0.0.1:8788/sebpay/health >/dev/null || { journalctl -u sebpay-relay -n 15 --no-pager; fail "le module SebPay ne démarre pas"; }
echo "OK"

echo "== 2/4 Serveur web (Caddy)"
CADDYFILE=/etc/caddy/Caddyfile
[ -f "$CADDYFILE" ] || fail "fichier $CADDYFILE introuvable"
cp "$CADDYFILE" "$CADDYFILE.avant-sebpay"
python3 - "$CADDYFILE" "$RELAY_DOMAIN" <<'PY' || { cp "$CADDYFILE.avant-sebpay" "$CADDYFILE"; fail "bloc $RELAY_DOMAIN introuvable dans le Caddyfile"; }
import re, sys
path = sys.argv[1]
text = open(path).read()
text = re.sub(r"[ \t]*(handle|route) /sebpay/\* \{\n[ \t]*reverse_proxy 127\.0\.0\.1:8788\n[ \t]*\}\n", "", text)
match = re.search(re.escape(sys.argv[2]) + r"[^{\n]*\{[ \t]*\n", text)
if not match:
    sys.exit(1)
block = "\troute /sebpay/* {\n\t\treverse_proxy 127.0.0.1:8788\n\t}\n"
open(path, "w").write(text[: match.end()] + block + text[match.end() :])
PY
if ! caddy validate --config "$CADDYFILE" --adapter caddyfile >/dev/null 2>&1; then
  cp "$CADDYFILE.avant-sebpay" "$CADDYFILE"
  caddy validate --config "$CADDYFILE" --adapter caddyfile 2>&1 | tail -5
  fail "configuration refusée par Caddy (remise comme avant, MoneyFusion n'est pas touché)"
fi
systemctl reload caddy
sleep 2
echo "OK"

echo "== 3/4 Test"
curl -fsS "https://$RELAY_DOMAIN/sebpay/health" | grep -q '"ok":true' || { curl -sS "https://$RELAY_DOMAIN/sebpay/health"; echo; fail "la route /sebpay ne répond pas"; }
echo "OK"

echo "== 4/4 Code du relais à enregistrer sur le site"
echo
grep '^SEBPAY_RELAY_SECRET=' /etc/sebpay-relay.env | cut -d= -f2-
echo
echo "RELAIS SEBPAY OK : copie le code ci-dessus (une ligne de chiffres et de lettres)."
