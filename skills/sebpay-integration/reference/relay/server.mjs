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
