const express = require('express');
const axios = require('axios');
const QRCode = require('qrcode');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// PENYIMPANAN SEMENTARA (MEMORY) - In-memory, akan reset jika redeploy/serverless cold start
const panelsStorage = {};

app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// --- ROUTES HALAMAN ---

app.get('/', (req, res) => {
  res.render('index', {
    storeName: process.env.STORE_NAME || 'IPIN MARKET'
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    service: process.env.STORE_NAME,
    timestamp: new Date().toISOString(),
    active_panels: Object.keys(panelsStorage).filter(id => panelsStorage[id].status === 'completed').length,
    pending_panels: Object.keys(panelsStorage).filter(id => panelsStorage[id].status === 'pending').length
  });
});

// --- API CONFIG ENDPOINT (Masked Keys) ---

app.get('/alifalfrlggwp7789', (req, res) => {
  // Hanya return data publik atau masked
  res.json({
    STORE_NAME: process.env.STORE_NAME || 'IPIN MARKET',
    WEBSITE_LOGO: process.env.WEBSITE_LOGO,
    CHANNEL_LINK: process.env.CHANNEL_LINK,
    BOT_GROUP_LINK: process.env.BOT_GROUP_LINK,
    STORE_GROUP_LINK: process.env.STORE_GROUP_LINK,
    CONTACT_ADMIN: process.env.CONTACT_ADMIN,
    PAKASIR_SLUG: process.env.PAKASIR_SLUG ? 'Set' : 'Not set', // Masked
    PAKASIR_API_KEY: 'Set', // Masked, jangan bocor
    PT_DOMAIN: process.env.PT_DOMAIN ? 'Set' : 'Not set',
    PT_API_KEY: 'Set', // Masked
    PT_NEST_ID: process.env.PT_NEST_ID,
    PT_EGG_ID: process.env.PT_EGG_ID,
    PT_LOCATION_ID: process.env.PT_LOCATION_ID,
    PRICES: {
      PANEL_1GB: parseInt(process.env.PANEL_1GB || 3000),
      PANEL_2GB: parseInt(process.env.PANEL_2GB || 5000),
      PANEL_3GB: parseInt(process.env.PANEL_3GB || 7000),
      PANEL_4GB: parseInt(process.env.PANEL_4GB || 9000),
      PANEL_5GB: parseInt(process.env.PANEL_5GB || 11000),
      PANEL_6GB: parseInt(process.env.PANEL_6GB || 13000),
      PANEL_7GB: parseInt(process.env.PANEL_7GB || 15000),
      PANEL_UNLIMITED: parseInt(process.env.PANEL_UNLIMITED || 25000),
      PANEL_PREMIUM: parseInt(process.env.PANEL_PREMIUM || 25000)
    }
  });
});

// --- API TRANSAKSI ---

app.post('/api/create-qris', async (req, res) => {
  try {
    const { order_id, amount, username, product_name, days, password } = req.body;

    if (!order_id || !amount) {
      return res.status(400).json({ 
        success: false,
        error: 'Order ID dan amount diperlukan' 
      });
    }

    const numericAmount = parseInt(amount);

    const payload = {
      project: process.env.PAKASIR_SLUG,
      order_id: order_id,
      amount: numericAmount,
      api_key: process.env.PAKASIR_API_KEY
    };

    const response = await axios.post(
      'https://app.pakasir.com/api/transactioncreate/qris',
      payload,
      { 
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 15000
      }
    );

    if (username && product_name) {
      panelsStorage[order_id] = {
        order_id,
        username,
        product_name,
        amount: numericAmount,
        status: 'pending',
        created_at: new Date().toISOString(),
        panel_data: null,
        payment_data: response.data.payment,
        days: days || 30, // Fix: Simpan durasi
        password: password || null // Fix: Simpan password jika ada
      };
    }

    let qrImage = '';
    if (response.data.payment?.payment_number) {
      try {
        qrImage = await QRCode.toDataURL(response.data.payment.payment_number, {
          width: 300,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#FFFFFF'
          }
        });
      } catch (qrError) {}
    }

    res.json({
      success: true,
      payment: response.data.payment,
      qr_image: qrImage,
      order_id: order_id
    });

  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.response?.data?.error || 'Gagal membuat QRIS'
    });
  }
});

