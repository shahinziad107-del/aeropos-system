const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const os = require('os');
const fs = require('fs');

const admin = require('firebase-admin');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

// Initialize Firebase Cloud connection safely
let db = null;
let useFirebase = false;

try {
  const serviceAccount = require('./firebase-config.json');
  if (serviceAccount && serviceAccount.project_id !== 'YOUR_PROJECT_ID') {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    db = admin.firestore();
    useFirebase = true;
    console.log('[Firebase] Successfully connected to Firestore Cloud Database!');
  } else {
    console.log('[Firebase] Placeholder project ID detected. Running in Local Memory Mode.');
  }
} catch (e) {
  console.log('[Firebase] Configuration file not found or invalid. Running in Local Memory Mode.');
}

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Explicit route for mobile view
app.get('/mobile', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'mobile.html'));
});

// JSON parser for API if needed
app.use(express.json());

// Default/Local Persistent File Database Fallback
const DATA_DIR = path.join(__dirname, 'data');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');
const SALES_FILE = path.join(DATA_DIR, 'sales.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR);
}

const defaultProducts = [
  // Category: Protectors (سكرينات)
  { id: 'p1', name: 'Privacy Glass Protector (iPhone 15)', category: 'Protectors', retailPrice: 12.00, wholesalePrice: 4.50, stock: 150, barcode: '1901901001', image: '' },
  { id: 'p2', name: 'Ceramic Matte Protector (Samsung S24)', category: 'Protectors', retailPrice: 10.00, wholesalePrice: 3.50, stock: 200, barcode: '1901901002', image: '' },
  { id: 'p3', name: 'UV Tempered Glass (OnePlus 12)', category: 'Protectors', retailPrice: 20.00, wholesalePrice: 8.00, stock: 80, barcode: '1901901003', image: '' },
  { id: 'p4', name: 'Privacy Glass Protector (iPhone 14)', category: 'Protectors', retailPrice: 11.00, wholesalePrice: 4.00, stock: 120, barcode: '1901901004', image: '' },
  
  // Category: Screens (شاشات)
  { id: 's1', name: 'OLED Display Assembly (iPhone 13 Pro)', category: 'Screens', retailPrice: 180.00, wholesalePrice: 110.00, stock: 15, barcode: '2802802001', image: '' },
  { id: 's2', name: 'AMOLED Screen Panel (Samsung S23 Ultra)', category: 'Screens', retailPrice: 250.00, wholesalePrice: 175.00, stock: 8, barcode: '2802802002', image: '' },
  { id: 's3', name: 'IPS LCD Screen Panel (Redmi Note 12)', category: 'Screens', retailPrice: 65.00, wholesalePrice: 38.00, stock: 25, barcode: '2802802003', image: '' },
  
  // Category: Cases (جرابات)
  { id: 'c1', name: 'MagSafe Clear Case (iPhone 15 Pro)', category: 'Cases', retailPrice: 25.00, wholesalePrice: 9.00, stock: 90, barcode: '3703703001', image: '' },
  { id: 'c2', name: 'Spigen Tough Armor (Samsung S24)', category: 'Cases', retailPrice: 30.00, wholesalePrice: 14.00, stock: 50, barcode: '3703703002', image: '' },
  { id: 'c3', name: 'Silicone Soft Case (Universal)', category: 'Cases', retailPrice: 12.00, wholesalePrice: 3.00, stock: 300, barcode: '3703703003', image: '' },

  // Category: Chargers & Cables (شواحن و كابلات)
  { id: 'ch1', name: 'PD 20W USB-C Fast Charger Block', category: 'Cables', retailPrice: 18.00, wholesalePrice: 6.50, stock: 110, barcode: '4604604001', image: '' },
  { id: 'ch2', name: 'PD 45W Dual Port Charger Block', category: 'Cables', retailPrice: 35.00, wholesalePrice: 16.00, stock: 65, barcode: '4604604002', image: '' },
  { id: 'ch3', name: 'Braided USB-C to Lightning Cable 2m', category: 'Cables', retailPrice: 15.00, wholesalePrice: 4.20, stock: 180, barcode: '4604604003', image: '' },
  { id: 'ch4', name: 'Super Fast USB-C to USB-C Cable 100W', category: 'Cables', retailPrice: 14.00, wholesalePrice: 3.80, stock: 220, barcode: '4604604004', image: '' }
];

let products = [];
let salesLogs = [];
let activeCart = {
  items: [],
  mode: 'Retail' // 'Retail' or 'Wholesale'
};

