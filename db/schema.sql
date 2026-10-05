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
-- cart_items — the shopping bag, stored per account.
--
-- The bag lives here rather than in the browser's localStorage so the same cart is visible
-- from every device the customer signs in on: the website and the phone app show the same
-- contents. Rows are keyed by (user_id, slug, size) so adding the same product twice
-- updates one row instead of stacking duplicates.
--
-- Only slug, size and quantity are stored. Name, price and image are joined from products
-- on read, so a price change is reflected everywhere at once and a cart can never hold a
-- stale price.
-- -----------------------------------------------------------------------------
create table if not exists public.cart_items (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  slug       text not null,
  size       text not null default '',
  quantity   integer not null default 1 check (quantity > 0 and quantity <= 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One row per product/size per customer. size is NOT NULL with a '' default so this is a plain
-- composite index, which also lets the API upsert on conflict without naming an expression.
create unique index if not exists cart_items_user_slug_size_idx
  on public.cart_items (user_id, slug, size);
create index if not exists cart_items_user_idx on public.cart_items (user_id);

-- The bag stores only slug/size/quantity and reads name, price and image from products. That join
-- is done in the server rather than inline in a PostgREST select, because PostgREST can only embed a
-- related table when it can discover a foreign key. Without this constraint there is no such
-- relationship to discover and an embedded select fails with PGRST200, so the constraint is what
-- makes the declared design possible at all.
--
-- Guarded so it can be re-run against a database that already has it. Any cart rows whose slug no
-- longer exists in products would block the add, so those are dropped first: they point at a
-- product that is gone and can never be shown or bought.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'cart_items_slug_fkey'
  ) then
    delete from public.cart_items ci
    where not exists (select 1 from public.products p where p.slug = ci.slug);

    alter table public.cart_items
      add constraint cart_items_slug_fkey
      foreign key (slug) references public.products (slug)
      on update cascade on delete cascade;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- merge_cart — folds a client-side guest bag into the account's cart.
--
-- Called when a customer signs in carrying items from localStorage or from the other
-- device. Quantities are added rather than replaced, and the ceiling of 20 per line is
-- the same one the website enforces, so a merge cannot exceed stock limits.
--
-- SECURITY DEFINER for the same reason as place_order: the Node server calls it with the
-- service role key and supplies the user id itself.
-- -----------------------------------------------------------------------------
create or replace function public.merge_cart(
  p_user_id uuid,
  p_items   jsonb
)
returns setof public.cart_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
begin
  if p_items is null then
    return;
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into public.cart_items (user_id, slug, size, quantity)
    values (
      p_user_id,
      v_item ->> 'slug',
      coalesce(v_item ->> 'size', ''),
      least(greatest(coalesce((v_item ->> 'quantity')::integer, 1), 1), 20)
    )
    on conflict (user_id, slug, size) do update
      set quantity = least(
            public.cart_items.quantity
            + least(greatest(coalesce(excluded.quantity, 1), 1), 20),
            20
          ),
          updated_at = now();
  end loop;

  return query
    select * from public.cart_items where user_id = p_user_id order by created_at;
end;
$$;

revoke execute on function public.merge_cart from public, anon, authenticated;
grant execute on function public.merge_cart to service_role;

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
alter table public.cart_items enable row level security;
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

drop policy if exists "customers manage their own cart" on public.cart_items;
create policy "customers manage their own cart"
  on public.cart_items for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
