const socket = io();

// State variables
let products = [];
let salesLogs = [];
let activeCart = [];
let pricingMode = 'Retail'; // 'Retail' or 'Wholesale'
let selectedPayment = 'Cash';
let currentCategory = 'all';
let currentSalesFilter = 'all';
let serverIp = '127.0.0.1';
let serverPort = 3000;

// Window Manager States
let activeWindows = ['window-pos']; // initially POS is open
let dragWindow = null;
let dragStartX = 0;
let dragStartY = 0;
let dragOffsetLeft = 0;
let dragOffsetTop = 0;

// Chart references
let salesChart = null;
let methodChart = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  setupOSListeners();
  setupNetworkClock();
  requestWifiStatus();
  
  // Request socket ping checks periodically
  setInterval(() => {
    const start = Date.now();
    socket.emit('ping_check');
    socket.once('pong_check', (data) => {
      const diff = Date.now() - start;
      document.getElementById('ping-text').innerText = `Ping: ${diff}ms`;
    });
  }, 5000);
});

// OS Interface Window Manager Logic
function setupOSListeners() {
  // Start menu click propagation handler
  document.addEventListener('click', (e) => {
    const startMenu = document.getElementById('start-menu');
    const startBtn = document.querySelector('.start-menu-btn');
    if (!startMenu.contains(e.target) && e.target !== startBtn) {
      startMenu.classList.remove('active');
    }
  });

  // Window drag movement handler on document
  document.addEventListener('mousemove', handleWindowDrag);
  document.addEventListener('mouseup', stopWindowDrag);
  document.addEventListener('touchmove', handleWindowDrag, { passive: false });
  document.addEventListener('touchend', stopWindowDrag);
}

// Digital clock in system tray
function setupNetworkClock() {
  const clockElement = document.getElementById('tray-clock');
  function updateClock() {
    const now = new Date();
    let hours = now.getHours();
    let minutes = now.getMinutes();
    let ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12; // the hour '0' should be '12'
    minutes = minutes < 10 ? '0' + minutes : minutes;
    clockElement.innerText = `${hours}:${minutes} ${ampm}`;
  }
  updateClock();
  setInterval(updateClock, 1000);
}

// Draggable Window Managers
function startWindowDrag(e, winId) {
  const win = document.getElementById(winId);
  if (win.classList.contains('maximized')) return;
  
  focusWindow(winId);
  dragWindow = win;
  
  const clientX = e.clientX || (e.touches && e.touches[0].clientX);
  const clientY = e.clientY || (e.touches && e.touches[0].clientY);
  
  dragStartX = clientX;
  dragStartY = clientY;
  dragOffsetLeft = win.offsetLeft;
  dragOffsetTop = win.offsetTop;
  
  // Prevent text selection during drag
  e.preventDefault();
}

function handleWindowDrag(e) {
  if (!dragWindow) return;
  
  const clientX = e.clientX || (e.touches && e.touches[0].clientX);
  const clientY = e.clientY || (e.touches && e.touches[0].clientY);
  
  const deltaX = clientX - dragStartX;
  const deltaY = clientY - dragStartY;
  
  let newLeft = dragOffsetLeft + deltaX;
  let newTop = dragOffsetTop + deltaY;
  
  // Ensure titlebar stays inside window boundaries
  newTop = Math.max(0, newTop);
  
  dragWindow.style.left = `${newLeft}px`;
  dragWindow.style.top = `${newTop}px`;
}

function stopWindowDrag() {
  dragWindow = null;
}

// Window control functions
function openWindow(winId) {
  playBeepSound();
  const win = document.getElementById(winId);
  win.classList.remove('minimized');
  win.style.display = 'flex';
  
  if (!activeWindows.includes(winId)) {
    activeWindows.push(winId);
  }
  
  focusWindow(winId);
  updateTaskbar();
  
  // Trigger layout updates for canvas graphs
  if (winId === 'window-dashboard') {
    setTimeout(renderDashboard, 150);
  }
  
  if (winId === 'window-wifi') {
    requestWifiStatus();
    requestWifiScan();
  }
}

function focusWindow(winId) {
  const windows = document.querySelectorAll('.window');
  windows.forEach(w => {
    if (w.id === winId) {
      w.classList.add('active');
    } else {
      w.classList.remove('active');
    }
  });
  
  // Set focused tab class in taskbar
  updateTaskbar();
}

function minimizeWindow(winId) {
  playBeepSound();
  const win = document.getElementById(winId);
  win.classList.add('minimized');
  
  // Unfocus
  win.classList.remove('active');
  updateTaskbar();
}

function maximizeWindow(winId) {
  playBeepSound();
  const win = document.getElementById(winId);
  win.classList.toggle('maximized');
}

function closeWindow(winId) {
  playBeepSound();
  const win = document.getElementById(winId);
  win.style.display = 'none';
  win.classList.remove('active');
  
  activeWindows = activeWindows.filter(id => id !== winId);
  updateTaskbar();
}