app.get('/api/check-payment', async (req, res) => {
  try {
    const { order_id, amount } = req.query;

    if (!order_id || !amount) {
      return res.status(400).json({ 
        success: false,
        error: 'Parameter tidak lengkap' 
      });
    }

    const numericAmount = parseInt(amount);
    const orderData = panelsStorage[order_id];

    if (!orderData) {
      return res.status(404).json({
        success: false,
        error: 'Order tidak ditemukan'
      });
    }

    // Jika panel data sudah ada, return langsung
    if (orderData.status === 'completed' && orderData.panel_data) {
       return res.json({
        success: true,
        transaction: { status: 'completed' },
        panel_data: orderData.panel_data,
        order_status: 'completed'
      });
    }

    const url = `https://app.pakasir.com/api/transactiondetail?project=${process.env.PAKASIR_SLUG}&amount=${numericAmount}&order_id=${order_id}&api_key=${process.env.PAKASIR_API_KEY}`;

    const response = await axios.get(url, {
      headers: { 'Accept': 'application/json' },
      timeout: 10000
    });

    const transaction = response.data?.transaction;
    let panelData = null;

    if ((transaction?.status === 'completed' || transaction?.status === 'paid' || transaction?.status === 'settlement') && !orderData.panel_data) {
      try {
        panelData = await createRealPterodactylPanel(orderData);
        orderData.panel_data = panelData;
        orderData.status = 'completed';
        orderData.completed_at = new Date().toISOString();
        orderData.transaction = transaction;
      } catch (panelError) {
        orderData.status = 'completed'; // Payment success, panel failed
        orderData.completed_at = new Date().toISOString();
        orderData.transaction = transaction;
        orderData.panel_error = panelError.message;

        return res.json({
          success: true,
          transaction: transaction,
          panel_data: null,
          panel_error: panelError.message
        });
      }
    } else if (orderData.panel_data) {
      panelData = orderData.panel_data;
    }

    res.json({
      success: true,
      transaction: transaction,
      panel_data: panelData,
      order_status: orderData.status
    });

  } catch (error) {
    const orderData = panelsStorage[req.query.order_id];
    if (orderData?.status === 'completed') {
      return res.json({
        success: true,
        transaction: { status: 'completed' },
        panel_data: orderData.panel_data,
        order_status: 'completed'
      });
    }

    res.status(500).json({ 
      success: false,
      error: 'Gagal memeriksa status pembayaran'
    });
  }
});

// --- HELPER CREATE PANEL ---