// Load products from JSON
if (fs.existsSync(PRODUCTS_FILE)) {
  try {
    products = JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf8'));
  } catch (err) {
    console.error('Failed to parse local products.json, fallback to defaults:', err);
    products = [...defaultProducts];
  }
} else {
  products = [...defaultProducts];
  fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(products, null, 2));
}

// Load sales logs from JSON
if (fs.existsSync(SALES_FILE)) {
  try {
    salesLogs = JSON.parse(fs.readFileSync(SALES_FILE, 'utf8'));
  } catch (err) {
    console.error('Failed to parse local sales.json, fallback to empty:', err);
    salesLogs = [];
  }
} else {
  salesLogs = [];
  fs.writeFileSync(SALES_FILE, JSON.stringify(salesLogs, null, 2));
}

// Helpers to sync memory status to local disk
function saveProductsLocal() {
  try {
    fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(products, null, 2));
  } catch (err) {
    console.error('Failed to save products locally:', err);
  }
}

function saveSalesLocal() {
  try {
    fs.writeFileSync(SALES_FILE, JSON.stringify(salesLogs, null, 2));
  } catch (err) {
    console.error('Failed to save sales logs locally:', err);
  }
}

// Database Cloud Load/Seed helper
function initDatabase() {
  if (!useFirebase) return;

  try {
    // 1. Setup real-time listener for products collection
    db.collection('products').onSnapshot((snapshot) => {
      if (snapshot.empty) {
        console.log('[Firebase] Cloud products collection is empty. Seeding with defaults...');
        // Seed once if database is empty
        const defaultProductsToSeed = [
          { id: 'p1', name: 'Privacy Glass Protector (iPhone 15)', category: 'Protectors', retailPrice: 12.00, wholesalePrice: 4.50, stock: 150, barcode: '1901901001', image: '' },
          { id: 'p2', name: 'Ceramic Matte Protector (Samsung S24)', category: 'Protectors', retailPrice: 10.00, wholesalePrice: 3.50, stock: 200, barcode: '1901901002', image: '' },
          { id: 'p3', name: 'UV Tempered Glass (OnePlus 12)', category: 'Protectors', retailPrice: 20.00, wholesalePrice: 8.00, stock: 80, barcode: '1901901003', image: '' },
          { id: 'p4', name: 'Privacy Glass Protector (iPhone 14)', category: 'Protectors', retailPrice: 11.00, wholesalePrice: 4.00, stock: 120, barcode: '1901901004', image: '' },
          { id: 's1', name: 'OLED Display Assembly (iPhone 13 Pro)', category: 'Screens', retailPrice: 180.00, wholesalePrice: 110.00, stock: 15, barcode: '2802802001', image: '' },
          { id: 's2', name: 'AMOLED Screen Panel (Samsung S23 Ultra)', category: 'Screens', retailPrice: 250.00, wholesalePrice: 175.00, stock: 8, barcode: '2802802002', image: '' },
          { id: 's3', name: 'IPS LCD Screen Panel (Redmi Note 12)', category: 'Screens', retailPrice: 65.00, wholesalePrice: 38.00, stock: 25, barcode: '2802802003', image: '' },
          { id: 'c1', name: 'MagSafe Clear Case (iPhone 15 Pro)', category: 'Cases', retailPrice: 25.00, wholesalePrice: 9.00, stock: 90, barcode: '3703703001', image: '' },
          { id: 'c2', name: 'Spigen Tough Armor (Samsung S24)', category: 'Cases', retailPrice: 30.00, wholesalePrice: 14.00, stock: 50, barcode: '3703703002', image: '' },
          { id: 'c3', name: 'Silicone Soft Case (Universal)', category: 'Cases', retailPrice: 12.00, wholesalePrice: 3.00, stock: 300, barcode: '3703703003', image: '' },
          { id: 'ch1', name: 'PD 20W USB-C Fast Charger Block', category: 'Cables', retailPrice: 18.00, wholesalePrice: 6.50, stock: 110, barcode: '4604604001', image: '' },
          { id: 'ch2', name: 'PD 45W Dual Port Charger Block', category: 'Cables', retailPrice: 35.00, wholesalePrice: 16.00, stock: 65, barcode: '4604604002', image: '' },
          { id: 'ch3', name: 'Braided USB-C to Lightning Cable 2m', category: 'Cables', retailPrice: 15.00, wholesalePrice: 4.20, stock: 180, barcode: '4604604003', image: '' },
          { id: 'ch4', name: 'Super Fast USB-C to USB-C Cable 100W', category: 'Cables', retailPrice: 14.00, wholesalePrice: 3.80, stock: 220, barcode: '4604604004', image: '' }
        ];
        defaultProductsToSeed.forEach(async prod => {
          await db.collection('products').doc(prod.id).set(prod);
        });
      } else {
        const cloudProducts = [];
        snapshot.forEach(doc => {
          cloudProducts.push(doc.data());
        });
        products = cloudProducts;
        io.emit('products_updated', products);
        saveProductsLocal();
      }
    }, err => console.error('[Firebase] Products listener error:', err));

    // 2. Setup real-time listener for sales history collection
    db.collection('sales').orderBy('timestamp', 'asc').onSnapshot((snapshot) => {
      const cloudSales = [];
      snapshot.forEach(doc => {
        cloudSales.push(doc.data());
      });
      salesLogs = cloudSales;
      io.emit('sale_logged', {
        sale: cloudSales[cloudSales.length - 1],
        products: products,
        salesLogs: salesLogs
      });
      saveSalesLocal();
    }, err => console.error('[Firebase] Sales listener error:', err));

    // 3. Setup real-time listener for remote barcode scans (Firestore scans collection)
    db.collection('scans').onSnapshot((snapshot) => {
      snapshot.docChanges().forEach(change => {
        if (change.type === 'added') {
          const scanData = change.doc.data();
          const barcode = scanData.barcode;
          console.log(`[Firebase Cloud Scan] Received remote barcode: ${barcode}`);
          
          // Find matching product
          const product = products.find(p => p.barcode === barcode);
          if (product) {
            io.emit('add_to_cart_from_scanner', product);
            console.log(`[Firebase Cloud Scan] Sent add_to_cart_from_scanner event to register for: ${product.name}`);
          } else {
            console.log(`[Firebase Cloud Scan] Warning: barcode ${barcode} not found in current catalog.`);
          }
          
          // Instantly delete document to keep firestore space clean
          change.doc.ref.delete().catch(err => console.error('[Firebase] Scan delete error:', err));
        }
      });
    }, err => console.error('[Firebase] Scans listener error:', err));

  } catch (err) {
    console.error('[Firebase] Error initializing database listeners:', err);
  }
}

