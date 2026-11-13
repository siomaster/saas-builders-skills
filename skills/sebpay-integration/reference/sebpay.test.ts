import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { collectionErrorMessage, normalizeOperators, sebpayApiUrl, sebpayCollectionVerdict, sebpayVerdict, verifySebpaySignature, type SebpaySession } from "../../supabase/functions/_shared/sebpay-core";

const payment = { id: "11111111-2222-3333-4444-555555555555", amount: 12500, currency: "XOF" };
const session = (over: Partial<SebpaySession> = {}): SebpaySession => ({
  id: "cs_1", status: "open", transaction_status: "pending", external_reference: `${payment.id}:1`, metadata: { payment_id: payment.id },
  amount: 12500, currency: "XOF", checkout_url: "https://pay.example", expires_at: new Date().toISOString(), ...over,
});

describe("SebPay", () => {
  it("choisit le serveur selon la clé", () => {
    expect(sebpayApiUrl("pk_test_abc")).toBe("https://api.sandbox.sebpay.bj/api/v1");
    expect(sebpayApiUrl("pk_live_abc")).toBe("https://newapi.sebpay.bj/api/v1");
    expect(sebpayApiUrl("pk_live_abc", "https://autre.example/api/v1/")).toBe("https://autre.example/api/v1");
  });

  it("accepte seulement une notification signée avec la clé secrète, sur le corps brut", async () => {
    const body = '{"transaction_id":"1","status":"approved"}';
    const good = createHmac("sha256", "sk_test_secret").update(body).digest("hex");
    expect(await verifySebpaySignature(body, good, "sk_test_secret")).toBe(true);
    expect(await verifySebpaySignature(body, good.toUpperCase(), "sk_test_secret")).toBe(true);
    expect(await verifySebpaySignature(body + " ", good, "sk_test_secret")).toBe(false);
    expect(await verifySebpaySignature(body, good, "sk_test_autre")).toBe(false);
    expect(await verifySebpaySignature(body, "", "sk_test_secret")).toBe(false);
  });

  it("ne valide que les paiements approuvés de cette commande, au bon montant", () => {
    expect(sebpayVerdict(session({ transaction_status: "approved", status: "completed" }), payment).status).toBe("paid");
    expect(sebpayVerdict(session({ transaction_status: "approved", amount: 5000 }), payment).reason).toBe("sebpay-amount");
    expect(sebpayVerdict(session({ transaction_status: "approved", currency: "EUR" }), payment).reason).toBe("sebpay-amount");
    expect(sebpayVerdict(session({ transaction_status: "approved", metadata: { payment_id: "autre" } }), payment).reason).toBe("sebpay-other-order");
    expect(sebpayVerdict(session({ transaction_status: "rejected" }), payment).status).toBe("pending");
    expect(sebpayVerdict(session({ status: "expired", transaction_status: "rejected" }), payment).status).toBe("failed");
  });

  it("paiement dans la page : valide seulement la collecte approuvée de cette commande, au bon montant", () => {
    const c = { external_reference: `${payment.id}:c1`, status: "approved" as const, amount: 12500, currency: "XOF" };
    expect(sebpayCollectionVerdict(c, payment).status).toBe("paid");
    expect(sebpayCollectionVerdict({ ...c, amount: 100 }, payment).reason).toBe("sebpay-amount");
    expect(sebpayCollectionVerdict({ ...c, external_reference: "autre:c1" }, payment).reason).toBe("sebpay-other-order");
    expect(sebpayCollectionVerdict({ ...c, status: "rejected" }, payment)).toEqual({ status: "pending", reason: "sebpay-rejected" });
    expect(sebpayCollectionVerdict({ ...c, status: "pending" }, payment).status).toBe("pending");
  });

  it("lit la liste des opérateurs et les refus SebPay", () => {
    const ops = normalizeOperators({ data: [{ id: "1", name: "MTN Bénin", slug: "mtn-bj", code: "mtn", otp_required: false }, { name: "Orange", slug: "orange-ci", otp_required: true, ussd_code: "#144*82#" }, { foo: 1 }] });
    expect(ops).toEqual([{ code: "mtn", name: "MTN Bénin", otp: false, ussd: null }, { code: "orange-ci", name: "Orange", otp: true, ussd: "#144*82#" }]);
    expect(normalizeOperators(null)).toEqual([]);
    expect(collectionErrorMessage(422, { code: "OTP_REQUIRED" }).otp).toBe(true);
    expect(collectionErrorMessage(400, { code: "PAYMENT_DECLINED" }).message).toMatch(/refusé/);
    expect(collectionErrorMessage(503, {}).message).toMatch(/indisponible/);
  });
});