// Manage bottom taskbar apps
function updateTaskbar() {
  const container = document.getElementById('taskbar-apps');
  container.innerHTML = '';
  
  const winMeta = {
    'window-pos': { title: 'Register', icon: 'fa-cash-register' },
    'window-dashboard': { title: 'Dashboard', icon: 'fa-chart-line' },
    'window-sales': { title: 'Sales Log', icon: 'fa-receipt' },
    'window-sync': { title: 'Sync QR', icon: 'fa-mobile-screen' },
    'window-wifi': { title: 'Wi-Fi', icon: 'fa-wifi' }
  };
  
  activeWindows.forEach(winId => {
    const meta = winMeta[winId];
    if (!meta) return;
    
    const win = document.getElementById(winId);
    const isMinimized = win.classList.contains('minimized');
    const isFocused = win.classList.contains('active');
    
    const tab = document.createElement('div');
    tab.className = `taskbar-app-tab ${isFocused ? 'active' : ''}`;
    tab.innerHTML = `<i class="fa-solid ${meta.icon}"></i> ${meta.title}`;
    
    tab.onclick = (e) => {
      e.stopPropagation();
      if (isFocused) {
        minimizeWindow(winId);
      } else {
        if (isMinimized) {
          openWindow(winId);
        } else {
          focusWindow(winId);
        }
      }
    };
    
    container.appendChild(tab);
  });
}

// Start menu drawer toggler
function toggleStartMenu(e) {
  e.stopPropagation();
  playBeepSound();
  document.getElementById('start-menu').classList.toggle('active');
}

// Shutdown / reboot system simulator
function shutdownSystem() {
  playBeepSound();
  const shutdownScreen = document.createElement('div');
  shutdownScreen.style.position = 'fixed';
  shutdownScreen.style.top = '0';
  shutdownScreen.style.left = '0';
  shutdownScreen.style.width = '100vw';
  shutdownScreen.style.height = '100vh';
  shutdownScreen.style.backgroundColor = '#000000';
  shutdownScreen.style.color = '#ffffff';
  shutdownScreen.style.zIndex = '999999';
  shutdownScreen.style.display = 'flex';
  shutdownScreen.style.flexDirection = 'column';
  shutdownScreen.style.alignItems = 'center';
  shutdownScreen.style.justifyContent = 'center';
  shutdownScreen.style.fontFamily = 'var(--font-main)';
  shutdownScreen.innerHTML = `
    <i class="fa-solid fa-spinner fa-spin-pulse" style="font-size: 3rem; margin-bottom: 1.5rem; color: var(--accent-retail);"></i>
    <h2 style="font-weight: 500; font-size: 1.3rem;">Restarting Cashier POS-OS...</h2>
  `;
  document.body.appendChild(shutdownScreen);
  
  setTimeout(() => {
    window.location.reload();
  }, 2000);
}

function exitSystem() {
  playBeepSound();
  const password = prompt("Enter Admin Password to Exit Kiosk Mode:");
  if (password === "1234") {
    if (window.require) {
      try {
        const { ipcRenderer } = window.require('electron');
        ipcRenderer.send('exit-system');
      } catch (e) {
        console.error("Failed to trigger Electron exit:", e);
        alert("Exited system simulation.");
      }
    } else {
      alert("System simulated exit. (Not running in Electron host)");
    }
  } else if (password !== null) {
    alert("Access Denied: Incorrect Admin Password!");
  }
}

// Socket communications handlers
socket.on('init_connection', (data) => {
  console.log('POS connected to Server:', data);
  products = data.products;
  salesLogs = data.salesLogs;
  serverIp = data.ip;
  serverPort = data.port;
  
  // Set connection URLs
  document.getElementById('network-ip-text').innerText = `http://${serverIp}:${serverPort}/mobile`;
  generateQRCode(`http://${serverIp}:${serverPort}/mobile`);
  
  // Update Firebase status badge
  const statusBadge = document.getElementById('firebase-status-badge');
  if (statusBadge) {
    if (data.useFirebase) {
      statusBadge.innerText = 'Connected / متصل';
      statusBadge.className = 'invoice-mode-badge retail';
      statusBadge.style.backgroundColor = 'rgba(0, 210, 255, 0.15)';
    } else {
      statusBadge.innerText = 'Local Memory / ذاكرة محلية';
      statusBadge.className = 'invoice-mode-badge wholesale';
      statusBadge.style.backgroundColor = 'rgba(255, 159, 0, 0.15)';
    }
  }

  // Populate IP selector dropdown
  const ipSelect = document.getElementById('ip-select');
  if (ipSelect) {
    ipSelect.innerHTML = '';
    const optLocal = document.createElement('option');
    optLocal.value = '127.0.0.1';
    optLocal.innerText = 'localhost (127.0.0.1)';
    ipSelect.appendChild(optLocal);
    
    if (data.networkAddresses && data.networkAddresses.length > 0) {
      data.networkAddresses.forEach(addr => {
        const opt = document.createElement('option');
        opt.value = addr.address;
        opt.innerText = `${addr.name} (${addr.address})`;
        if (addr.address === serverIp) {
          opt.selected = true;
        }
        ipSelect.appendChild(opt);
      });
    }
  }
  
  if (data.activeCart && data.activeCart.items) {
    activeCart = data.activeCart.items;
    pricingMode = data.activeCart.mode;
    applyPricingModeStyles();
  }
  
  renderCatalog();
  recalculateCart();
  renderSalesLog();
  renderDashboard();
  updateTaskbar();
});

