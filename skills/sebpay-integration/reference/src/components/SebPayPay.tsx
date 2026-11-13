import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Smartphone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { countryByCode } from "@/lib/countries";

type Operator = { code: string; name: string; otp: boolean; ussd: string | null };
type Start = { country?: string; phone?: string; operators?: Operator[]; waiting?: { provider_link: string | null } | null; status?: string; error?: string };
type Collect = { status?: string; provider_link?: string | null; message?: string; error?: string; otp_required?: boolean };

/** Appel serveur limité dans le temps : sur un réseau mobile lent, on relance plutôt que d'attendre sans fin. */
const call = async <T,>(body: Record<string, unknown>, ms = 25000): Promise<T> => {
  const timeout = new Promise<T>((resolve) => window.setTimeout(() => resolve({ error: "timeout" } as T), ms));
  const req = supabase.functions.invoke("sebpay-checkout", { body }).then(async ({ data, error }) => {
    if (data) return data as T;
    return ((await (error as { context?: Response } | null)?.context?.json().catch(() => null)) ?? { error: "" }) as T;
  });
  return Promise.race([req, timeout]).catch(() => ({ error: "" }) as T);
};

/** Logo de l'opérateur (public/operators), reconnu par son code ou son nom SebPay. */
const LOGOS: [RegExp, string][] = [
  [/mtn|momo/i, "mtn"],
  [/moov|flooz/i, "moov"],
  [/orange/i, "orange"],
  [/wave/i, "wave"],
  [/celtiis/i, "celtiis"],
  [/airtel/i, "airtel"],
  [/free/i, "free"],
  [/t-?money|togocom|yas/i, "tmoney"],
  [/coris/i, "coris"],
];
const logoOf = (o: Operator) => LOGOS.find(([re]) => re.test(`${o.code} ${o.name}`))?.[1] ?? null;

const FAIL = "Le paiement Mobile Money n'a pas pu démarrer. Vérifie ta connexion et réessaie.";

/**
 * Paiement Mobile Money SebPay dans la page (sans redirection) : l'acheteur choisit son opérateur,
 * garde le numéro saisi à l'étape 1 (modifiable) et valide sur son téléphone. La page de paiement,
 * qui vérifie la commande toutes les 3 s, l'envoie sur la confirmation dès que SebPay a approuvé.
 */
