-- Cancelacion operativa controlada para la reserva pagada actual de la mesa 19.
-- Prosof sigue siendo la fuente financiera oficial de la devolucion.
-- Esta migracion NO modifica el pago original ni los flujos de ePayco.

create table if not exists public.bn_reservation_cancellations (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null unique
    references public.bn_reservations(id) on delete restrict,
  table_number integer not null,
  original_invoice text not null,
  payment_provider_ref text not null,
  amount_snapshot integer not null,
  cancellation_reason text not null,
  prosof_reference text not null,
  refund_date date not null,
  notes text,
  registered_by uuid not null
    references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint bn_reservation_cancellations_amount_positive
    check (amount_snapshot > 0),
  constraint bn_reservation_cancellations_table19_only
    check (table_number = 19)
);

comment on table public.bn_reservation_cancellations is
  'Trazabilidad operativa de cancelaciones posteriores a devoluciones procesadas en Prosof. Fase inicial restringida a la mesa 19.';
comment on column public.bn_reservation_cancellations.prosof_reference is
  'Documento o referencia del proceso de devolucion en Prosof; no ejecuta movimientos financieros.';
comment on column public.bn_reservation_cancellations.amount_snapshot is
  'Copia inmutable del valor aprobado originalmente; no modifica bn_payments.';

alter table public.bn_reservation_cancellations enable row level security;

revoke all on table public.bn_reservation_cancellations from public;
revoke all on table public.bn_reservation_cancellations from anon;
revoke all on table public.bn_reservation_cancellations from authenticated;
grant select, insert on table public.bn_reservation_cancellations to service_role;