// Change IP select dropdown handler
function onIpSelectChanged(select) {
  const selectedIp = select.value;
  socket.emit('update_ip_override', selectedIp);
}

// Apply manual IP address override
function applyManualIp() {
  const input = document.getElementById('manual-ip-input');
  const manualIp = input.value.trim();
  if (manualIp === '') return;
  
  socket.emit('update_ip_override', manualIp);
  input.value = '';
}

// Send Firebase Configuration to Server
function saveFirebaseConfig() {
  const textarea = document.getElementById('firebase-json-input');
  const jsonStr = textarea.value.trim();
  if (jsonStr === '') {
    alert('Please paste a valid service account credentials JSON string.');
    return;
  }
  
  socket.emit('update_firebase_config', jsonStr);
}

// Listen for updated connection info from server
socket.on('connection_info_updated', (info) => {
  serverIp = info.ip;
  serverPort = info.port;
  
  document.getElementById('network-ip-text').innerText = `http://${serverIp}:${serverPort}/mobile`;
  generateQRCode(`http://${serverIp}:${serverPort}/mobile`);
});

// Listen for Firebase configuration result
socket.on('firebase_config_result', (res) => {
  if (res.success) {
    alert('Firebase Connected successfully! / تم الاتصال بقاعدة البيانات بنجاح!');
    document.getElementById('firebase-json-input').value = '';
  } else {
    alert(`Firebase Connection Error: ${res.message}`);
  }
});

// Listen for Firebase connection status updates
socket.on('firebase_status_changed', (status) => {
  const statusBadge = document.getElementById('firebase-status-badge');
  if (statusBadge) {
    if (status.connected) {
      statusBadge.innerText = 'Connected / متصل';
      statusBadge.className = 'invoice-mode-badge retail';
      statusBadge.style.backgroundColor = 'rgba(0, 210, 255, 0.15)';
    } else {
      statusBadge.innerText = 'Local Memory / ذاكرة محلية';
      statusBadge.className = 'invoice-mode-badge wholesale';
      statusBadge.style.backgroundColor = 'rgba(255, 159, 0, 0.15)';
    }
  }
});

socket.on('cart_changed', (serverCart) => {
  activeCart = serverCart.items;
  pricingMode = serverCart.mode;
  applyPricingModeStyles();
  recalculateCart(false); // don't emit back
});

socket.on('add_to_cart_from_scanner', (product) => {
  playBeepSound();
  addToCart(product, 1);
});

socket.on('sale_logged', (data) => {
  products = data.products;
  salesLogs = data.salesLogs;
  
  renderCatalog();
  renderSalesLog();
  renderDashboard();
});

socket.on('products_updated', (updatedProducts) => {
  products = updatedProducts;
  renderCatalog();
  renderDashboard();
});

// Sound Generator using Web Audio API
function playBeepSound() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.08);
  } catch (e) {
    console.warn('Audio Context muted.', e);
  }
}

function playCashRegisterSound() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    let osc1 = audioCtx.createOscillator();
    let gain1 = audioCtx.createGain();
    osc1.connect(gain1);
    gain1.connect(audioCtx.destination);
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5
    gain1.gain.setValueAtTime(0.06, audioCtx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
    osc1.start();
    osc1.stop(audioCtx.currentTime + 0.15);

    setTimeout(() => {
      let osc2 = audioCtx.createOscillator();
      let gain2 = audioCtx.createGain();
      osc2.connect(gain2);
      gain2.connect(audioCtx.destination);
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
      osc2.frequency.exponentialRampToValueAtTime(1174.66, audioCtx.currentTime + 0.25); // D6
      gain2.gain.setValueAtTime(0.04, audioCtx.currentTime);
      gain2.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
      osc2.start();
      osc2.stop(audioCtx.currentTime + 0.3);
    }, 100);
  } catch (e) {
    console.warn('Audio context error:', e);
  }
}

// Generate QR Code dynamically
function generateQRCode(url) {
  const container = document.getElementById('qr-container');
  container.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=110x110&data=${encodeURIComponent(url)}" alt="QR" style="display: block; border-radius: 4px;">`;
}

// Pricing Mode Switcher
function setPricingMode(mode) {
  if (pricingMode === mode) return;
  pricingMode = mode;
  playBeepSound();
  
  applyPricingModeStyles();
  
  activeCart.forEach(item => {
    const prod = products.find(p => p.id === item.id);
    if (prod) {
      item.price = (pricingMode === 'Retail') ? prod.retailPrice : prod.wholesalePrice;
    }
  });

  recalculateCart();
  renderCatalog();
}

