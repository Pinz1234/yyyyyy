/**
 * IPIN MARKET BACKEND - SUPER PREMIUM EDITION
 * ===========================================
 * Core backend handling Express server, Pterodactyl integration,
 * Pakasir Payment Gateway, and Supabase Database synchronization.
 * * Features:
 * - Auto Seeding Products
 * - Admin Auth Middleware
 * - Dynamic Fulfillment Engine (Panel/SC/Sewa)
 * - Robust Error Handling
 * - Detailed Logging
 */

const express = require('express');
const axios = require('axios');
const QRCode = require('qrcode');
const path = require('path');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// --- 1. CONFIGURATION & SETUP ---

// In-Memory Storage (Legacy Backup - DO NOT REMOVE)
const panelsStorage = {};

// Multer Config for Memory Storage (Vercel Serverless Friendly)
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 } // Limit 50MB
});

// Initialize Supabase Client (Service Role for Admin Access)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Default Configuration Fallback
const DEFAULT_CONFIG = {
  store_name: process.env.STORE_NAME || "IPIN MARKET",
  contact_admin: "https://wa.me/6282261169349",
  channel_link: "https://whatsapp.com/channel/0029VbBKScNAInPfll7NHM0O",
  bot_group_link: "https://chat.whatsapp.com/LvA30WKiFgB0t5yFjFmWsz?mode=hqrc",
  store_group_link: "https://chat.whatsapp.com/BOdAG1wgHq4AHVftWUWyAj",
  telegram_link: "https://t.me/IPINSHOP",
  website_logo: "" // Can be empty, handled by frontend
};

// --- 2. MIDDLEWARE ---