export const SebPayPay = ({ paymentId, checkoutToken, onReady }: { paymentId: string; checkoutToken: string; onReady?: () => void }) => {
  const [loadError, setLoadError] = useState<string | null>(null);
  const [operators, setOperators] = useState<Operator[] | null>(null);
  const [country, setCountry] = useState("BJ");
  const [operator, setOperator] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [waiting, setWaiting] = useState<{ link: string | null } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  const dial = (countryByCode(country)?.dial ?? "").replace(/\D/g, "");
  const chosen = operators?.find((o) => o.code === operator) ?? null;

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    setOperators(null);
    void (async () => {
      let res = await call<Start>({ action: "start", payment_id: paymentId, checkout_token: checkoutToken });
      if (!res?.operators && !cancelled) res = await call<Start>({ action: "start", payment_id: paymentId, checkout_token: checkoutToken });
      if (cancelled) return;
      onReadyRef.current?.();
      if (res?.status === "paid") return setWaiting({ link: null });
      if (!res?.operators?.length) return setLoadError(res?.error && res.error !== "timeout" ? res.error : FAIL);
      const code = String(res.country || "BJ").toUpperCase();
      const prefix = (countryByCode(code)?.dial ?? "").replace(/\D/g, "");
      const full = String(res.phone || "");
      setCountry(code);
      setPhone(prefix && full.startsWith(prefix) ? full.slice(prefix.length) : full);
      setOperators(res.operators);
      if (res.operators.length === 1) setOperator(res.operators[0].code);
      if (res.waiting) setWaiting({ link: res.waiting.provider_link });
    })();
    return () => {
      cancelled = true;
    };
  }, [paymentId, checkoutToken, attempt]);

  // En attente de validation sur le téléphone : un refus de l'opérateur ramène au formulaire.
  useEffect(() => {
    if (!waiting) return;
    let stop = false;
    const tick = async () => {
      if (stop) return;
      const res = await call<{ status?: string }>({ action: "status", payment_id: paymentId, checkout_token: checkoutToken }, 15000);
      if (stop) return;
      if (res?.status === "rejected") {
        setWaiting(null);
        setError("Le paiement a été refusé ou annulé sur le téléphone. Vérifie ton solde et réessaie.");
        return;
      }
      if (res?.status !== "paid") window.setTimeout(() => void tick(), 4000);
    };
    const t = window.setTimeout(() => void tick(), 4000);
    return () => {
      stop = true;
      window.clearTimeout(t);
    };
  }, [waiting, paymentId, checkoutToken]);

  const pay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chosen) return setError("Choisis ton opérateur.");
    const local = phone.replace(/\D/g, "");
    if (local.length < 7) return setError("Saisis ton numéro Mobile Money.");
    if (chosen.otp && otp.replace(/\s/g, "").length < 4) return setError("Saisis le code reçu par SMS après avoir composé le code indiqué.");
    setError(null);
    setSending(true);
    const res = await call<Collect>({ action: "collect", payment_id: paymentId, checkout_token: checkoutToken, operator: chosen.code, country, phone: `${dial}${local}`, ...(chosen.otp ? { otp_code: otp } : {}) });
    setSending(false);
    if (res?.status === "pending" || res?.status === "paid") {
      setWaiting({ link: res.provider_link ?? null });
      // Wave, Orange… : l'opérateur exige une validation sur sa page (nouvel onglet), la page reste ouverte ici.
      if (res.provider_link) window.open(res.provider_link, "_blank", "noopener");
      return;
    }
    if (res?.otp_required && !chosen.otp) setOperators((list) => list?.map((o) => (o.code === chosen.code ? { ...o, otp: true } : o)) ?? null);
    setError(res?.error && res.error !== "timeout" ? res.error : FAIL);
  };

  if (loadError)
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl bg-destructive/10 px-4 py-4 text-center text-sm text-destructive">
        <p>{loadError}</p>
        <button type="button" onClick={() => setAttempt((n) => n + 1)} className="button-20 rounded-full px-5 py-2 text-sm font-semibold">Réessayer</button>
      </div>
    );

  if (!operators && !waiting)
    return (
      <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-2xl bg-[#f5f5f7] px-4 text-center text-sm text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        Chargement du paiement Mobile Money…
      </div>
    );

  if (waiting)
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl bg-[#f5f5f7] px-5 py-6 text-center">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
          <Smartphone className="h-6 w-6" />
        </span>
        <p className="text-base font-semibold">Valide le paiement sur ton téléphone</p>
        <p className="text-sm text-muted-foreground">
          {waiting.link ? "Termine la validation sur la page de ton opérateur, puis reviens ici." : "Une demande de paiement a été envoyée à ton numéro. Confirme-la avec ton code secret Mobile Money."}
        </p>
        {waiting.link && (
          <a href={waiting.link} target="_blank" rel="noopener" className="button-20 rounded-full px-5 py-2 text-sm font-semibold">
            Ouvrir la page de validation
          </a>
        )}
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> En attente de la confirmation…
        </p>
        {operators && (
          <button type="button" onClick={() => setWaiting(null)} className="text-xs font-medium text-primary underline underline-offset-2">
            Changer de numéro ou d'opérateur
          </button>
        )}
      </div>
    );

  return (
    <form onSubmit={(e) => void pay(e)} className="space-y-4 rounded-2xl bg-[#f5f5f7] p-4 sm:p-5">
      <div className="space-y-2">
        <p className="text-sm font-medium">Opérateur</p>
        <div className="grid grid-cols-2 gap-2">
          {operators!.map((o) => (
            <button
              key={o.code}
              type="button"
              onClick={() => {
                setOperator(o.code);
                setError(null);
              }}
              className={`flex items-center gap-2.5 rounded-xl border bg-white px-3 py-2.5 text-left text-sm font-medium transition-colors ${o.code === operator ? "border-primary text-primary" : "border-border hover:border-primary/50"}`}
            >
              {logoOf(o) ? (
                <img src={`/operators/${logoOf(o)}.png`} alt="" width={28} height={28} className="h-7 w-7 shrink-0 rounded-full" />
              ) : (
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#f5f5f7] text-xs font-semibold text-muted-foreground">{o.name.charAt(0)}</span>
              )}
              <span className="min-w-0 leading-tight">{o.name}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="sebpay-phone" className="text-sm font-medium">Numéro Mobile Money</label>
        <div className="flex h-12 items-center overflow-hidden rounded-xl border border-border bg-white focus-within:border-primary">
          <span className="shrink-0 border-r border-border px-3 text-sm text-muted-foreground">+{dial}</span>
          <input id="sebpay-phone" inputMode="tel" autoComplete="tel-national" value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d ]/g, "").slice(0, 16))} className="h-full min-w-0 flex-1 bg-transparent px-3 text-sm outline-none" />
        </div>
      </div>
      {chosen?.otp && (
        <div className="space-y-1.5">
          <label htmlFor="sebpay-otp" className="text-sm font-medium">Code de validation</label>
          <p className="text-xs text-muted-foreground">
            {chosen.ussd ? <>Compose <span className="font-semibold text-foreground">{chosen.ussd}</span> sur ton téléphone, puis saisis le code reçu.</> : "Ton opérateur t'envoie un code de validation : saisis-le ici."}
          </p>
          <input id="sebpay-otp" inputMode="numeric" autoComplete="one-time-code" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 8))} className="h-12 w-full rounded-xl border border-border bg-white px-3 text-sm outline-none focus:border-primary" />
        </div>
      )}
      {error && <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <button type="submit" disabled={sending} className="button-20 flex h-12 w-full items-center justify-center gap-2 rounded-full text-sm font-semibold disabled:opacity-60">
        {sending && <Loader2 className="h-4 w-4 animate-spin" />} Payer maintenant
      </button>
    </form>
  );
};

export default SebPayPay;