function applyPricingModeStyles() {
  const retailBtn = document.getElementById('mode-retail-btn');
  const wholesaleBtn = document.getElementById('mode-wholesale-btn');
  const posTitle = document.querySelector('#window-pos .window-title');
  
  if (pricingMode === 'Retail') {
    document.body.classList.remove('mode-wholesale');
    retailBtn.className = 'mode-btn active-retail';
    wholesaleBtn.className = 'mode-btn';
    posTitle.innerHTML = `<i class="fa-solid fa-cash-register" style="color: var(--accent-retail); margin-right: 8px;"></i> AeroPOS Cashier Register [Retail Mode]`;
    document.documentElement.style.setProperty('--accent-active', 'var(--accent-retail)');
    document.documentElement.style.setProperty('--accent-active-glow', 'var(--accent-retail-glow)');
  } else {
    document.body.classList.add('mode-wholesale');
    retailBtn.className = 'mode-btn';
    wholesaleBtn.className = 'mode-btn active-wholesale';
    posTitle.innerHTML = `<i class="fa-solid fa-cash-register" style="color: var(--accent-wholesale); margin-right: 8px;"></i> AeroPOS Cashier Register [Wholesale Mode]`;
    document.documentElement.style.setProperty('--accent-active', 'var(--accent-wholesale)');
    document.documentElement.style.setProperty('--accent-active-glow', 'var(--accent-wholesale-glow)');
  }
}

// Render Products Grid
function renderCatalog() {
  const grid = document.getElementById('product-grid');
  grid.innerHTML = '';
  
  const searchText = document.getElementById('catalog-search').value.toLowerCase();
  
  const filtered = products.filter(prod => {
    const matchesCategory = (currentCategory === 'all' || prod.category === currentCategory);
    const matchesSearch = prod.name.toLowerCase().includes(searchText) || 
                          prod.barcode.includes(searchText);
    return matchesCategory && matchesSearch;
  });

  if (filtered.length === 0) {
    grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 2rem; font-size: 0.8rem;">No products found</div>`;
    return;
  }

  filtered.forEach(prod => {
    const currentPrice = (pricingMode === 'Retail') ? prod.retailPrice : prod.wholesalePrice;
    const isLowStock = prod.stock < 15;
    
    const card = document.createElement('div');
    card.className = 'product-card';
    card.onclick = () => {
      playBeepSound();
      addToCart(prod, 1);
    };
    
    card.innerHTML = `
      <span class="stock-tag ${isLowStock ? 'low-stock' : ''}">${prod.stock} left</span>
      <div>
        <div class="category-lbl">${prod.category}</div>
        <div class="product-title" title="${prod.name}">${prod.name}</div>
      </div>
      <div class="price-row">
        <div>
          <div class="price-label">${pricingMode} Price</div>
          <div class="price-amount">$${currentPrice.toFixed(2)}</div>
        </div>
        <i class="fa-solid fa-plus-circle" style="font-size: 1.1rem; color: var(--accent-active);"></i>
      </div>
    `;
    grid.appendChild(card);
  });
}

function filterCategory(categoryName) {
  currentCategory = categoryName;
  const chips = document.querySelectorAll('.cat-chip');
  chips.forEach(chip => {
    if (chip.textContent.toLowerCase().includes(categoryName.toLowerCase()) || 
       (categoryName === 'all' && chip.textContent.includes('All'))) {
      chip.classList.add('active');
    } else {
      chip.classList.remove('active');
    }
  });
  renderCatalog();
}

function filterCatalog() {
  renderCatalog();
}

// Add item to Cart
function addToCart(product, quantity = 1) {
  const currentPrice = (pricingMode === 'Retail') ? product.retailPrice : product.wholesalePrice;
  const existingItemIndex = activeCart.findIndex(item => item.id === product.id);
  
  if (existingItemIndex > -1) {
    activeCart[existingItemIndex].quantity += quantity;
  } else {
    activeCart.push({
      id: product.id,
      name: product.name,
      price: currentPrice,
      quantity: quantity
    });
  }
  
  recalculateCart();
}

function updateQty(productId, change) {
  playBeepSound();
  const index = activeCart.findIndex(item => item.id === productId);
  if (index > -1) {
    activeCart[index].quantity += change;
    if (activeCart[index].quantity <= 0) {
      activeCart.splice(index, 1);
    }
    recalculateCart();
  }
}

function removeItem(productId) {
  playBeepSound();
  const index = activeCart.findIndex(item => item.id === productId);
  if (index > -1) {
    activeCart.splice(index, 1);
    recalculateCart();
  }
}

function clearCart() {
  if (activeCart.length === 0) return;
  playBeepSound();
  activeCart = [];
  recalculateCart();
}