initDatabase();

// Detect local network IP address
function getLocalIpAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const interfaceName in interfaces) {
    for (const iface of interfaces[interfaceName]) {
      // Check for IPv4 (supports string 'IPv4' or number 4) and make sure it's not a loopback address
      const isIpv4 = iface.family === 'IPv4' || iface.family === 4 || String(iface.family).includes('4');
      if (isIpv4 && !iface.internal) {
        addresses.push({
          name: interfaceName,
          address: iface.address
        });
      }
    }
  }
  return addresses;
}

const networkAddresses = getLocalIpAddresses();
// Select primary IP (prioritize Wi-Fi or Ethernet)
let primaryIp = '127.0.0.1';
const wifiOrEthernet = networkAddresses.find(addr => 
  addr.name.toLowerCase().includes('wi-fi') || 
  addr.name.toLowerCase().includes('wireless') || 
  addr.name.toLowerCase().includes('ethernet') || 
  addr.name.toLowerCase().includes('lan')
);
if (wifiOrEthernet) {
  primaryIp = wifiOrEthernet.address;
} else if (networkAddresses.length > 0) {
  primaryIp = networkAddresses[0].address;
}

console.log('Detected Network IPs:', networkAddresses);
console.log('Primary Connection IP:', primaryIp);

// API endpoint to retrieve system status
app.get('/api/status', (req, res) => {
  getWifiStatus((status) => {
    res.json({
      ip: primaryIp,
      port: PORT,
      wifiConnected: status.connected,
      wifiSsid: status.ssid || '',
      pingMs: Math.floor(Math.random() * 8) + 1, // Simulated ping
      productsCount: products.length,
      salesCount: salesLogs.length
    });
  });
});

// API endpoint to get products
app.get('/api/products', (req, res) => {
  res.json(products);
});

// Wi-Fi Management Logic
const { execFile } = require('child_process');

