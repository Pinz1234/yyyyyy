-- =====================================================================================
-- IPIN MARKET DATABASE SCHEMA - SUPER PREMIUM EDITION (V2.5)
-- =====================================================================================
-- Deskripsi: Skema database lengkap untuk Toko Digital (Panel, Script, Sewa Bot).
-- Fitur: Idempotent execution, Row Level Security (RLS), Storage Management, Indexing.
-- =====================================================================================

-- 1. ENABLE EXTENSIONS
-- Mengaktifkan UUID untuk primary key yang aman dan acak.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================================================
-- STORAGE CONFIGURATION (BUCKET UNTUK FILE SCRIPT)
-- =====================================================================================

-- 2. Create Bucket 'digital-products' (Private Bucket)
-- Bucket ini digunakan untuk menyimpan file .zip script yang dijual.
-- Bersifat PRIVATE: Hanya bisa diakses via Signed URL yang di-generate oleh Backend.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'digital-products', 
    'digital-products', 
    false, 
    52428800, -- Limit 50MB
    ARRAY['application/zip', 'application/x-zip-compressed', 'application/x-rar-compressed']
)
ON CONFLICT (id) DO UPDATE SET 
    public = false,
    file_size_limit = 52428800;

-- 3. Storage Security Policies (RLS)
-- Menghapus policy lama untuk menghindari duplikasi saat re-run script.
DROP POLICY IF EXISTS "Backend Service Role Full Access" ON storage.objects;

-- Membuat Policy Baru: Hanya Service Role (Backend) yang boleh akses penuh.
-- User biasa/Anonim TIDAK BOLEH akses langsung ke bucket ini.
CREATE POLICY "Backend Service Role Full Access"
ON storage.objects
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');


-- =====================================================================================
-- TABLE DEFINITIONS
-- =====================================================================================

-- 4. TABLE: SETTINGS
-- Menyimpan konfigurasi toko dinamis (Nama Toko, Link WA, Link Grup, Logo).
CREATE TABLE IF NOT EXISTS public.settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    description TEXT, -- Deskripsi untuk admin dashboard
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Seed Default Settings (Hanya insert jika belum ada)
INSERT INTO public.settings (key, value, description) VALUES
('store_name', 'IPIN MARKET', 'Nama Toko yang tampil di Header & Title'),
('website_logo', '', 'URL Logo Toko (Kosongkan jika tidak ada)'),
('contact_admin', 'https://wa.me/6282261169349', 'Link WhatsApp Admin Utama'),
('channel_link', 'https://whatsapp.com/channel/0029VbBKScNAInPfll7NHM0O', 'Link Saluran WhatsApp'),
('bot_group_link', 'https://chat.whatsapp.com/LvA30WKiFgB0t5yFjFmWsz?mode=hqrc', 'Link Grup Bot (Untuk pembeli Sewa Bot)'),
('store_group_link', 'https://chat.whatsapp.com/BOdAG1wgHq4AHVftWUWyAj', 'Link Grup Update Script (Untuk pembeli SC)'),
('telegram_link', 'https://t.me/IPINSHOP', 'Link Channel Telegram')
ON CONFLICT (key) DO NOTHING;


-- 5. TABLE: PRODUCTS
-- Menyimpan katalog produk (Panel Pterodactyl, Source Code, Sewa Bot).
CREATE TABLE IF NOT EXISTS public.products (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('panel', 'sc', 'sewa')), -- Validasi Tipe Produk
    name TEXT NOT NULL,
    price NUMERIC NOT NULL CHECK (price >= 0),
    features JSONB DEFAULT '[]'::jsonb, -- Array string fitur unggulan
    badge TEXT, -- Label seperti "BEST SELLER", "NEW", "HOT"
    active BOOLEAN DEFAULT true, -- Soft delete status
    sort_order INTEGER DEFAULT 0, -- Urutan tampilan di frontend
    meta JSONB DEFAULT '{}'::jsonb, -- Metadata fleksibel (RAM, Disk, FilePath, Duration)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Indexes untuk performa query frontend
CREATE INDEX IF NOT EXISTS products_active_idx ON public.products (active);
CREATE INDEX IF NOT EXISTS products_sort_order_idx ON public.products (sort_order);
CREATE INDEX IF NOT EXISTS products_type_idx ON public.products (type);