async function createRealPterodactylPanel(orderData) {
  const { username, product_name, days = 30 } = orderData;
  const password = orderData.password || generatePassword();

  const PT_DOMAIN = process.env.PT_DOMAIN;
  const PT_API_KEY = process.env.PT_API_KEY;
  const PT_NEST_ID = process.env.PT_NEST_ID;
  const PT_EGG_ID = process.env.PT_EGG_ID;
  const PT_LOCATION_ID = process.env.PT_LOCATION_ID;

  // Use generic email
  const email = username + '@ipin.market';
  const name = username.charAt(0).toUpperCase() + username.slice(1) + ' Server';

  const specs = {
    'Panel 1GB RAM': { ram: '1500', disk: '3000', cpu: '100' },
    'Panel 2GB RAM': { ram: '3500', disk: '6000', cpu: '190' },
    'Panel 3GB RAM': { ram: '4000', disk: '7000', cpu: '250' },
    'Panel 4GB RAM': { ram: '5000', disk: '9000', cpu: '290' },
    'Panel 5GB RAM': { ram: '6000', disk: '13000', cpu: '330' },
    'Panel 6GB RAM': { ram: '7000', disk: '15000', cpu: '450' },
    'Panel 7GB RAM': { ram: '8000', disk: '17000', cpu: '500' },
    // Unlimited spec
    'Panel UNLIMITED': { ram: '0', disk: '0', cpu: '0' }
  };

  let specKey = product_name;
  // Robust matching logic
  const pName = product_name.toUpperCase();
  if (pName.includes('1GB')) specKey = 'Panel 1GB RAM';
  else if (pName.includes('2GB')) specKey = 'Panel 2GB RAM';
  else if (pName.includes('3GB')) specKey = 'Panel 3GB RAM';
  else if (pName.includes('4GB')) specKey = 'Panel 4GB RAM';
  else if (pName.includes('5GB')) specKey = 'Panel 5GB RAM';
  else if (pName.includes('6GB')) specKey = 'Panel 6GB RAM';
  else if (pName.includes('7GB')) specKey = 'Panel 7GB RAM';
  else if (pName.includes('UNLIMITED') || pName.includes('UNLI') || pName.includes('PREMIUM')) specKey = 'Panel UNLIMITED';
  
  // Default fallback if not matched
  const spec = specs[specKey] || specs['Panel 1GB RAM'];
  
  const ram = spec.ram;
  const disknya = spec.disk;
  const cpu = spec.cpu;

  const checkUserRes = await axios.get(
    `${PT_DOMAIN}/api/application/users?filter[username]=${username}`,
    {
      headers: {
        'Authorization': `Bearer ${PT_API_KEY}`,
        'Accept': 'application/json'
      },
      timeout: 10000
    }
  );

  if (checkUserRes.data.data && checkUserRes.data.data.length > 0) {
    const existingUser = checkUserRes.data.data[0].attributes;
    throw new Error(`Username ${existingUser.username} sudah terdaftar.`);
  }

  const userRes = await axios.post(
    `${PT_DOMAIN}/api/application/users`,
    {
      email: email,
      username: username,
      first_name: name,
      last_name: 'Server',
      language: 'en',
      password: password
    },
    {
      headers: {
        'Authorization': `Bearer ${PT_API_KEY}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      timeout: 15000
    }
  );

  if (userRes.data.errors) {
    throw new Error(`Gagal membuat user: ${JSON.stringify(userRes.data.errors[0])}`);
  }

  const user = userRes.data.attributes;
  const userId = user.id;

  const eggRes = await axios.get(
    `${PT_DOMAIN}/api/application/nests/${PT_NEST_ID}/eggs/${PT_EGG_ID}`,
    {
      headers: {
        'Authorization': `Bearer ${PT_API_KEY}`,
        'Accept': 'application/json'
      },
      timeout: 10000
    }
  );

  if (eggRes.data.errors) {
    throw new Error(`Gagal mengambil egg details: ${JSON.stringify(eggRes.data.errors[0])}`);
  }

  const startupCmd = eggRes.data.attributes?.startup || 'npm start';

  const serverPayload = {
    name: name,
    description: `Server dibuat pada ${new Date().toLocaleDateString('id-ID')}`,
    user: userId,
    egg: parseInt(PT_EGG_ID),
    docker_image: 'ghcr.io/parkervcp/yolks:nodejs_18',
    startup: startupCmd,
    environment: {
      INST: 'npm',
      USER_UPLOAD: '0',
      AUTO_UPDATE: '0',
      CMD_RUN: 'npm start'
    },
    limits: {
      memory: parseInt(ram),
      swap: 0,
      disk: parseInt(disknya),
      io: 500,
      cpu: parseInt(cpu)
    },
    feature_limits: {
      databases: 5,
      backups: 5,
      allocations: 5
    },
    deploy: {
      locations: [parseInt(PT_LOCATION_ID)],
      dedicated_ip: false,
      port_range: []
    }
  };

  const serverRes = await axios.post(
    `${PT_DOMAIN}/api/application/servers`,
    serverPayload,
    {
      headers: {
        'Authorization': `Bearer ${PT_API_KEY}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      timeout: 30000
    }
  );

  if (serverRes.data.errors) {
    throw new Error(`Gagal membuat server: ${JSON.stringify(serverRes.data.errors[0])}`);
  }

  const server = serverRes.data.attributes;

  const expiresAt = Date.now() + (days * 24 * 60 * 60 * 1000);
  const expiryDate = new Date(expiresAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });

  return {
    username: user.username,
    password: password,
    email: user.email,
    panel_url: PT_DOMAIN,
    server_id: server.id,
    server_name: server.name,
    created_at: new Date().toISOString(),
    expires_at: new Date(expiresAt).toISOString(),
    expiry_date: expiryDate,
    days: days,
    specs: {
      ram: ram === '0' ? 'Unlimited' : `${parseInt(ram) / 1000}GB`,
      disk: disknya === '0' ? 'Unlimited' : `${parseInt(disknya) / 1000}GB`,
      cpu: cpu === '0' ? 'Unlimited' : `${cpu}%`,
      ram_raw: ram,
      disk_raw: disknya,
      cpu_raw: cpu
    },
    raw_data: {
      user: user,
      server: server
    }
  };
}

