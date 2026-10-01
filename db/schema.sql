-- =============================================================================
-- Sultan Clothing — Supabase schema
--
-- Run this once in the Supabase SQL editor (Dashboard -> SQL Editor -> New query),
-- then seed the catalogue with:  npm run seed
--
-- Money is stored in kobo (1 naira = 100 kobo) as integers so totals never
-- drift through floating point rounding.
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- products
-- -----------------------------------------------------------------------------
create table if not exists public.products (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  name          text not null,
  tagline       text,
  description   text,
  category      text not null,
  price_kobo    integer not null check (price_kobo > 0),
  image_url     text,
  sizes         text[] not null default '{}',
  stock         integer not null default 0 check (stock >= 0),
  featured      boolean not null default false,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

comment on table public.products is 'Shop catalogue. Prices in kobo.';

-- -----------------------------------------------------------------------------
-- orders
-- -----------------------------------------------------------------------------
create sequence if not exists public.order_number_seq start 1001;

create table if not exists public.orders (
  id                     uuid primary key default gen_random_uuid(),
  order_number           text unique not null,
  user_id                uuid references auth.users (id) on delete set null,
  email                  text not null,
  status                 text not null default 'confirmed'
                           check (status in ('pending', 'confirmed', 'shipped', 'delivered', 'cancelled')),
  full_name              text not null,
  phone                  text not null,
  address_line1          text not null,
  address_line2          text,
  city                   text not null,
  state                  text not null,
  notes                  text,
  payment_method         text not null default 'card',
  payment_reference      text,
  subtotal_kobo          integer not null check (subtotal_kobo >= 0),
  delivery_kobo          integer not null default 0 check (delivery_kobo >= 0),
  total_kobo             integer not null check (total_kobo >= 0),
  confirmation_sent_at   timestamptz,
  created_at             timestamptz not null default now()
);

create index if not exists orders_user_id_created_at_idx on public.orders (user_id, created_at desc);

-- -----------------------------------------------------------------------------
-- order_items
-- -----------------------------------------------------------------------------
create table if not exists public.order_items (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references public.orders (id) on delete cascade,
  product_id       uuid references public.products (id) on delete set null,
  slug             text,
  name             text not null,
  size             text,
  image_url        text,
  unit_price_kobo  integer not null check (unit_price_kobo >= 0),
  quantity         integer not null check (quantity > 0),
  line_total_kobo  integer not null check (line_total_kobo >= 0)
);

create index if not exists order_items_order_id_idx on public.order_items (order_id);

-- -----------------------------------------------------------------------------
-- newsletter_subscribers
-- -----------------------------------------------------------------------------
create table if not exists public.newsletter_subscribers (
  id            uuid primary key default gen_random_uuid(),
  email         text unique not null,
  user_id       uuid references auth.users (id) on delete set null,
  welcomed_at   timestamptz,
  created_at    timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- place_order — the only path that writes orders.
--
-- It is SECURITY DEFINER because the Node server calls it with the service role
-- key (which cannot supply a user id of its own). Prices, stock and totals are
-- always recomputed from the products table here, so a tampered browser payload
-- cannot change what a customer is charged.
--
-- Postgres requires that every parameter following one with a default also has a
-- default, so the optional arguments sit last. Callers pass everything by name, so
-- the order here does not matter to them.
-- -----------------------------------------------------------------------------
create or replace function public.place_order(
  p_user_id         uuid,
  p_email           text,
  p_full_name       text,
  p_phone           text,
  p_address_line1   text,
  p_city            text,
  p_state           text,
  p_items           jsonb,
  p_address_line2   text default null,
  p_notes           text default null,
  p_payment_method  text default 'card',
  p_payment_ref     text default null,
  p_delivery_kobo   integer default 0
)
returns public.orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order      public.orders;
  v_item       jsonb;
  v_product    public.products;
  v_qty        integer;
  v_subtotal   integer := 0;
  v_delivery   integer := coalesce(p_delivery_kobo, 0);
  v_slug       text;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Cart is empty' using errcode = '22023';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_slug := v_item ->> 'slug';
    v_qty  := coalesce((v_item ->> 'quantity')::integer, 0);

    if v_qty < 1 or v_qty > 20 then
      raise exception 'Quantity for % must be between 1 and 20', v_slug using errcode = '22023';
    end if;

    select * into v_product from public.products where slug = v_slug and active;

    if not found then
      raise exception 'Product % is no longer available', v_slug using errcode = '22023';
    end if;

    if v_product.stock < v_qty then
      raise exception 'Only % left of %', v_product.stock, v_product.name using errcode = '22023';
    end if;

    update public.products
       set stock = stock - v_qty
     where id = v_product.id;

    v_subtotal := v_subtotal + (v_product.price_kobo * v_qty);
  end loop;

  insert into public.orders (
    order_number, user_id, email, full_name, phone, address_line1, address_line2,
    city, state, notes, payment_method, payment_reference,
    subtotal_kobo, delivery_kobo, total_kobo
  )
  values (
    'SLT-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.order_number_seq')::text, 5, '0'),
    p_user_id, p_email, p_full_name, p_phone, p_address_line1, p_address_line2,
    p_city, p_state, p_notes, p_payment_method, p_payment_ref,
    v_subtotal, v_delivery, v_subtotal + v_delivery
  )
  returning * into v_order;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_slug := v_item ->> 'slug';
    v_qty  := (v_item ->> 'quantity')::integer;

    insert into public.order_items (
      order_id, product_id, slug, name, size, image_url, unit_price_kobo, quantity, line_total_kobo
    )
    select
      v_order.id, p.id, p.slug, p.name,
      nullif(v_item ->> 'size', ''),
      p.image_url, p.price_kobo, v_qty, p.price_kobo * v_qty
    from public.products p
    where p.slug = v_slug;
  end loop;

  return v_order;
end;
$$;

revoke execute on function public.place_order from public, anon, authenticated;
grant execute on function public.place_order to service_role;

-- -----------------------------------------------------------------------------
-- Row level security
--
-- The Node server uses the service role key and therefore bypasses RLS. These
-- policies exist so the tables are also safe if anything ever queries Supabase
-- straight from the browser with the anon key.
-- -----------------------------------------------------------------------------
alter table public.products enable row level security;
alter table public.orders   enable row level security;
alter table public.order_items enable row level security;
alter table public.newsletter_subscribers enable row level security;

drop policy if exists "products are public" on public.products;
create policy "products are public"
  on public.products for select
  to anon, authenticated
  using (active);

drop policy if exists "customers read their own orders" on public.orders;
create policy "customers read their own orders"
  on public.orders for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "customers read their own order items" on public.order_items;
create policy "customers read their own order items"
  on public.order_items for select
  to authenticated
  using (exists (
    select 1 from public.orders o
    where o.id = order_items.order_id and o.user_id = auth.uid()
  ));