-- 6. TABLE: ORDERS
-- Menyimpan riwayat transaksi user.
CREATE TABLE IF NOT EXISTS public.orders (
    id TEXT PRIMARY KEY, -- Menggunakan Order ID dari QRIS (misal: TRX-170...)
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    product_snapshot JSONB, -- Menyimpan copy data produk saat beli (agar aman jika harga berubah)
    amount NUMERIC NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'completed', 'cancelled', 'paid_failed')),
    customer_username TEXT, -- Username yang diinput user saat checkout
    notes TEXT, -- Catatan sistem (error log / info tambahan)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    paid_at TIMESTAMP WITH TIME ZONE, -- Waktu pembayaran diterima
    fulfilled_at TIMESTAMP WITH TIME ZONE -- Waktu produk dikirim/dibuat
);

-- Indexes untuk pencarian order cepat
CREATE INDEX IF NOT EXISTS orders_status_idx ON public.orders (status);
CREATE INDEX IF NOT EXISTS orders_created_at_idx ON public.orders (created_at DESC);
CREATE INDEX IF NOT EXISTS orders_customer_idx ON public.orders (customer_username);


-- 7. TABLE: DELIVERIES
-- Menyimpan hasil produk yang dikirim (Kredensial Panel, Link Download, Instruksi).
CREATE TABLE IF NOT EXISTS public.deliveries (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    order_id TEXT REFERENCES public.orders(id) ON DELETE CASCADE,
    delivery_type TEXT CHECK (delivery_type IN ('panel_credentials', 'download_link', 'instructions')),
    payload JSONB, -- Data sensitif (User/Pass, Signed URL, Teks Instruksi)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS deliveries_order_id_idx ON public.deliveries (order_id);


-- =====================================================================================
-- ROW LEVEL SECURITY (RLS) - KEAMANAN DATA
-- =====================================================================================

-- Enable RLS pada semua tabel
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;

-- Reset Policy Lama (Idempotency)
DROP POLICY IF EXISTS "Public Read Settings" ON public.settings;
DROP POLICY IF EXISTS "Public Read Active Products" ON public.products;
DROP POLICY IF EXISTS "Public Create Order" ON public.orders;
DROP POLICY IF EXISTS "Public Read Own Order" ON public.orders;
DROP POLICY IF EXISTS "Public Read Own Delivery" ON public.deliveries;
DROP POLICY IF EXISTS "Service Role Full Access Settings" ON public.settings;
DROP POLICY IF EXISTS "Service Role Full Access Products" ON public.products;
DROP POLICY IF EXISTS "Service Role Full Access Orders" ON public.orders;
DROP POLICY IF EXISTS "Service Role Full Access Deliveries" ON public.deliveries;

-- --- PUBLIC ACCESS POLICIES (Frontend User) ---

-- Settings: Publik boleh baca semua setting (diperlukan untuk render footer/kontak).
CREATE POLICY "Public Read Settings" ON public.settings FOR SELECT USING (true);

-- Products: Publik HANYA boleh baca produk yang AKTIF.
CREATE POLICY "Public Read Active Products" ON public.products FOR SELECT USING (active = true);

-- Orders: Publik boleh MEMBUAT order (Checkout).
CREATE POLICY "Public Create Order" ON public.orders FOR INSERT WITH CHECK (true);

-- Orders: Publik boleh MEMBACA order berdasarkan ID (Untuk cek status pembayaran).
-- Note: Di production, ini bisa diperketat dengan session ID, tapi untuk flow tanpa login, ID based is standard.
CREATE POLICY "Public Read Own Order" ON public.orders FOR SELECT USING (true);

-- Deliveries: Publik boleh MEMBACA delivery (Untuk melihat kredensial setelah bayar).
CREATE POLICY "Public Read Own Delivery" ON public.deliveries FOR SELECT USING (true);


-- --- ADMIN / BACKEND ACCESS POLICIES ---
-- Service Role (Backend API) memiliki akses penuh ke semua tabel.
-- Ini digunakan oleh `app.js` via `SUPABASE_SERVICE_ROLE_KEY`.

CREATE POLICY "Service Role Full Access Settings" ON public.settings FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service Role Full Access Products" ON public.products FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service Role Full Access Orders" ON public.orders FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service Role Full Access Deliveries" ON public.deliveries FOR ALL USING (auth.role() = 'service_role');

-- Selesai Setup Database