app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Simple Logging Middleware
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - IP: ${req.ip}`);
    next();
});

// Admin Authentication Middleware
const adminAuth = (req, res, next) => {
    const token = req.headers['x-admin-token'] || req.query.token;
    
    // Strict comparison with ENV variable
    if (token && token === process.env.ADMIN_DEBUG_TOKEN) {
        next();
    } else {
        console.warn(`[AUTH FAILED] Attempt to access admin from ${req.ip}`);
        res.status(401).json({ 
            success: false, 
            error: "Unauthorized Access. Invalid Admin Token." 
        });
    }
};

// --- 3. HELPER FUNCTIONS ---

// Fetch Settings from DB with Fallback
async function getStoreSettings() {
  try {
      const { data } = await supabase.from('settings').select('*');
      const settings = { ...DEFAULT_CONFIG };
      if (data && data.length > 0) {
        data.forEach(item => { 
            if (item.value) settings[item.key] = item.value; 
        });
      }
      return settings;
  } catch (error) {
      console.error("[SETTINGS ERROR] Using default config:", error.message);
      return DEFAULT_CONFIG;
  }
}

// Generate Random Password for Panels
function generatePassword() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let password = '';
  for (let i = 0; i < 10; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

// Database Seeder (Run on specific triggers)
async function seedDatabase() {
  try {
    const { count, error } = await supabase.from('products').select('*', { count: 'exact', head: true });
    
    if (error) throw error;

    if (count === 0) {
      console.log("[SEED] Database is empty. Starting seeding process...");
      
      const productsToSeed = [
        // --- A) PANELS (Low Cost to Premium) ---
        { type: 'panel', name: 'Panel 1GB RAM', price: 1000, features: ['RAM 1GB', 'Disk 2GB', 'CPU 50%', 'Anti-DDoS'], meta: { ram: '1000', disk: '2000', cpu: '50' }, sort_order: 1 },
        { type: 'panel', name: 'Panel 2GB RAM', price: 2000, features: ['RAM 2GB', 'Disk 4GB', 'CPU 80%', 'Fast Storage'], meta: { ram: '2000', disk: '4000', cpu: '80' }, sort_order: 2 },
        { type: 'panel', name: 'Panel 3GB RAM', price: 3000, features: ['RAM 3GB', 'Disk 6GB', 'CPU 100%', '24/7 Uptime'], meta: { ram: '3000', disk: '6000', cpu: '100' }, sort_order: 3 },
        { type: 'panel', name: 'Panel 4GB RAM', price: 4000, features: ['RAM 4GB', 'Disk 8GB', 'CPU 130%', 'Backup Included'], meta: { ram: '4000', disk: '8000', cpu: '130' }, sort_order: 4 },
        { type: 'panel', name: 'Panel 5GB RAM', price: 5000, features: ['RAM 5GB', 'Disk 10GB', 'CPU 160%', 'Priority Support'], meta: { ram: '5000', disk: '10000', cpu: '160' }, sort_order: 5 },
        { type: 'panel', name: 'Panel 6GB RAM', price: 6000, features: ['RAM 6GB', 'Disk 12GB', 'CPU 180%', 'High Performance'], meta: { ram: '6000', disk: '12000', cpu: '180' }, sort_order: 6 },
        { type: 'panel', name: 'Panel 7GB RAM', price: 8000, features: ['RAM 7GB', 'Disk 14GB', 'CPU 200%', 'Streaming Ready'], meta: { ram: '7000', disk: '14000', cpu: '200' }, sort_order: 7 },
        { type: 'panel', name: 'Panel 10GB RAM', price: 9000, features: ['RAM 10GB', 'Disk 20GB', 'CPU 250%', 'Gaming Optimized'], meta: { ram: '10000', disk: '20000', cpu: '250' }, sort_order: 8 },
        { type: 'panel', name: 'Panel UNLIMITED', price: 12000, features: ['RAM Unlimited', 'Disk Unlimited', 'CPU Max', 'Dedicated Feel'], meta: { ram: '0', disk: '0', cpu: '0' }, badge: 'BEST SELLER', sort_order: 9 },

        // --- B) BOT RENTALS ---
        { type: 'sewa', name: 'Sewa Bot 1 Minggu', price: 10000, features: ['Aktif 7 Hari', 'On 24 Jam', 'Full Fitur V7', 'Anti Banned'], meta: { duration_days: 7 }, sort_order: 20 },
        { type: 'sewa', name: 'Sewa Bot 1 Bulan', price: 30000, features: ['Aktif 30 Hari', 'On 24 Jam', 'Prioritas Support', 'Custom Nama'], meta: { duration_days: 30 }, badge: 'POPULER', sort_order: 21 },

        // --- C) SCRIPTS ---
        { type: 'sc', name: 'SC IPIN AI NEW UPDATE', price: 55000, features: ['No Encrypt', 'Fitur AI Terbaru', 'Free Update Lifetime', 'Button Work'], meta: { file_path: '' }, badge: 'NEW', sort_order: 30 },
        { type: 'sc', name: 'SC Alice Assistant', price: 50000, features: ['AI Integrated', 'Clean Code', 'Lightweight', 'User Friendly'], meta: { file_path: '' }, sort_order: 31 },
        { type: 'sc', name: 'SC Auto Order Nokos', price: 50000, features: ['Auto Process', 'Support QRIS', 'Tested Work', 'Auto Withdrawal'], meta: { file_path: '' }, sort_order: 32 },
        { type: 'sc', name: 'SC Otax', price: 40000, features: ['Bug Otax', 'AS IS (No Test)', 'File Only', 'Resiko Sendiri'], meta: { file_path: '' }, badge: 'BUG', sort_order: 33 }
      ];

      const { error: insertError } = await supabase.from('products').insert(productsToSeed);
      if (insertError) throw insertError;
      
      console.log("[SEED] Successfully seeded products.");
    } else {
      console.log(`[SEED] Database already contains ${count} products. Skipping.`);
    }
  } catch (e) { 
    console.error("[SEED ERROR]", e.message); 
  }
}

// --- 4. PUBLIC ROUTES ---

// Render Homepage
app.get('/', async (req, res) => {
    // Attempt lazy seed on homepage load (non-blocking)
    seedDatabase().catch(console.error);
    
    // Render index
    res.render('index', { 
        storeName: process.env.STORE_NAME || "IPIN MARKET"
    });
});

// Render Admin Page (Logic handled via client-side Vue + Supabase Auth)
app.get('/admin', (req, res) => {
    res.render('admin');
});

// Configuration Endpoint (Used by frontend to fetch settings & prices)
app.get('/alifalfrlggwp7789', async (req, res) => {
  const settings = await getStoreSettings();
  
  // Fetch active products for price mapping
  const { data: products } = await supabase.from('products').select('*').eq('active', true);
  
  const prices = {};
  if (products) {
    products.forEach(p => {
      if(p.type === 'panel') {
         // Create mapping key compatible with old frontend logic
         let key = 'PANEL_CUSTOM';
         const n = p.name.toUpperCase();
         if(n.includes('1GB')) key = 'PANEL_1GB';
         else if(n.includes('2GB')) key = 'PANEL_2GB';
         else if(n.includes('3GB')) key = 'PANEL_3GB';
         else if(n.includes('4GB')) key = 'PANEL_4GB';
         else if(n.includes('5GB')) key = 'PANEL_5GB';
         else if(n.includes('6GB')) key = 'PANEL_6GB';
         else if(n.includes('7GB')) key = 'PANEL_7GB';
         else if(n.includes('10GB')) key = 'PANEL_10GB';
         else if(n.includes('UNLIMITED') || n.includes('UNLI')) key = 'PANEL_UNLIMITED';
         
         prices[key] = Number(p.price);
      }
    });
  }

  res.json({
    STORE_NAME: settings.store_name,
    WEBSITE_LOGO: settings.website_logo,
    CHANNEL_LINK: settings.channel_link,
    BOT_GROUP_LINK: settings.bot_group_link,
    STORE_GROUP_LINK: settings.store_group_link,
    CONTACT_ADMIN: settings.contact_admin,
    TELEGRAM: settings.telegram_link,
    // Mask sensitive keys, just indicate existence
    PAKASIR_SLUG: process.env.PAKASIR_SLUG ? 'Set' : 'Not set',
    PAKASIR_API_KEY: 'Set',
    PT_DOMAIN: process.env.PT_DOMAIN ? 'Set' : 'Not set',
    PT_API_KEY: 'Set',
    PT_NEST_ID: process.env.PT_NEST_ID,
    PT_EGG_ID: process.env.PT_EGG_ID,
    PT_LOCATION_ID: process.env.PT_LOCATION_ID,
    PRICES: prices
  });
});

// Products API (New dynamic endpoint)
app.get('/api/products', async (req, res) => {
  try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('active', true)
        .order('sort_order', { ascending: true });
        
      if(error) throw error;
      res.json({ success: true, data });
  } catch (error) {
      res.status(500).json({ success: false, error: error.message });
  }
});

// --- 5. TRANSACTION ROUTES (CORE LOGIC) ---

// Create Transaction (QRIS)
app.post('/api/create-qris', async (req, res) => {
  try {
    const { order_id, amount, username, product_name, product_id, days, password } = req.body;

    if (!order_id || !amount) {
      return res.status(400).json({ success: false, error: 'Data incomplete' });
    }

    // 1. Validate Product from DB (Security)
    let prodSnapshot = {};
    if (product_id) {
       const { data: p } = await supabase.from('products').select('*').eq('id', product_id).single();
       if (!p) return res.status(404).json({ success: false, error: 'Product not found' });
       
       // Verify Amount
       if (parseInt(p.price) !== parseInt(amount)) {
           return res.status(400).json({ success: false, error: 'Price mismatch detected.' });
       }
       prodSnapshot = p;
    } else {
        // Fallback for legacy requests (not recommended)
        const { data: p } = await supabase.from('products').select('*').ilike('name', product_name).maybeSingle();
        if (p) prodSnapshot = p;
    }

    const numericAmount = parseInt(amount);

    // 2. Call Pakasir API
    const payload = {
      project: process.env.PAKASIR_SLUG,
      order_id: order_id,
      amount: numericAmount,
      api_key: process.env.PAKASIR_API_KEY
    };

    const response = await axios.post(
      'https://app.pakasir.com/api/transactioncreate/qris',
      payload,
      { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
    );

    // 3. Save Order to Supabase
    const { error: dbError } = await supabase.from('orders').insert({
      id: order_id,
      product_id: prodSnapshot.id || null,
      product_snapshot: prodSnapshot,
      amount: numericAmount,
      customer_username: username,
      status: 'pending'
    });

    if (dbError) {
        console.error("DB Insert Error:", dbError);
        // We continue because Pakasir might have succeeded
    }

    // 4. Save to Memory (Legacy Backup)
    if (username) {
      panelsStorage[order_id] = {
        order_id,
        username,
        product_name: prodSnapshot.name || product_name,
        amount: numericAmount,
        status: 'pending',
        created_at: new Date().toISOString(),
        panel_data: null,
        payment_data: response.data.payment,
        days: days || 30,
        password: password || null
      };
    }

    // 5. Generate QR Code
    let qrImage = '';
    if (response.data.payment?.payment_number) {
      try {
        qrImage = await QRCode.toDataURL(response.data.payment.payment_number, {
          width: 300, margin: 2, color: { dark: '#000000', light: '#FFFFFF' }
        });
      } catch (qrError) { console.error("QR Error", qrError); }
    }

    res.json({
      success: true,
      payment: response.data.payment,
      qr_image: qrImage,
      order_id: order_id
    });

  } catch (error) {
    console.error("Create QRIS Error:", error.message);
    res.status(500).json({ 
      success: false,
      error: error.response?.data?.error || 'Gagal membuat QRIS'
    });
  }
});

// Check Payment Status & Fulfill Order
app.get('/api/check-payment', async (req, res) => {
  try {
    const { order_id, amount } = req.query;
    const numericAmount = parseInt(amount);

    // 1. Check Supabase Order Status
    const { data: order } = await supabase.from('orders').select('*, deliveries(*)').eq('id', order_id).single();
    
    // If order is already completed, return saved delivery
    if (order && (order.status === 'completed' || order.status === 'paid')) {
        if (order.deliveries && order.deliveries.length > 0) {
            return res.json({
                success: true,
                transaction: { status: 'completed' },
                // Map new delivery payload to legacy 'panel_data' for frontend compatibility
                panel_data: order.deliveries[0].payload,
                delivery: order.deliveries[0],
                order_status: 'completed'
            });
        }
    }

    // 2. Check Legacy Memory (Fallback)
    const legacyOrder = panelsStorage[order_id];
    if (legacyOrder && legacyOrder.status === 'completed' && legacyOrder.panel_data) {
       return res.json({
        success: true,
        transaction: { status: 'completed' },
        panel_data: legacyOrder.panel_data,
        order_status: 'completed'
      });
    }

    // 3. Verify with Pakasir
    const url = `https://app.pakasir.com/api/transactiondetail?project=${process.env.PAKASIR_SLUG}&amount=${numericAmount}&order_id=${order_id}&api_key=${process.env.PAKASIR_API_KEY}`;
    const response = await axios.get(url, { timeout: 10000 });
    const transaction = response.data?.transaction;

    // 4. Fulfillment Logic (If Paid and Not Completed)
    if ((transaction?.status === 'completed' || transaction?.status === 'paid' || transaction?.status === 'settlement') && (!order || order.status !== 'completed')) {
        
        let deliveryData = null;
        let deliveryType = '';
        const product = order ? order.product_snapshot : null;

        try {
            console.log(`[FULFILLMENT] Starting for Order ${order_id} Type: ${product?.type}`);

            // === FULFILLMENT: PANEL ===
            if (product && product.type === 'panel') {
                const pData = await createRealPterodactylPanel({
                    username: order.customer_username,
                    product_name: product.name,
                    product_meta: product.meta
                });
                deliveryData = pData;
                deliveryType = 'panel_credentials';
                
                // Sync Legacy
                if(legacyOrder) {
                    legacyOrder.panel_data = pData;
                    legacyOrder.status = 'completed';
                }
            } 
            // === FULFILLMENT: SCRIPT (SC) ===
            else if (product && product.type === 'sc') {
                const fileName = product.meta.file_path;
                let downloadUrl = '#';
                
                if (fileName) {
                    // Create signed URL valid for 24 hours
                    const { data: signed } = await supabase.storage.from('digital-products').createSignedUrl(fileName, 86400);
                    if (signed) downloadUrl = signed.signedUrl;
                }
                
                const settings = await getStoreSettings();
                deliveryData = {
                    download_url: downloadUrl,
                    file_name: fileName || 'File not found',
                    group_link: settings.store_group_link,
                    username: order.customer_username
                };
                deliveryType = 'download_link';
            }
            // === FULFILLMENT: SEWA BOT ===
            else if (product && product.type === 'sewa') {
                const settings = await getStoreSettings();
                const duration = product.meta.duration_days || 30;
                
                // Formatted WhatsApp Message
                const text = `Halo Admin, saya sudah bayar Order ID: ${order_id}.\nUsername: ${order.customer_username}.\nPaket: ${product.name} (${duration} Hari).\nMohon segera diproses.`;
                
                deliveryData = {
                    instructions: `Pembayaran Lunas. Silakan klik tombol di bawah untuk aktivasi bot (${duration} Hari) ke Admin.`,
                    wa_link: `${settings.contact_admin}?text=${encodeURIComponent(text)}`,
                    group_link: settings.bot_group_link
                };
                deliveryType = 'instructions';
            } 
            // === FALLBACK: UNKNOWN OR LEGACY ===
            else {
                if (legacyOrder) {
                    const pData = await createRealPterodactylPanel(legacyOrder);
                    deliveryData = pData;
                    deliveryType = 'panel_credentials';
                    legacyOrder.panel_data = pData;
                    legacyOrder.status = 'completed';
                }
            }

            // 5. Update Database State
            if (order) {
                // Mark as completed
                await supabase.from('orders').update({ 
                    status: 'completed', 
                    paid_at: new Date(), 
                    fulfilled_at: new Date() 
                }).eq('id', order_id);
                
                // Save Delivery
                await supabase.from('deliveries').insert({
                    order_id: order_id,
                    delivery_type: deliveryType,
                    payload: deliveryData
                });
            }

            return res.json({
                success: true,
                transaction: transaction,
                panel_data: deliveryData, // Legacy field
                delivery: { delivery_type: deliveryType, payload: deliveryData }, // New field
                order_status: 'completed'
            });

        } catch (err) {
            console.error("Fulfillment Error:", err);
            // Mark as paid but failed fulfillment
            if (order) await supabase.from('orders').update({ status: 'paid_failed', paid_at: new Date(), notes: err.message }).eq('id', order_id);
            if (legacyOrder) legacyOrder.panel_error = err.message;

            return res.json({ success: true, transaction: transaction, order_status: 'paid_failed', error: err.message });
        }
    }

    // If still pending
    res.json({
      success: true,
      transaction: transaction,
      panel_data: order?.deliveries?.[0]?.payload || panelsStorage[order_id]?.panel_data,
      order_status: order?.status || panelsStorage[order_id]?.status
    });

  } catch (error) {
    console.error("Check Payment Error:", error);
    res.status(500).json({ success: false, error: 'Gagal memeriksa status pembayaran' });
  }
});

