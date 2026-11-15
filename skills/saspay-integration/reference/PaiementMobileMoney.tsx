"use client";

/**
 * Formulaire Mobile Money DANS la page (à adapter aux composants UI du projet).
 * Parcours : opérateur (logo + nom) → numéro → [code si l'opérateur l'exige] → « Payer »
 * → « Validez sur votre téléphone » → la page passe seule sur « Paiement reçu ».
 * Aucun texte, logo ni message ne mentionne SasPay.
 * Les logos sont dans public/operateurs/*.png (copiés depuis reference/operateurs).
 */
import { useEffect, useRef, useState } from "react";

interface Reseau {
  code: string;
  nom: string;
  otpAvant: boolean;
  consigneOtp: string;
  otpApres: boolean;
}

const LOGOS: [RegExp, string][] = [
  [/^mtn/, "mtn"], [/^moov/, "moov"], [/^orange/, "orange"], [/^wave/, "wave"], [/^celtiis/, "celtiis"],
  [/^free/, "free"], [/^(mixx|togocel)/, "mixx"], [/^airtel/, "airtel"], [/^coris/, "coris"], [/^djamo/, "djamo"],
  [/^wizall/, "wizall"], [/^(expresso|e_money)/, "expresso"], [/^(tmoney|t_money)/, "tmoney"],
];
const logo = (code: string) => {
  const l = LOGOS.find(([r]) => r.test(code));
  return l ? `/operateurs/${l[1]}.png` : null;
};
/** « MTN MoMo Benin » → « MTN MoMo » */
const nomCourt = (n: string) => n.replace(/\s+(Benin|Bénin|CI|Senegal|Sénégal|Togo|Burkina Faso|Mali|Niger|Cameroon|Cameroun|Guinée|Guinea)$/i, "");

export function PaiementMobileMoney({ produit, pays, onPaye }: { produit: string; pays: string; onPaye: () => void }) {
  const [reseaux, setReseaux] = useState<Reseau[]>([]);
  const [reseau, setReseau] = useState<string>();
  const [numero, setNumero] = useState("");
  const [otp, setOtp] = useState("");
  const [etape, setEtape] = useState<"saisie" | "attente" | "echec">("saisie");
  const [erreur, setErreur] = useState<string>();
  const [commande, setCommande] = useState<string>();
  const [codeSms, setCodeSms] = useState(false);
  const minuterie = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    fetch(`/api/paiement/reseaux?pays=${pays}`).then((r) => r.json()).then((d) => setReseaux(d.reseaux ?? [])).catch(() => setReseaux([]));
  }, [pays]);
  useEffect(() => () => clearTimeout(minuterie.current), []);

  const choisi = reseaux.find((r) => r.code === reseau);

  /** Interroge le serveur toutes les 3 s pendant 5 min. */
  function suivre(id: string) {
    const debut = Date.now();
    const tour = () => {
      minuterie.current = setTimeout(async () => {
        try {
          const r = await fetch(`/api/paiement/statut?id=${id}`).then((x) => x.json());
          if (r.etat === "paye") return onPaye();
          if (r.etat === "echoue") {
            setEtape("echec");
            return setErreur("Le paiement n'a pas abouti. Vous pouvez réessayer.");
          }
        } catch {
          // réseau coupé : on réessaie
        }
        if (Date.now() - debut < 5 * 60_000) tour();
        else {
          setEtape("echec");
          setErreur("Nous n'avons pas encore reçu la confirmation. Si vous avez été débité, l'accès arrivera tout seul dans quelques minutes.");
        }
      }, 3000);
    };
    tour();
  }

  async function payer() {
    setErreur(undefined);
    const r = await fetch("/api/paiement/payer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ produit, pays, reseau, numero, otp }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return setErreur(d.erreur ?? "Le paiement n'a pas pu être lancé.");
    setCommande(d.commandeId);
    if (d.pageOperateur) {
      // Wave, Orange Money… : on ouvre la page de l'opérateur dans un nouvel onglet, la page reste ouverte et vérifie.
      window.open(d.pageOperateur, "_blank", "noopener");
    }
    setCodeSms(!!d.otpApres);
    setEtape("attente");
    suivre(d.commandeId);
  }

  async function envoyerCode() {
    const r = await fetch("/api/paiement/code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: commande, otp }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return setErreur(d.erreur);
    if (d.etat === "paye") onPaye();
  }

  if (etape === "attente") {
    return (
      <div className="grid gap-3 text-center">
        <p className="font-medium">Validez le paiement sur votre téléphone</p>
        <p className="text-sm text-muted-foreground">Une demande de paiement {choisi ? nomCourt(choisi.nom) : ""} vient d&apos;arriver. Entrez votre code secret pour confirmer.</p>
        {codeSms && (
          <div className="grid gap-2">
            <input value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="Code reçu par SMS" inputMode="numeric" />
            <button onClick={envoyerCode}>Confirmer le code</button>
          </div>
        )}
        {erreur && <p className="text-sm text-destructive">{erreur}</p>}
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {reseaux.map((r) => (
          <button key={r.code} type="button" onClick={() => setReseau(r.code)} className={r.code === reseau ? "ring-2 ring-primary" : ""}>
            {logo(r.code) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo(r.code)!} alt="" className="size-8 rounded-full" />
            ) : (
              <span className="size-8 rounded-full">{r.nom.slice(0, 1)}</span>
            )}
            {nomCourt(r.nom)}
          </button>
        ))}
      </div>
      <input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="Numéro Mobile Money" inputMode="tel" />
      {choisi?.otpAvant && (
        <>
          <p className="text-sm text-muted-foreground">{choisi.consigneOtp || "Composez le code indiqué par votre opérateur pour obtenir un code de paiement."}</p>
          <input value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="Code de paiement" inputMode="numeric" />
        </>
      )}
      {etape === "echec" && erreur && <p className="text-sm text-destructive">{erreur}</p>}
      {etape === "saisie" && erreur && <p className="text-sm text-destructive">{erreur}</p>}
      <button onClick={payer} disabled={!reseau || numero.replace(/\D/g, "").length < 8}>
        Payer maintenant
      </button>
      <p className="text-xs text-muted-foreground">Paiement sécurisé. Les frais de l&apos;opérateur peuvent s&apos;ajouter au montant.</p>
    </div>
  );
}