function recalculateCart(emitChange = true) {
  const listElement = document.getElementById('cart-items');
  const cartBadge = document.getElementById('cart-count');
  
  if (activeCart.length === 0) {
    listElement.innerHTML = `
      <div class="cart-empty">
        <i class="fa-solid fa-basket-shopping"></i>
        <p>Register is empty. Scan barcodes or select products to begin.</p>
      </div>
    `;
    cartBadge.innerText = '0';
    document.getElementById('summary-subtotal').innerText = '$0.00';
    document.getElementById('summary-tax').innerText = '$0.00';
    document.getElementById('summary-total').innerText = '$0.00';
    
    if (emitChange) {
      socket.emit('update_cart', { items: [], mode: pricingMode });
    }
    return;
  }
  
  listElement.innerHTML = '';
  let subtotal = 0;
  let totalQty = 0;
  
  activeCart.forEach(item => {
    const itemTotal = item.price * item.quantity;
    subtotal += itemTotal;
    totalQty += item.quantity;
    
    const cartRow = document.createElement('div');
    cartRow.className = 'cart-item';
    cartRow.innerHTML = `
      <div class="cart-item-info">
        <div class="cart-item-name">${item.name}</div>
        <div class="cart-item-price">$${item.price.toFixed(2)}</div>
      </div>
      <div class="cart-qty-controls">
        <button class="qty-btn" onclick="updateQty('${item.id}', -1)">-</button>
        <div class="qty-val">${item.quantity}</div>
        <button class="qty-btn" onclick="updateQty('${item.id}', 1)">+</button>
      </div>
      <div class="cart-item-total">$${itemTotal.toFixed(2)}</div>
      <button class="remove-item-btn" onclick="removeItem('${item.id}')">
        <i class="fa-solid fa-xmark"></i>
      </button>
    `;
    listElement.appendChild(cartRow);
  });
  
  cartBadge.innerText = totalQty;
  const tax = subtotal * 0.10; // 10% VAT
  const total = subtotal + tax;
  
  document.getElementById('summary-subtotal').innerText = `$${subtotal.toFixed(2)}`;
  document.getElementById('summary-tax').innerText = `$${tax.toFixed(2)}`;
  document.getElementById('summary-total').innerText = `$${total.toFixed(2)}`;
  
  if (emitChange) {
    socket.emit('update_cart', { items: activeCart, mode: pricingMode });
  }
}

function setPaymentMethod(method) {
  selectedPayment = method;
  playBeepSound();
  
  document.getElementById('pay-cash').classList.remove('selected');
  document.getElementById('pay-card').classList.remove('selected');
  document.getElementById('pay-mobile').classList.remove('selected');
  
  if (method === 'Cash') document.getElementById('pay-cash').classList.add('selected');
  else if (method === 'Card') document.getElementById('pay-card').classList.add('selected');
  else if (method === 'Mobile Pay') document.getElementById('pay-mobile').classList.add('selected');
}

function checkout() {
  if (activeCart.length === 0) return;
  
  let subtotal = activeCart.reduce((acc, curr) => acc + (curr.price * curr.quantity), 0);
  let tax = subtotal * 0.10;
  let total = subtotal + tax;
  
  const saleData = {
    items: activeCart,
    total: total,
    mode: pricingMode,
    paymentMethod: selectedPayment
  };
  
  socket.emit('checkout_completed', saleData);
  playCashRegisterSound();
  
  showReceipt(saleData, total);
  
  activeCart = [];
  recalculateCart(false);
}

function showReceipt(saleData, total) {
  const overlay = document.getElementById('receipt-modal-overlay');
  const receiptBox = document.getElementById('receipt-content');
  const txnId = 'TXN-' + Math.floor(100000 + Math.random() * 900000);
  const now = new Date();
  
  let subtotal = total / 1.10;
  let tax = total - subtotal;
  
  let itemsHtml = '';
  saleData.items.forEach(item => {
    itemsHtml += `
      <div class="receipt-item-row">
        <span>${item.name} x${item.quantity}</span>
        <span>$${(item.price * item.quantity).toFixed(2)}</span>
      </div>
    `;
  });

  receiptBox.innerHTML = `
    <div class="receipt-header">
      <div class="receipt-logo">AeroPOS Store</div>
      <p>Mobile Store POS Environment</p>
      <p>IP: ${serverIp}:${serverPort}</p>
    </div>
    <div class="receipt-details">
      <div>Txn: <strong>${txnId}</strong></div>
      <div>Date: ${now.toLocaleDateString()} ${now.toLocaleTimeString()}</div>
      <div>Mode: <strong>${saleData.mode.toUpperCase()}</strong></div>
      <div>Method: ${saleData.paymentMethod}</div>
    </div>
    <div class="receipt-divider"></div>
    <div class="receipt-items">
      ${itemsHtml}
    </div>
    <div class="receipt-divider"></div>
    <div class="receipt-totals">
      <div class="receipt-total-row">
        <span>Subtotal</span>
        <span>$${subtotal.toFixed(2)}</span>
      </div>
      <div class="receipt-total-row">
        <span>Tax (10% VAT)</span>
        <span>$${tax.toFixed(2)}</span>
      </div>
      <div class="receipt-total-row grand">
        <span>GRAND TOTAL</span>
        <span>$${total.toFixed(2)}</span>
      </div>
    </div>
    <div class="receipt-footer">
      <p>Thank You For Your Purchase!</p>
      <p>شكراً لتعاملكم معنا</p>
    </div>
    <button class="close-receipt-btn" onclick="closeReceipt()">Print & Close</button>
  `;
  
  overlay.classList.add('active');
}

function closeReceipt() {
  playBeepSound();
  document.getElementById('receipt-modal-overlay').classList.remove('active');
}