app.post('/api/cancel-payment', async (req, res) => {
    try {
        const { order_id } = req.body;
        // Only allow cancel if pending
        await supabase.from('orders').update({ status: 'cancelled' }).eq('id', order_id).eq('status', 'pending');
        res.json({ success: true });
    } catch(e) {
        res.status(500).json({ success: false });
    }
});

// --- 6. ADMIN API ROUTES (PROTECTED) ---

// GET Products
app.get('/api/admin/products', adminAuth, async (req, res) => {
    const { data, error } = await supabase.from('products').select('*').order('sort_order');
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, data });
});

// ADD Product
app.post('/api/admin/products', adminAuth, async (req, res) => {
    const { id, ...data } = req.body;
    if (id) {
        // Update existing
        const { error } = await supabase.from('products').update(data).eq('id', id);
        if (error) return res.status(500).json({ error: error.message });
    } else {
        // Insert new
        const { error } = await supabase.from('products').insert(data);
        if (error) return res.status(500).json({ error: error.message });
    }
    res.json({ success: true });
});

// DELETE Product
app.delete('/api/admin/products/:id', adminAuth, async (req, res) => {
    const { error } = await supabase.from('products').delete().eq('id', req.params.id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

// GET Settings
app.get('/api/admin/settings', adminAuth, async (req, res) => {
    const { data, error } = await supabase.from('settings').select('*');
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, data });
});

// SAVE Settings
app.post('/api/admin/settings', adminAuth, async (req, res) => {
    const { settings } = req.body; // Expect array of {key, value}
    for (let s of settings) {
        await supabase.from('settings').upsert({ key: s.key, value: s.value });
    }
    res.json({ success: true });
});

// GET Orders
app.get('/api/admin/orders', adminAuth, async (req, res) => {
    const { data, error } = await supabase.from('orders')
        .select('*, product_snapshot, deliveries(*)')
        .order('created_at', { ascending: false })
        .limit(100);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, data });
});

