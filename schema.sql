-- SQL Schema for E-Commerce Node.js + Supabase

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. Users Table (public.users)
-- Syncs with auth.users using a PostgreSQL trigger
create table public.users (
  id uuid references auth.users on delete cascade primary key,
  full_name text not null,
  email text not null unique,
  phone text,
  role text not null default 'customer' check (role in ('admin', 'customer')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS (Row Level Security) on users
alter table public.users enable row level security;

-- 2. Categories Table
create table public.categories (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  description text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS on categories
alter table public.categories enable row level security;

-- 3. Products Table
create table public.products (
  id uuid default gen_random_uuid() primary key,
  category_id uuid references public.categories(id) on delete set null,
  name text not null,
  description text,
  price numeric not null check (price >= 0),
  stock integer not null default 0 check (stock >= 0),
  image_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS on products
alter table public.products enable row level security;

-- 4. Carts Table
create table public.carts (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id) on delete cascade unique,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS on carts
alter table public.carts enable row level security;

-- 5. Cart Items Table
create table public.cart_items (
  id uuid default gen_random_uuid() primary key,
  cart_id uuid references public.carts(id) on delete cascade,
  product_id uuid references public.products(id) on delete cascade,
  quantity integer not null default 1 check (quantity > 0),
  unique(cart_id, product_id)
);

-- Enable RLS on cart_items
alter table public.cart_items enable row level security;

-- 6. Orders Table
create table public.orders (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users(id) on delete cascade,
  total_price numeric not null check (total_price >= 0),
  payment_method text not null,
  status text not null default 'Menunggu Pembayaran' check (status in ('Menunggu Pembayaran', 'Diproses', 'Dikirim', 'Selesai')),
  shipping_name text not null,
  shipping_phone text not null,
  shipping_address text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS on orders
alter table public.orders enable row level security;

-- 7. Order Items Table
create table public.order_items (
  id uuid default gen_random_uuid() primary key,
  order_id uuid references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  quantity integer not null check (quantity > 0),
  price numeric not null check (price >= 0)
);

-- Enable RLS on order_items
alter table public.order_items enable row level security;


-- --- TRIGGERS FOR USER SYNC ---
-- Create a trigger function that handles new auth registrations
create or replace function public.handle_new_user()
returns trigger as $$
declare
  default_role text := 'customer';
begin
  -- Check if metadata contains a custom role, or check if it is the first user (can set as admin if needed)
  -- But default to customer.
  insert into public.users (id, full_name, email, phone, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.email,
    coalesce(new.raw_user_meta_data->>'phone', ''),
    coalesce(new.raw_user_meta_data->>'role', default_role)
  );
  return new;
end;
$$ language plpgsql security definer;

-- Trigger to execute the function on signup
create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- --- ROW LEVEL SECURITY POLICIES ---
-- For this Express App, the backend acts as a controller that can use the Supabase service role
-- to bypass RLS, OR we can set up permissive policies to allow client actions.
-- Since the Node.js backend handles sessions using Supabase JS SDK, using service role keys or
-- auth forwarding works. To keep database queries working regardless of backend key type,
-- we'll create simple RLS policies allowing all read/write for now or full permissions
-- for authenticated users / public reads.

-- Users policies
create policy "Allow read on users to everyone" on public.users for select using (true);
create policy "Allow update on users to owners/admins" on public.users for update using (
  auth.uid() = id
);

-- Categories policies
create policy "Allow public read on categories" on public.categories for select using (true);
create policy "Allow write on categories to admin" on public.categories for all using (true); -- Express will filter role

-- Products policies
create policy "Allow public read on products" on public.products for select using (true);
create policy "Allow write on products to admin" on public.products for all using (true); -- Express will filter role

-- Carts policies
create policy "Allow all on carts to owners" on public.carts for all using (true);

-- Cart items policies
create policy "Allow all on cart_items to owners" on public.cart_items for all using (true);

-- Orders policies
create policy "Allow all on orders to owners" on public.orders for all using (true);

-- Order items policies
create policy "Allow all on order_items to owners" on public.order_items for all using (true);
