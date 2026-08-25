const express = require('express');
const http = require('http');
const https = require('https');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');


const CERT_FILE = path.join(__dirname, 'cert.pem');
const KEY_FILE = path.join(__dirname, 'key.pem');

if (!fs.existsSync(CERT_FILE) || !fs.existsSync(KEY_FILE)) {
  console.error('ERROR: TLS certificate or key not found.');
  console.error('Generate them with:');
  console.error('  openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes -subj "/CN=bfs-local" -addext "subjectAltName = IP:192.168.1.3"');
  process.exit(1);
}

const cert = fs.readFileSync(CERT_FILE, 'utf8');
const key = fs.readFileSync(KEY_FILE, 'utf8');

const app = express();
const httpServer = http.createServer(app);
const httpsServer = https.createServer({ cert, key }, app);
const wss = new WebSocket.Server({ server: httpsServer });

const HTTP_PORT = 3000;
const HTTPS_PORT = 3443;
const HOST = '0.0.0.0';
const VERCELL_ORIGIN = 'https://bfs-one.vercel.app';

const MENU_FILE = path.join(__dirname, 'menu.json');
const ORDERS_FILE = path.join(__dirname, 'orders.json');

let menu = { categories: [] };
let orders = [];
let writeTimer = null;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// CORS for the Vercel billing app on /api/orders
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (req.path.startsWith('/api/') && origin === VERCELL_ORIGIN) {
    res.setHeader('Access-Control-Allow-Origin', VERCELL_ORIGIN);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
  }
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// HTTP-only routes (customers)
app.get('/api/menu', (req, res) => {
  res.json(menu);
});

app.post('/api/order', (req, res) => {
  const { table, items } = req.body;

  if (!table || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ success: false, error: 'Invalid order data' });
  }

  const total = items.reduce((sum, item) => sum + (item.price * (item.qty || 1)), 0);
  const order = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    table: String(table),
    items: items.map(item => ({
      name: item.name,
      price: item.price,
      qty: item.qty || 1
    })),
    total,
    status: 'pending',
    createdAt: new Date().toISOString()
  };

  orders.push(order);
  broadcast({ type: 'new_order', order });
  schedulePersistence();

  res.json({ success: true, order });
});

// Shared routes (both HTTP and HTTPS)
app.get('/api/orders', (req, res) => {
  res.json(orders);
});

// HTTPS-only routes (billing app)
app.post('/api/order/:id/status', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!['pending', 'preparing', 'served'].includes(status)) {
    return res.status(400).json({ success: false, error: 'Invalid status' });
  }

  const order = orders.find(o => o.id === id);
  if (!order) {
    return res.status(404).json({ success: false, error: 'Order not found' });
  }

  order.status = status;
  broadcast({ type: 'status_update', order });
  schedulePersistence();

  res.json({ success: true, order });
});

wss.on('connection', (ws) => {
  console.log('WebSocket client connected');
  ws.on('close', () => console.log('WebSocket client disconnected'));
});

function broadcast(data) {
  const payload = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

function schedulePersistence() {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(saveOrders, 500);
}

function saveOrders() {
  try {
    fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to persist orders:', err);
  }
}

function loadMenu() {
  try {
    const data = fs.readFileSync(MENU_FILE, 'utf8');
    menu = JSON.parse(data);
  } catch (err) {
    console.error('Failed to load menu.json:', err);
    menu = { categories: [] };
  }
}

function loadOrders() {
  try {
    if (fs.existsSync(ORDERS_FILE)) {
      const data = fs.readFileSync(ORDERS_FILE, 'utf8');
      orders = JSON.parse(data);
    }
  } catch (err) {
    console.error('Failed to load orders.json:', err);
    orders = [];
  }
}

loadMenu();
loadOrders();

httpServer.listen(HTTP_PORT, HOST, () => {
  console.log(`Customer ordering (HTTP):  http://${HOST}:${HTTP_PORT}/index.html?table=1`);
});

httpsServer.listen(HTTPS_PORT, HOST, () => {
  console.log(`Billing app connection (HTTPS): https://${HOST}:${HTTPS_PORT}`);
  console.log(`Serving menu with ${menu.categories.reduce((s, c) => s + c.items.length, 0)} items`);
  console.log(`WebSocket (WSS) ready for billing app connections`);
});