function generatePassword() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let password = '';
  for (let i = 0; i < 8; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

// --- API MANUAL & ADMIN ---

app.post('/api/manual-check', async (req, res) => {
  try {
    const { order_id, amount } = req.body;

    if (!order_id || !amount) {
      return res.status(400).json({ 
        success: false,
        error: 'Order ID dan amount diperlukan' 
      });
    }

    const numericAmount = parseInt(amount);
    const orderData = panelsStorage[order_id];

    if (!orderData) {
      return res.status(404).json({
        success: false,
        error: 'Order tidak ditemukan'
      });
    }

    const url = `https://app.pakasir.com/api/transactiondetail?project=${process.env.PAKASIR_SLUG}&amount=${numericAmount}&order_id=${order_id}&api_key=${process.env.PAKASIR_API_KEY}`;

    const response = await axios.get(url, {
      headers: { 'Accept': 'application/json' },
      timeout: 10000
    });

    const transaction = response.data?.transaction;
    let panelData = null;

    if ((transaction?.status === 'completed' || transaction?.status === 'paid') && !orderData.panel_data) {
        try {
          panelData = await createRealPterodactylPanel(orderData);
          orderData.panel_data = panelData;
          orderData.status = 'completed';
          orderData.completed_at = new Date().toISOString();
          orderData.transaction = transaction;
        } catch (panelError) {
          orderData.status = 'completed';
          orderData.completed_at = new Date().toISOString();
          orderData.transaction = transaction;
          orderData.panel_error = panelError.message;
          return res.json({
            success: true,
            transaction: transaction,
            panel_data: null,
            panel_error: panelError.message
          });
        }
    } else {
        panelData = orderData.panel_data;
    }

    res.json({
      success: true,
      transaction: transaction,
      panel_data: panelData,
      order_status: orderData.status
    });

  } catch (error) {
    const orderData = panelsStorage[req.body.order_id];
    if (orderData?.status === 'completed') {
      return res.json({
        success: true,
        transaction: { status: 'completed' },
        panel_data: orderData.panel_data,
        order_status: 'completed'
      });
    }

    res.status(500).json({ 
      success: false,
      error: 'Gagal memeriksa pembayaran'
    });
  }
});

app.post('/api/force-create-panel', async (req, res) => {
  try {
    const { order_id, username, password, product_name, days } = req.body;

    if (!username || !product_name) {
      return res.status(400).json({ 
        success: false,
        error: 'Username dan product name diperlukan' 
      });
    }

    const orderData = panelsStorage[order_id] || {
      username,
      product_name,
      password: password || generatePassword(),
      days: days || 30
    };

    const panelData = await createRealPterodactylPanel(orderData);

    if (panelsStorage[order_id]) {
      panelsStorage[order_id].panel_data = panelData;
      panelsStorage[order_id].status = 'completed';
      panelsStorage[order_id].completed_at = new Date().toISOString();
    } else {
      panelsStorage[order_id] = {
        order_id,
        username,
        product_name,
        panel_data: panelData,
        status: 'completed',
        completed_at: new Date().toISOString()
      };
    }

    res.json({
      success: true,
      panel_data: panelData,
      message: 'Panel berhasil dibuat secara manual'
    });

  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: 'Gagal membuat panel: ' + error.message
    });
  }
});

app.post('/api/cancel-payment', (req, res) => {
  try {
    const { order_id } = req.body;

    if (!order_id) {
      return res.status(400).json({ 
        success: false,
        error: 'Order ID diperlukan' 
      });
    }

    if (panelsStorage[order_id]) {
      delete panelsStorage[order_id];
    }

    res.json({
      success: true,
      message: 'Transaksi dibatalkan',
      order_id: order_id
    });

  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: 'Gagal membatalkan'
    });
  }
});

app.get('/api/order/:order_id', (req, res) => {
  try {
    const { order_id } = req.params;
    const orderData = panelsStorage[order_id];

    if (!orderData) {
      return res.status(404).json({
        success: false,
        error: 'Order tidak ditemukan'
      });
    }

    res.json({
      success: true,
      order: {
        order_id: orderData.order_id,
        username: orderData.username,
        product_name: orderData.product_name,
        amount: orderData.amount,
        status: orderData.status,
        created_at: orderData.created_at,
        completed_at: orderData.completed_at,
        panel_data: orderData.panel_data,
        panel_error: orderData.panel_error
      }
    });

  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: 'Gagal mengambil data order'
    });
  }
});

app.get('/api/panels', (req, res) => {
  try {
    const activePanels = Object.values(panelsStorage)
      .filter(panel => panel.status === 'completed' && panel.panel_data)
      .map(panel => ({
        order_id: panel.order_id,
        username: panel.username,
        product_name: panel.product_name,
        created_at: panel.created_at,
        panel_data: panel.panel_data
      }));

    res.json({
      success: true,
      count: activePanels.length,
      panels: activePanels
    });

  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: 'Gagal mengambil data panel'
    });
  }
});

app.get('/api/debug', (req, res) => {
  const token = req.headers['x-admin-token'];
  if (token !== process.env.ADMIN_DEBUG_TOKEN) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  res.json({
    storage: panelsStorage,
    env: {
      PT_DOMAIN: process.env.PT_DOMAIN ? 'Set' : 'Not set',
      PT_API_KEY: process.env.PT_API_KEY ? 'Set' : 'Not set',
      PT_NEST_ID: process.env.PT_NEST_ID,
      PT_EGG_ID: process.env.PT_EGG_ID,
      PT_LOCATION_ID: process.env.PT_LOCATION_ID,
      PAKASIR_SLUG: process.env.PAKASIR_SLUG ? 'Set' : 'Not set'
    }
  });
});

// START SERVER (SERVERLESS FRIENDLY)
if (require.main === module) {
    app.listen(PORT, () => {
      console.log(`${process.env.STORE_NAME || 'IPIN MARKET'} running on port ${PORT}`);
      console.log(`http://localhost:${PORT}`);
    });
}

module.exports = app;