create or replace function public.bn_admin_cancel_paid_table19(
  p_id uuid,
  p_actor uuid,
  p_reason text,
  p_prosof_reference text,
  p_refund_date date,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  target_id constant uuid := '3fe6a52a-0878-464c-b582-ff498b945612'::uuid;
  r public.bn_reservations;
  pay public.bn_payments;
  existing public.bn_reservation_cancellations;
  clean_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  clean_reference text := nullif(btrim(coalesce(p_prosof_reference, '')), '');
  clean_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  available_at_commit boolean;
begin
  if not exists (
    select 1
    from public.bn_admin_users
    where user_id = p_actor and enabled
  ) then
    raise exception 'NOT_AUTHORIZED';
  end if;

  -- Doble restriccion: esta primera fase solo puede operar la reserva exacta
  -- de la mesa 19. Cualquier otro UUID falla antes de tocar datos.
  if p_id is distinct from target_id then
    raise exception 'TARGET_RESERVATION_ONLY';
  end if;

  if clean_reason is null or length(clean_reason) < 5 or length(clean_reason) > 300 then
    raise exception 'INVALID_REASON';
  end if;
  if clean_reference is null or length(clean_reference) > 100 then
    raise exception 'INVALID_PROSOF_REFERENCE';
  end if;
  if clean_notes is not null and length(clean_notes) > 500 then
    raise exception 'NOTES_TOO_LONG';
  end if;
  if p_refund_date is null or p_refund_date > current_date then
    raise exception 'INVALID_REFUND_DATE';
  end if;

  select * into r
  from public.bn_reservations
  where id = p_id;
  if not found then
    raise exception 'RESERVATION_NOT_FOUND';
  end if;

  if r.table_number <> 19 or r.source <> 'checkout' or r.invoice !~ '^BN26LIVE-' then
    raise exception 'TABLE19_LIVE_CHECKOUT_ONLY';
  end if;

  if not exists (
    select 1
    from public.bn_events
    where id = r.event_id
      and slug = 'blanco-negro-2026'
      and environment = 'live'
  ) then
    raise exception 'LIVE_EVENT_REQUIRED';
  end if;

  -- Mantiene el mismo orden de bloqueo usado por creacion y aplicacion de pagos:
  -- mesa -> reserva -> pago. Esto evita carreras y bloqueos cruzados.
  perform 1
  from public.bn_tables
  where event_id = r.event_id and number = 19
  for update;
  if not found then
    raise exception 'TABLE_NOT_FOUND';
  end if;

  select * into r
  from public.bn_reservations
  where id = p_id
  for update;

  select * into existing
  from public.bn_reservation_cancellations
  where reservation_id = p_id;

  if found then
    if r.status = 'cancelled' then
      return jsonb_build_object(
        'duplicate', true,
        'reservationId', r.id,
        'table', r.table_number,
        'status', r.status,
        'cancellationId', existing.id,
        'prosofReference', existing.prosof_reference,
        'amount', existing.amount_snapshot
      );
    end if;
    raise exception 'CANCELLATION_STATE_INCONSISTENT';
  end if;

  if r.status <> 'confirmed' then
    raise exception 'RESERVATION_NOT_CONFIRMED';
  end if;

  select * into pay
  from public.bn_payments
  where reservation_id = r.id
  for update;
  if not found then
    raise exception 'PAYMENT_NOT_FOUND';
  end if;

  if pay.status <> 'approved'
     or pay.provider_status <> 'approved'
     or pay.provider_ref is null
     or pay.transaction_id is null
     or pay.verified_at is null
     or pay.amount_paid is null then
    raise exception 'APPROVED_PAYMENT_REQUIRED';
  end if;

  if pay.amount_paid <> r.amount
     or pay.amount_paid <> r.commercial_amount then
    raise exception 'PAYMENT_AMOUNT_MISMATCH';
  end if;

  if p_refund_date < (pay.verified_at at time zone 'America/Bogota')::date then
    raise exception 'REFUND_BEFORE_PAYMENT';
  end if;

  insert into public.bn_reservation_cancellations (
    reservation_id,
    table_number,
    original_invoice,
    payment_provider_ref,
    amount_snapshot,
    cancellation_reason,
    prosof_reference,
    refund_date,
    notes,
    registered_by
  ) values (
    r.id,
    r.table_number,
    r.invoice,
    pay.provider_ref,
    pay.amount_paid,
    clean_reason,
    clean_reference,
    p_refund_date,
    clean_notes,
    p_actor
  )
  returning * into existing;

  -- El pago aprobado permanece intacto. Solo se cancela la reserva operativa.
  update public.bn_reservations
  set status = 'cancelled',
      expires_at = null,
      updated_at = now()
  where id = r.id;

  insert into public.bn_audit (
    reservation_id,
    actor,
    action,
    detail
  ) values (
    r.id,
    p_actor,
    'paid_reservation_cancelled_after_prosof_refund',
    jsonb_build_object(
      'table', r.table_number,
      'invoice', r.invoice,
      'paymentReference', pay.provider_ref,
      'amount', pay.amount_paid,
      'prosofReference', clean_reference,
      'refundDate', p_refund_date,
      'reason', clean_reason,
      'notes', clean_notes,
      'paymentStatusPreserved', pay.status
    )
  );

  select not exists (
    select 1
    from public.bn_reservations x
    where x.event_id = r.event_id
      and x.table_number = 19
      and x.status in ('held', 'opening', 'payment_pending', 'confirmed', 'review')
  ) into available_at_commit;

  if not available_at_commit then
    raise exception 'TABLE_NOT_RELEASED';
  end if;

  return jsonb_build_object(
    'duplicate', false,
    'reservationId', r.id,
    'table', r.table_number,
    'status', 'cancelled',
    'cancellationId', existing.id,
    'prosofReference', existing.prosof_reference,
    'refundDate', existing.refund_date,
    'amount', existing.amount_snapshot,
    'paymentStatus', pay.status,
    'tableAvailableAtCommit', available_at_commit
  );
end
$function$;

revoke execute on function public.bn_admin_cancel_paid_table19(uuid, uuid, text, text, date, text) from public;
revoke execute on function public.bn_admin_cancel_paid_table19(uuid, uuid, text, text, date, text) from anon;
revoke execute on function public.bn_admin_cancel_paid_table19(uuid, uuid, text, text, date, text) from authenticated;
grant execute on function public.bn_admin_cancel_paid_table19(uuid, uuid, text, text, date, text) to service_role;