// Render sales logs
function renderSalesLog() {
  const body = document.getElementById('sales-log-body');
  body.innerHTML = '';
  
  let filteredLogs = salesLogs;
  if (currentSalesFilter !== 'all') {
    filteredLogs = salesLogs.filter(log => log.mode === currentSalesFilter);
  }

  if (filteredLogs.length === 0) {
    body.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 2rem;">No transactions yet</td></tr>`;
    return;
  }

  [...filteredLogs].reverse().forEach(log => {
    const totalQty = log.items.reduce((acc, curr) => acc + curr.quantity, 0);
    const date = new Date(log.timestamp);
    
    const row = document.createElement('tr');
    row.innerHTML = `
      <td><strong>${log.id}</strong></td>
      <td>${date.toLocaleDateString()} ${date.toLocaleTimeString()}</td>
      <td><span class="badge-mode ${log.mode.toLowerCase()}">${log.mode}</span></td>
      <td>${totalQty} items</td>
      <td>${log.paymentMethod}</td>
      <td style="color: var(--accent-active); font-weight: 700;">$${log.total.toFixed(2)}</td>
      <td>
        <button class="log-filter-btn" onclick='reprintLogReceipt(${JSON.stringify(log)})' style="padding: 2px 6px; font-size: 0.65rem;">
          <i class="fa-solid fa-print"></i>
        </button>
      </td>
    `;
    body.appendChild(row);
  });
}

function reprintLogReceipt(log) {
  playBeepSound();
  showReceipt({
    items: log.items,
    paymentMethod: log.paymentMethod,
    mode: log.mode
  }, log.total);
}

function filterSalesLog(filterMode, element) {
  currentSalesFilter = filterMode;
  playBeepSound();
  
  const buttons = document.querySelectorAll('.log-filters .log-filter-btn');
  buttons.forEach(btn => btn.classList.remove('active'));
  element.classList.add('active');
  
  renderSalesLog();
}

// Render Dashboard stats
function renderDashboard() {
  let totalRev = 0;
  let retailRev = 0;
  let wholesaleRev = 0;
  let retailCount = 0;
  let wholesaleCount = 0;
  
  salesLogs.forEach(log => {
    totalRev += log.total;
    if (log.mode === 'Retail') {
      retailRev += log.total;
      retailCount++;
    } else {
      wholesaleRev += log.total;
      wholesaleCount++;
    }
  });

  const avgTicket = salesLogs.length > 0 ? (totalRev / salesLogs.length) : 0;
  
  document.getElementById('stats-total-revenue').innerText = `$${totalRev.toFixed(2)}`;
  document.getElementById('stats-retail-revenue').innerText = `$${retailRev.toFixed(2)}`;
  document.getElementById('stats-wholesale-revenue').innerText = `$${wholesaleRev.toFixed(2)}`;
  document.getElementById('stats-avg-ticket').innerText = `$${avgTicket.toFixed(2)}`;
  
  document.getElementById('stats-total-count').innerText = `${salesLogs.length} Txns`;
  document.getElementById('stats-retail-count').innerText = `${retailCount} Sales`;
  document.getElementById('stats-wholesale-count').innerText = `${wholesaleCount} Sales`;

  renderSalesCharts(retailRev, wholesaleRev, retailCount, wholesaleCount);
}

function renderSalesCharts(retailRev, wholesaleRev, retailCount, wholesaleCount) {
  if (typeof Chart === 'undefined') return;

  try {
    const ctxSales = document.getElementById('salesChart').getContext('2d');
    const ctxMethod = document.getElementById('methodChart').getContext('2d');

    if (salesChart) salesChart.destroy();
    if (methodChart) methodChart.destroy();

    salesChart = new Chart(ctxSales, {
      type: 'bar',
      data: {
        labels: ['Retail', 'Wholesale', 'Total Combined'],
        datasets: [{
          label: 'Revenue ($)',
          data: [retailRev, wholesaleRev, retailRev + wholesaleRev],
          backgroundColor: [
            'rgba(0, 210, 255, 0.4)',
            'rgba(255, 159, 0, 0.4)',
            'rgba(168, 85, 247, 0.4)'
          ],
          borderColor: [
            '#00d2ff',
            '#ff9f00',
            '#a855f7'
          ],
          borderWidth: 1.5,
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#9ca3af', font: { size: 9 } } },
          x: { grid: { display: false }, ticks: { color: '#9ca3af', font: { size: 9 } } }
        }
      }
    });

    methodChart = new Chart(ctxMethod, {
      type: 'doughnut',
      data: {
        labels: ['Retail Sales', 'Wholesale Sales'],
        datasets: [{
          data: [retailCount, wholesaleCount],
          backgroundColor: [
            'rgba(0, 210, 255, 0.5)',
            'rgba(255, 159, 0, 0.5)'
          ],
          borderColor: [
            '#00d2ff',
            '#ff9f00'
          ],
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: '#9ca3af', boxWidth: 10, font: { size: 9, family: 'Outfit' } }
          }
        }
      }
    });
  } catch (err) {
    console.error('Error drawing sales charts:', err);
  }
}

// Simulated hardware barcode scanner inputs
function handleEmulatorBarcodeKeyPress(e) {
  if (e.key === 'Enter') {
    simulateScan();
  }
}