// RETRY Fulfillment
app.post('/api/admin/orders/:id/retry', adminAuth, async (req, res) => {
    // Reset status to paid_failed or similar to allow re-check or implement direct retry logic here
    const { id } = req.params;
    // Simple retry: update status to 'paid' so check-payment endpoint can pick it up again
    const { error } = await supabase.from('orders').update({ status: 'paid', notes: 'Retry triggered by admin' }).eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

// UPLOAD File to Storage
app.post('/api/admin/upload', adminAuth, upload.single('file'), async (req, res) => {
    try {
        if(!req.file) return res.status(400).json({error: 'No file provided'});
        
        // Clean filename and add timestamp
        const cleanName = req.file.originalname.replace(/[^a-zA-Z0-9.]/g, '_');
        const fileName = `sc/${Date.now()}_${cleanName}`;
        
        const { data, error } = await supabase.storage
            .from('digital-products')
            .upload(fileName, req.file.buffer, {
                contentType: req.file.mimetype,
                upsert: true
            });
            
        if (error) throw error;
        
        res.json({ success: true, path: fileName });
    } catch(e) {
        console.error("Upload Error:", e);
        res.status(500).json({ error: e.message });
    }
});

// --- 7. PTERODACTYL INTEGRATION ---

async function createRealPterodactylPanel(orderData) {
  const { username, product_name, product_meta } = orderData;
  const password = generatePassword();

  const PT_DOMAIN = process.env.PT_DOMAIN;
  const PT_API_KEY = process.env.PT_API_KEY;
  const PT_NEST_ID = process.env.PT_NEST_ID || 5;
  const PT_EGG_ID = process.env.PT_EGG_ID || 15;
  const PT_LOCATION_ID = process.env.PT_LOCATION_ID || 1;

  const email = `${username}@ipin.market`;
  const name = username.charAt(0).toUpperCase() + username.slice(1) + ' Server';

  // Determine Specs
  let ram, disk, cpu;

  if (product_meta && product_meta.ram) {
      // Use DB Meta
      ram = product_meta.ram === 'UNLIMITED' || product_meta.ram === '0' ? 0 : parseInt(product_meta.ram) * 1024;
      disk = product_meta.disk === 'UNLIMITED' || product_meta.disk === '0' ? 0 : parseInt(product_meta.disk) * 1024;
      cpu = product_meta.cpu === 'MAX' || product_meta.cpu === '0' ? 0 : parseInt(product_meta.cpu);
  } else {
      // Fallback Legacy (Safe defaults)
      ram = 1024; disk = 2048; cpu = 100;
      if (product_name && product_name.includes('UNLIMITED')) { ram=0; disk=0; cpu=0; }
  }

  // 1. Check User Existence
  const checkUserRes = await axios.get(
    `${PT_DOMAIN}/api/application/users?filter[username]=${username}`,
    { headers: { 'Authorization': `Bearer ${PT_API_KEY}`, 'Accept': 'application/json' }, timeout: 10000 }
  );

  if (checkUserRes.data.data && checkUserRes.data.data.length > 0) {
    throw new Error(`Username ${username} sudah terdaftar.`);
  }

  // 2. Create User
  const userRes = await axios.post(
    `${PT_DOMAIN}/api/application/users`,
    { email, username, first_name: name, last_name: 'User', language: 'en', password },
    { headers: { 'Authorization': `Bearer ${PT_API_KEY}`, 'Content-Type': 'application/json' }, timeout: 15000 }
  );

  const user = userRes.data.attributes;

  // 3. Create Server
  const serverPayload = {
    name: name,
    user: user.id,
    egg: parseInt(PT_EGG_ID),
    docker_image: 'ghcr.io/parkervcp/yolks:nodejs_18',
    startup: 'npm start',
    environment: { INST: 'npm', USER_UPLOAD: '0', AUTO_UPDATE: '0', CMD_RUN: 'npm start' },
    limits: { memory: parseInt(ram), swap: 0, disk: parseInt(disk), io: 500, cpu: parseInt(cpu) },
    feature_limits: { databases: 5, backups: 5, allocations: 5 },
    deploy: { locations: [parseInt(PT_LOCATION_ID)], dedicated_ip: false, port_range: [] }
  };

  const serverRes = await axios.post(
    `${PT_DOMAIN}/api/application/servers`,
    serverPayload,
    { headers: { 'Authorization': `Bearer ${PT_API_KEY}`, 'Content-Type': 'application/json' }, timeout: 30000 }
  );

  return {
    username: user.username,
    password: password,
    panel_url: PT_DOMAIN,
    server_name: serverRes.data.attributes.name,
    expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('id-ID'),
    panel_data: { username: user.username, password, panel_url: PT_DOMAIN } // Compatibility
  };
}

// 8. Legacy Routes
app.get('/health', (req, res) => {
  res.json({ status: 'OK', service: process.env.STORE_NAME });
});

app.get('/api/debug', (req, res) => {
  const token = req.headers['x-admin-token'];
  if (token === process.env.ADMIN_DEBUG_TOKEN) {
      res.json({ storage: panelsStorage });
  } else {
      res.status(403).json({ error: 'Forbidden' });
  }
});

// START SERVER
if (require.main === module) {
    app.listen(PORT, () => {
      console.log(`${process.env.STORE_NAME || 'APP'} running on port ${PORT}`);
    });
}

module.exports = app;