let mockWifiConnectedSSID = 'MobileShop_Main_5G';
let mockWifiNetworks = [
  { ssid: 'AeroPOS_WiFi_Secure', signal: 95, security: 'WPA2', active: 'no' },
  { ssid: 'MobileShop_Main_5G', signal: 80, security: 'WPA2 WPA3', active: 'yes' },
  { ssid: 'Customer_Free_WiFi', signal: 65, security: '--', active: 'no' },
  { ssid: 'Vodafone_Router_2.4G', signal: 45, security: 'WPA', active: 'no' }
];

function isLinux() {
  return process.platform === 'linux';
}

function getWifiStatus(callback) {
  if (!isLinux()) {
    if (mockWifiConnectedSSID) {
      return callback({
        connected: true,
        ssid: mockWifiConnectedSSID,
        ip: primaryIp,
        signal: 80,
        security: 'WPA2 WPA3'
      });
    } else {
      return callback({
        connected: false,
        ssid: '',
        ip: '',
        signal: 0,
        security: ''
      });
    }
  }

  // On Linux: Check active wifi device and SSID
  execFile('nmcli', ['-t', '-f', 'DEVICE,TYPE,STATE,CONNECTION', 'device'], (err, stdout, stderr) => {
    if (err) {
      return callback({ connected: false, ssid: '', error: 'nmcli command failed' });
    }
    
    const lines = stdout.split('\n');
    let wifiDevice = null;
    let wifiState = '';
    let connectedSsid = '';
    
    for (const line of lines) {
      const parts = line.split(':');
      if (parts[1] === 'wifi') {
        wifiDevice = parts[0];
        wifiState = parts[2];
        connectedSsid = parts[3] || '';
        break;
      }
    }
    
    if (wifiState === 'connected') {
      let ip = '127.0.0.1';
      const interfaces = os.networkInterfaces();
      if (wifiDevice && interfaces[wifiDevice]) {
        const addrObj = interfaces[wifiDevice].find(addr => addr.family === 'IPv4' || addr.family === 4 || String(addr.family).includes('4'));
        if (addrObj) ip = addrObj.address;
      }
      
      return callback({
        connected: true,
        ssid: connectedSsid,
        ip: ip,
        interface: wifiDevice
      });
    } else {
      return callback({
        connected: false,
        ssid: '',
        ip: '',
        interface: wifiDevice || ''
      });
    }
  });
}

function getWifiList(callback) {
  if (!isLinux()) {
    mockWifiNetworks.forEach(net => {
      net.active = (net.ssid === mockWifiConnectedSSID) ? 'yes' : 'no';
    });
    return callback(null, mockWifiNetworks);
  }

  execFile('nmcli', ['device', 'wifi', 'rescan'], () => {
    execFile('nmcli', ['--terse', '--separator', '|', '--fields', 'SSID,SIGNAL,SECURITY,ACTIVE', 'device', 'wifi', 'list'], (err, stdout, stderr) => {
      if (err) {
        return callback(err);
      }
      
      const lines = stdout.split('\n');
      const networksMap = {};
      
      for (const line of lines) {
        if (!line.trim()) continue;
        const parts = line.split('|');
        if (parts.length < 4) continue;
        
        const ssid = parts[0];
        if (!ssid) continue;
        
        const signal = parseInt(parts[1]) || 0;
        const security = parts[2] === '--' ? 'Open' : parts[2];
        const active = parts[3] === 'yes' ? 'yes' : 'no';
        
        if (!networksMap[ssid] || networksMap[ssid].signal < signal) {
          networksMap[ssid] = { ssid, signal, security, active };
        }
      }
      
      const list = Object.values(networksMap).sort((a, b) => b.signal - a.signal);
      callback(null, list);
    });
  });
}

function connectWifi(ssid, password, callback) {
  if (!isLinux()) {
    setTimeout(() => {
      mockWifiConnectedSSID = ssid;
      callback(null, { success: true, ssid: ssid });
    }, 2000);
    return;
  }

  const args = ['device', 'wifi', 'connect', ssid];
  if (password && password.trim() !== '') {
    args.push('password', password);
  }

  execFile('nmcli', args, (err, stdout, stderr) => {
    if (err) {
      return callback(err, { success: false, message: stderr || stdout || err.message });
    }
    callback(null, { success: true, message: stdout });
  });
}