function simulateScan() {
  const input = document.getElementById('emulator-barcode-input');
  const barcode = input.value.trim();
  if (barcode === '') return;
  
  input.value = '';
  const product = products.find(p => p.barcode === barcode);
  if (product) {
    playBeepSound();
    addToCart(product, 1);
  } else {
    alert(`Barcode: ${barcode} - Product Not Found!`);
  }
}

// Mobile device connection counter listeners
socket.on('device_count_updated', (count) => {
  document.getElementById('connected-devices').innerHTML = `<i class="fa-solid fa-mobile-screen"></i> ${count}`;
});

socket.on('connect', () => {
  socket.emit('get_connected_devices');
  requestWifiStatus();
});

socket.on('disconnect', () => {
  document.getElementById('tray-wifi-dot').style.backgroundColor = 'var(--error)';
  document.getElementById('tray-wifi-icon').style.color = 'var(--text-muted)';
});

socket.on('init_connection', (data) => {
  document.getElementById('connected-devices').innerHTML = `<i class="fa-solid fa-mobile-screen"></i> 1`;
  requestWifiStatus();
});

// Wi-Fi Connection Manager State
let wifiNetworks = [];
let wifiConnectedSsid = '';
let wifiSelectedSsid = '';
let wifiSelectedSecurity = '';

function requestWifiStatus() {
  socket.emit('wifi_status_request');
}

function requestWifiScan() {
  const scanIcon = document.getElementById('wifi-scan-icon');
  if (scanIcon) scanIcon.classList.add('spinning');
  
  const listContainer = document.getElementById('wifi-networks-list');
  if (listContainer && listContainer.children.length <= 1) {
    listContainer.innerHTML = `
      <div class="wifi-list-loading">
        <i class="fa-solid fa-spinner fa-spin-pulse"></i>
        <p>Scanning for nearby networks...</p>
      </div>
    `;
  }
  
  socket.emit('wifi_scan_request');
}

function requestWifiDisconnect() {
  if (confirm("Are you sure you want to disconnect from Wi-Fi? / هل تريد قطع الاتصال بالشبكة؟")) {
    socket.emit('wifi_disconnect_request');
  }
}

function selectWifiNetwork(ssid, security) {
  playBeepSound();
  wifiSelectedSsid = ssid;
  wifiSelectedSecurity = security;
  
  const items = document.querySelectorAll('.wifi-network-item');
  items.forEach(item => {
    if (item.getAttribute('data-ssid') === ssid) {
      item.classList.add('selected');
    } else {
      item.classList.remove('selected');
    }
  });
  
  document.getElementById('wifi-target-ssid').innerText = ssid;
  document.getElementById('wifi-target-security').innerText = security === '--' || security === 'Open' ? 'Open Network (No Password)' : `Secured (${security})`;
  document.getElementById('wifi-password-input').value = '';
  document.getElementById('wifi-error-message').style.display = 'none';
  
  document.getElementById('wifi-connect-pane').style.display = 'flex';
  
  if (security === '--' || security === 'Open') {
    document.getElementById('wifi-password-input').placeholder = 'No password required';
    document.getElementById('wifi-password-input').disabled = true;
  } else {
    document.getElementById('wifi-password-input').placeholder = 'Enter security key...';
    document.getElementById('wifi-password-input').disabled = false;
  }
}

function hideWifiConnectPane() {
  playBeepSound();
  document.getElementById('wifi-connect-pane').style.display = 'none';
  const items = document.querySelectorAll('.wifi-network-item');
  items.forEach(item => item.classList.remove('selected'));
  wifiSelectedSsid = '';
}

function toggleWifiPasswordVisibility() {
  playBeepSound();
  const pwdInput = document.getElementById('wifi-password-input');
  const pwdIcon = document.getElementById('toggle-pwd-icon');
  
  if (pwdInput.type === 'password') {
    pwdInput.type = 'text';
    pwdIcon.className = 'fa-solid fa-eye-slash';
  } else {
    pwdInput.type = 'password';
    pwdIcon.className = 'fa-solid fa-eye';
  }
}

function submitWifiConnection() {
  playBeepSound();
  const password = document.getElementById('wifi-password-input').value;
  const submitBtn = document.getElementById('wifi-connect-submit-btn');
  const btnText = document.getElementById('wifi-connect-btn-text');
  const spinner = document.getElementById('wifi-connect-btn-spinner');
  
  if (wifiSelectedSecurity !== '--' && wifiSelectedSecurity !== 'Open' && password.length < 8) {
    const errorAlert = document.getElementById('wifi-error-message');
    document.getElementById('wifi-error-text').innerText = "Password must be at least 8 characters long.";
    errorAlert.style.display = 'flex';
    return;
  }
  
  submitBtn.disabled = true;
  btnText.innerText = "Connecting...";
  spinner.style.display = 'inline-block';
  
  socket.emit('wifi_connect_request', {
    ssid: wifiSelectedSsid,
    password: password
  });
}

