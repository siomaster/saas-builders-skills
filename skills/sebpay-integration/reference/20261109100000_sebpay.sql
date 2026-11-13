-- SebPay : troisième prestataire Mobile Money, au choix dans Paramètres › Paiements.
-- Le client paie sur la page SebPay ; la commande garde l'identifiant de sa session pour la vérification.
alter table public.landing_settings drop constraint if exists landing_settings_mobile_money_provider_check;
alter table public.landing_settings add constraint landing_settings_mobile_money_provider_check
  check (mobile_money_provider in ('nyole', 'moneyfusion', 'sebpay'));

alter table public.payments add column if not exists sebpay_session_id text;
create unique index if not exists payments_sebpay_session_idx on public.payments (sebpay_session_id) where sebpay_session_id is not null;

-- Rattrapage toutes les 2 min : aussi les commandes SebPay en attente.
create or replace function public.sweep_pending_payments()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_secret text;
begin
  if not exists (
    select 1 from public.payments
    where (provider_token is not null or moneyfusion_token is not null or dodo_session_id is not null or sebpay_session_id is not null)
      and created_at > now() - interval '2 days'
      and (status = 'pending' or (status = 'paid' and fulfillment_status = 'failed'))
  ) then
    return;
  end if;

  select value into v_secret from public.app_secrets where key = 'cron_secret';
  perform net.http_post(
    url := 'https://hhnikofaujmzwjlhybvi.supabase.co/functions/v1/subscription-cron',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := jsonb_build_object('sweep_payments', true)
  );
end;
$$;