function disconnectWifi(callback) {
  if (!isLinux()) {
    mockWifiConnectedSSID = '';
    return callback(null, { success: true });
  }

  execFile('nmcli', ['-t', '-f', 'DEVICE,TYPE', 'device'], (err, stdout, stderr) => {
    if (err) {
      return callback(err);
    }
    
    const lines = stdout.split('\n');
    let wifiDevice = null;
    for (const line of lines) {
      const parts = line.split(':');
      if (parts[1] === 'wifi') {
        wifiDevice = parts[0];
        break;
      }
    }
    
    if (!wifiDevice) {
      return callback(new Error('No wireless interface found'));
    }

    execFile('nmcli', ['device', 'disconnect', wifiDevice], (discErr, discStdout, discStderr) => {
      if (discErr) {
        return callback(discErr, { success: false, message: discStderr || discStdout });
      }
      callback(null, { success: true, message: discStdout });
    });
  });
}

// Socket.io Real-time communications
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  // Send initial connection details
  socket.emit('init_connection', {
    ip: primaryIp,
    port: PORT,
    activeCart: activeCart,
    products: products,
    salesLogs: salesLogs,
    networkAddresses: networkAddresses,
    useFirebase: useFirebase
  });

  // Handle active cart state changes from Desktop POS
  socket.on('update_cart', (updatedCart) => {
    activeCart = updatedCart;
    // Broadcast updated cart to all other clients (e.g. mobile companion)
    socket.broadcast.emit('cart_changed', activeCart);
    if (useFirebase) {
      db.collection('carts').doc('active').set(activeCart)
        .catch(err => console.error('[Firebase] Failed to write active cart to Firestore:', err));
    }
  });

  // Handle remote barcode scan from Mobile Companion
  socket.on('remote_scan', (barcode) => {
    console.log(`Remote scanned barcode: ${barcode}`);
    // Find product matching barcode
    const product = products.find(p => p.barcode === barcode);
    if (product) {
      // Send message to desktop to add item to register
      io.emit('add_to_cart_from_scanner', product);
      socket.emit('scan_result', { success: true, name: product.name });
    } else {
      socket.emit('scan_result', { success: false, message: 'Product not found' });
    }
  });

  // Handle manual product add from mobile companion admin view
  socket.on('remote_add_item', (productId) => {
    const product = products.find(p => p.id === productId);
    if (product) {
      io.emit('add_to_cart_from_scanner', product);
    }
  });

  // Handle remote product creation from Mobile Companion
  socket.on('remote_create_product', async (productData) => {
    console.log(`Remote product creation request for: ${productData.name}`);
    
    // Check if barcode already exists
    const existing = products.find(p => p.barcode === productData.barcode);
    if (existing) {
      socket.emit('product_create_result', { success: false, message: 'Barcode already exists' });
      return;
    }
    
    const id = 'prod-' + Date.now();
    const newProduct = {
      id: id,
      name: productData.name,
      category: productData.category,
      retailPrice: parseFloat(productData.retailPrice) || 0.0,
      wholesalePrice: parseFloat(productData.wholesalePrice) || 0.0,
      stock: parseInt(productData.stock) || 0,
      barcode: productData.barcode,
      image: productData.image || ''
    };
    
    products.push(newProduct);
    saveProductsLocal();
    
    if (useFirebase) {
      try {
        await db.collection('products').doc(newProduct.id).set(newProduct);
        console.log(`[Firebase] Product ${newProduct.name} successfully created in Firestore.`);
      } catch (err) {
        console.error('[Firebase] Failed to write product to Firestore:', err);
      }
    }
    
    // Broadcast updated products list to all clients (including cashier & mobile)
    io.emit('products_updated', products);
    socket.emit('product_create_result', { success: true, name: newProduct.name });
  });

  // Handle cart clearing from mobile or desktop
  socket.on('clear_cart_request', () => {
    activeCart = { items: [], mode: activeCart.mode };
    io.emit('cart_changed', activeCart);
  });

  // Handle manual primary IP override from desktop
  socket.on('update_ip_override', (newIp) => {
    console.log(`Manual IP override set to: ${newIp}`);
    primaryIp = newIp;
    io.emit('connection_info_updated', { ip: primaryIp, port: PORT });
  });

  // Handle dynamic Firebase Credentials updates from desktop
  socket.on('update_firebase_config', async (configData) => {
    try {
      const parsed = JSON.parse(configData);
      
      // Save it to firebase-config.json file
      fs.writeFileSync(path.join(__dirname, 'firebase-config.json'), JSON.stringify(parsed, null, 2));
      console.log('[Firebase] Dynamic credentials updated and saved.');
      
      // Delete existing Firebase instance if any
      useFirebase = false;
      if (admin.apps.length > 0) {
        await admin.app().delete();
      }
      
      try {
        admin.initializeApp({
          credential: admin.credential.cert(parsed)
        });
        db = admin.firestore();
        useFirebase = true;
        console.log('[Firebase] Connected successfully to Cloud Database after config update.');
        
        // Seed default products to Firestore if empty
        const productsRef = db.collection('products');
        const snapshot = await productsRef.limit(1).get();
        if (snapshot.empty) {
          console.log('[Firebase] Cloud products collection is empty. Seeding defaults...');
          for (const prod of products) {
            await productsRef.doc(prod.id).set(prod);
          }
        }
        
        socket.emit('firebase_config_result', { success: true });
        io.emit('firebase_status_changed', { connected: true });
      } catch (err) {
        console.error('[Firebase] Failed to connect to database using the provided credentials:', err);
        socket.emit('firebase_config_result', { success: false, message: 'Connection failed: ' + err.message });
      }
    } catch (e) {
      socket.emit('firebase_config_result', { success: false, message: 'Invalid JSON format: ' + e.message });
    }
  });

  // Handle sale completion (Checkout)
  socket.on('checkout_completed', (saleData) => {
    const saleId = 'TXN-' + Math.floor(100000 + Math.random() * 900000);
    const completedSale = {
      id: saleId,
      timestamp: new Date().toISOString(),
      items: saleData.items,
      total: saleData.total,
      mode: saleData.mode, // 'Retail' or 'Wholesale'
      paymentMethod: saleData.paymentMethod
    };

    // Deduct stock
    saleData.items.forEach(item => {
      const prod = products.find(p => p.id === item.id);
      if (prod) {
        prod.stock = Math.max(0, prod.stock - item.quantity);
        if (useFirebase) {
          db.collection('products').doc(prod.id).update({ stock: prod.stock })
            .catch(err => console.error('[Firebase] Failed to update stock in Firestore:', err));
        }
      }
    });

    salesLogs.push(completedSale);
    activeCart = { items: [], mode: saleData.mode };
    saveProductsLocal();
    saveSalesLocal();

    if (useFirebase) {
      db.collection('sales').doc(saleId).set(completedSale)
        .catch(err => console.error('[Firebase] Failed to write sale to Firestore:', err));
    }

    // Broadcast update events
    io.emit('sale_logged', {
      sale: completedSale,
      products: products,
      salesLogs: salesLogs
    });

    console.log(`Transaction logged: ${saleId} [${saleData.mode}] - Total: $${saleData.total}`);
  });

  // Handle ping request to check Wi-Fi latency simulator
  socket.on('ping_check', () => {
    socket.emit('pong_check', {
      pingMs: Math.floor(Math.random() * 6) + 2
    });
  });

  // Handle Wi-Fi status query
  socket.on('wifi_status_request', () => {
    getWifiStatus((status) => {
      socket.emit('wifi_status_result', status);
    });
  });

  // Handle Wi-Fi scanning
  socket.on('wifi_scan_request', () => {
    getWifiList((err, list) => {
      if (err) {
        socket.emit('wifi_scan_result', { success: false, error: err.message, networks: [] });
      } else {
        socket.emit('wifi_scan_result', { success: true, networks: list });
      }
    });
  });

  // Handle Wi-Fi connection request
  socket.on('wifi_connect_request', (data) => {
    connectWifi(data.ssid, data.password, (err, result) => {
      if (err || !result.success) {
        socket.emit('wifi_connect_result', { success: false, error: (result && result.message) || (err && err.message) || 'Failed to connect' });
      } else {
        getWifiStatus((status) => {
          io.emit('wifi_status_result', status);
          socket.emit('wifi_connect_result', { success: true, ssid: data.ssid });
        });
      }
    });
  });

  // Handle Wi-Fi disconnect request
  socket.on('wifi_disconnect_request', () => {
    disconnectWifi((err, result) => {
      if (err || !result.success) {
        socket.emit('wifi_disconnect_result', { success: false, error: (result && result.message) || (err && err.message) || 'Failed to disconnect' });
      } else {
        getWifiStatus((status) => {
          io.emit('wifi_status_result', status);
          socket.emit('wifi_disconnect_result', { success: true });
        });
      }
    });
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
  });
});

server.listen(PORT, () => {
  console.log(`AeroPOS Server running at http://localhost:${PORT}`);
  console.log(`Mobile Companion Link: http://${primaryIp}:${PORT}/mobile`);
});