socket.on('wifi_status_result', (status) => {
  console.log('Wi-Fi Status:', status);
  wifiConnectedSsid = status.ssid;
  
  const statusBanner = document.getElementById('wifi-status-banner');
  const statusSSIDText = document.getElementById('wifi-connected-ssid');
  const statusIPText = document.getElementById('wifi-connected-ip');
  const disconnectBtn = document.getElementById('wifi-disconnect-btn');
  const trayWifiDot = document.getElementById('tray-wifi-dot');
  const trayWifiIcon = document.getElementById('tray-wifi-icon');
  
  if (status.connected) {
    if (statusBanner) statusBanner.className = 'wifi-status-banner connected';
    if (statusSSIDText) statusSSIDText.innerText = status.ssid;
    if (statusIPText) statusIPText.innerText = `IP Address: ${status.ip}`;
    if (disconnectBtn) disconnectBtn.style.display = 'flex';
    
    if (trayWifiDot) trayWifiDot.style.backgroundColor = 'var(--success)';
    if (trayWifiIcon) trayWifiIcon.style.color = 'var(--accent-active)';
  } else {
    if (statusBanner) statusBanner.className = 'wifi-status-banner';
    if (statusSSIDText) statusSSIDText.innerText = 'Disconnected';
    if (statusIPText) statusIPText.innerText = 'No IP Address / Not Connected';
    if (disconnectBtn) disconnectBtn.style.display = 'none';
    
    if (trayWifiDot) trayWifiDot.style.backgroundColor = 'var(--error)';
    if (trayWifiIcon) trayWifiIcon.style.color = 'var(--text-muted)';
  }
  
  renderWifiNetworks();
});

socket.on('wifi_scan_result', (res) => {
  const scanIcon = document.getElementById('wifi-scan-icon');
  if (scanIcon) scanIcon.classList.remove('spinning');
  
  if (!res.success) {
    console.error('Wi-Fi scan failed:', res.error);
    const listContainer = document.getElementById('wifi-networks-list');
    if (listContainer) {
      listContainer.innerHTML = `<div style="text-align: center; color: var(--error); padding: 2rem; font-size: 0.8rem;"><i class="fa-solid fa-triangle-exclamation"></i> Scan failed: ${res.error}</div>`;
    }
    return;
  }
  
  wifiNetworks = res.networks;
  renderWifiNetworks();
});

socket.on('wifi_connect_result', (res) => {
  const submitBtn = document.getElementById('wifi-connect-submit-btn');
  const btnText = document.getElementById('wifi-connect-btn-text');
  const spinner = document.getElementById('wifi-connect-btn-spinner');
  
  if (submitBtn) submitBtn.disabled = false;
  if (btnText) btnText.innerText = "Connect";
  if (spinner) spinner.style.display = 'none';
  
  if (res.success) {
    hideWifiConnectPane();
    requestWifiStatus();
    alert(`Successfully connected to ${res.ssid}!`);
  } else {
    const errorAlert = document.getElementById('wifi-error-message');
    if (errorAlert) {
      document.getElementById('wifi-error-text').innerText = res.error;
      errorAlert.style.display = 'flex';
    }
  }
});

socket.on('wifi_disconnect_result', (res) => {
  if (res.success) {
    requestWifiStatus();
    alert('Disconnected from Wi-Fi.');
  } else {
    alert(`Failed to disconnect: ${res.error}`);
  }
});

function renderWifiNetworks() {
  const listContainer = document.getElementById('wifi-networks-list');
  if (!listContainer) return;
  
  listContainer.innerHTML = '';
  
  if (wifiNetworks.length === 0) {
    listContainer.innerHTML = `
      <div style="text-align: center; color: var(--text-muted); padding: 2rem; font-size: 0.8rem;">
        <i class="fa-solid fa-wifi" style="font-size: 1.5rem; opacity: 0.3; margin-bottom: 0.5rem; display: block;"></i>
        No wireless networks found
      </div>
    `;
    return;
  }
  
  wifiNetworks.forEach(net => {
    const isConnected = net.ssid === wifiConnectedSsid;
    const isSelected = net.ssid === wifiSelectedSsid;
    const isSecured = net.security !== '--' && net.security !== 'Open';
    
    const item = document.createElement('div');
    item.className = `wifi-network-item ${isConnected ? 'connected-item' : ''} ${isSelected ? 'selected' : ''}`;
    item.setAttribute('data-ssid', net.ssid);
    item.onclick = () => selectWifiNetwork(net.ssid, net.security);
    
    item.innerHTML = `
      <div class="wifi-net-details">
        <i class="fa-solid ${isConnected ? 'fa-circle-check' : 'fa-wifi'} wifi-net-icon"></i>
        <span class="wifi-net-name">${net.ssid}</span>
      </div>
      <div class="wifi-net-status">
        ${isConnected ? '<span class="wifi-badge connected">Connected</span>' : ''}
        ${isSecured ? '<span class="wifi-badge secured"><i class="fa-solid fa-lock" style="font-size: 0.6rem;"></i> Secure</span>' : '<span class="wifi-badge open">Open</span>'}
        <span class="wifi-signal-strength" title="Signal strength: ${net.signal}%">
          <i class="fa-solid fa-signal" style="opacity: ${0.3 + (net.signal/100) * 0.7}"></i>
        </span>
      </div>
    `;
    listContainer.appendChild(item);
  });
}

