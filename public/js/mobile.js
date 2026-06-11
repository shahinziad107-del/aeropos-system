let socket = io();

// Connection Config state
let isCloudMode = localStorage.getItem('aeropos_is_cloud') === 'true';
let firebaseProjectId = localStorage.getItem('aeropos_project_id') || '';
let dbCloud = null;

// State
let products = [];
let activeCart = [];
let salesLogs = [];
let pricingMode = 'Retail';
let html5QrCode = null;
let formHtml5QrCode = null;
let capturedPhotoBase64 = '';

document.addEventListener('DOMContentLoaded', () => {
  checkAdminLoginStatus();
  initConnectionMode();
  
  // Register Service Worker for PWA installation
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
      .then(() => console.log('Service Worker Registered'))
      .catch(err => console.error('Service Worker registration failed:', err));
  }
});

function setupSocketListeners() {
  // Connection state indicators
  socket.on('connect', () => {
    document.getElementById('mobile-connection-status').innerText = 'Synced';
    document.getElementById('mobile-connection-dot').style.backgroundColor = 'var(--success)';
  });

  socket.on('disconnect', () => {
    document.getElementById('mobile-connection-status').innerText = 'Disconnected';
    document.getElementById('mobile-connection-dot').style.backgroundColor = 'var(--error)';
  });

  // Connection initializer
  socket.on('init_connection', (data) => {
    products = data.products;
    salesLogs = data.salesLogs || [];
    
    // Set initial cart state
    if (data.activeCart) {
      activeCart = data.activeCart.items || [];
      pricingMode = data.activeCart.mode || 'Retail';
    }
    
    renderCustomerCart();
    renderQuickScanList();
    renderMobileInvoices();
  });

  // Listening for cart updates from Desktop POS
  socket.on('cart_changed', (serverCart) => {
    activeCart = serverCart.items;
    pricingMode = serverCart.mode;
    renderCustomerCart();
  });

  // Listening for remote scan results
  socket.on('scan_result', (data) => {
    const feedback = document.getElementById('scan-feedback');
    if (data.success) {
      playBeepSound();
      feedback.className = 'scanner-feedback success';
      feedback.innerHTML = `<i class="fa-solid fa-circle-check"></i> Scanned: <strong>${data.name}</strong> added to register.`;
    } else {
      feedback.className = 'scanner-feedback error';
      feedback.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> Error: ${data.message}`;
    }
    
    // Reset feedback text after 2.5 seconds
    setTimeout(() => {
      feedback.className = 'scanner-feedback';
      feedback.innerHTML = 'Align barcode in camera viewport to scan.';
    }, 2500);
  });

  // Listening for real-time invoice/sale logging
  socket.on('sale_logged', (data) => {
    products = data.products;
    salesLogs = data.salesLogs || [];
    
    renderQuickScanList();
    renderMobileInvoices();
  });

  // Listening for remote product list updates
  socket.on('products_updated', (updatedProducts) => {
    products = updatedProducts;
    renderQuickScanList();
  });

  // Listening for product creation results
  socket.on('product_create_result', (data) => {
    if (data.success) {
      playBeepSound();
      alert(`Success: Product "${data.name}" added to AeroPOS!`);
      // Reset form
      document.getElementById('add-product-form').reset();
      removeCapturedPhoto();
      // Switch back to scanner tab
      switchMobileTab('scanner');
    } else {
      alert(`Error creating product: ${data.message}`);
    }
  });
}

// Sound generator using Web Audio API
function playBeepSound() {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1000, audioCtx.currentTime); // High pitched scanner beep
    gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.07);
    
    osc.start();
    osc.stop(audioCtx.currentTime + 0.07);
  } catch (e) {
    console.warn('Audio Context unsupported or muted.', e);
  }
}

// Switch view tabs
function switchMobileTab(tabName) {
  // Stop scanning when switching tabs to release camera
  stopCameraScanner();
  stopFormBarcodeScan();

  // Panels
  const panels = {
    customer: document.getElementById('panel-customer'),
    scanner: document.getElementById('panel-scanner'),
    invoices: document.getElementById('panel-invoices'),
    addproduct: document.getElementById('panel-addproduct')
  };
  
  // Tab buttons
  const buttons = {
    customer: document.getElementById('btn-cust-tab'),
    scanner: document.getElementById('btn-scan-tab'),
    invoices: document.getElementById('btn-invoice-tab'),
    addproduct: document.getElementById('btn-add-tab')
  };
  
  Object.keys(panels).forEach(key => {
    if (panels[key]) panels[key].classList.remove('active');
    if (buttons[key]) buttons[key].classList.remove('active');
  });

  if (panels[tabName]) panels[tabName].classList.add('active');
  if (buttons[tabName]) buttons[tabName].classList.add('active');
}

// Render cart items for customer visual panel
function renderCustomerCart() {
  const container = document.getElementById('cust-cart-items');
  const modeBadge = document.getElementById('cust-cart-mode');
  const totalVal = document.getElementById('cust-cart-total');

  // Update dynamic mode badge
  modeBadge.innerText = pricingMode === 'Retail' ? 'Retail Mode (تجزئة)' : 'Wholesale Mode (جملة)';
  if (pricingMode === 'Retail') {
    modeBadge.className = 'cust-mode-badge retail';
    document.documentElement.style.setProperty('--accent-active', 'var(--accent-retail)');
  } else {
    modeBadge.className = 'cust-mode-badge wholesale';
    document.documentElement.style.setProperty('--accent-active', 'var(--accent-wholesale)');
  }

  if (!activeCart || activeCart.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; color: var(--text-muted); margin-top: 4rem;">
        <i class="fa-solid fa-basket-shopping" style="font-size: 2.5rem; opacity: 0.2; display: block; margin-bottom: 1rem;"></i>
        Waiting for Cashier to scan items...
      </div>
    `;
    totalVal.innerText = '$0.00';
    return;
  }

  container.innerHTML = '';
  let total = 0;
  
  activeCart.forEach(item => {
    const itemTotal = item.price * item.quantity;
    total += itemTotal;
    
    const row = document.createElement('div');
    row.className = 'cust-cart-item';
    row.innerHTML = `
      <div class="item-details">
        <span style="font-weight: 600;">${item.name}</span>
        <span class="item-qty">Qty: ${item.quantity} x $${item.price.toFixed(2)}</span>
      </div>
      <div style="font-weight: 700;">$${itemTotal.toFixed(2)}</div>
    `;
    container.appendChild(row);
  });

  const tax = total * 0.10;
  const grandTotal = total + tax;
  
  totalVal.innerText = `$${grandTotal.toFixed(2)}`;
}

// Submit manual barcode simulation
function submitManualScan() {
  const input = document.getElementById('manual-scan-input');
  const barcode = input.value.trim();
  if (barcode === '') return;
  
  input.value = '';
  sendRemoteScan(barcode);
}

// Render quick tap list (simulates physical scans)
function renderQuickScanList() {
  const list = document.getElementById('quick-scan-list');
  list.innerHTML = '';
  
  // Show popular screen protectors and items first
  const displayProducts = products.filter(p => p.category === 'Protectors' || p.category === 'Cases').slice(0, 5);
  
  if (displayProducts.length === 0) {
    list.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 1rem; font-size: 0.8rem;">No products loaded yet</div>';
    return;
  }

  displayProducts.forEach(prod => {
    const row = document.createElement('div');
    row.className = 'scanner-quick-item';
    row.innerHTML = `
      <div class="item-info">
        <div style="font-weight: 600;">${prod.name}</div>
        <div class="prices">Retail: $${prod.retailPrice.toFixed(2)} / Wholesale: $${prod.wholesalePrice.toFixed(2)}</div>
      </div>
      <button onclick="quickScanItem('${prod.barcode}')">
        <i class="fa-solid fa-plus"></i> Scan
      </button>
    `;
    list.appendChild(row);
  });
}

function quickScanItem(barcode) {
  sendRemoteScan(barcode);
}

// Real-time camera scanner using html5-qrcode
function startCameraScanner() {
  const readerEl = document.getElementById('reader');
  const placeholderEl = document.getElementById('scanner-placeholder');
  const toggleBtn = document.getElementById('btn-toggle-scanner');
  
  readerEl.style.display = 'block';
  placeholderEl.style.display = 'none';
  toggleBtn.innerHTML = '<i class="fa-solid fa-square-stop"></i> Stop Camera';
  toggleBtn.classList.add('active');

  html5QrCode = new Html5Qrcode("reader");
  const config = { fps: 15, qrbox: { width: 250, height: 120 } };

  html5QrCode.start(
    { facingMode: "environment" },
    config,
    (decodedText, decodedResult) => {
      sendRemoteScan(decodedText);
      playBeepSound();
      stopCameraScanner();
    },
    (errorMessage) => {
      // Scan failure callback, can ignore to prevent spam log
    }
  ).catch((err) => {
    console.error("Camera scanner start failed:", err);
    const feedback = document.getElementById('scan-feedback');
    feedback.className = 'scanner-feedback error';
    feedback.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Camera Access Failed: Permission Denied.`;
    stopCameraScanner();
  });
}

function stopCameraScanner() {
  const readerEl = document.getElementById('reader');
  const placeholderEl = document.getElementById('scanner-placeholder');
  const toggleBtn = document.getElementById('btn-toggle-scanner');
  
  toggleBtn.innerHTML = '<i class="fa-solid fa-video"></i> Start Camera';
  toggleBtn.classList.remove('active');

  if (html5QrCode && html5QrCode.isScanning) {
    html5QrCode.stop().then(() => {
      readerEl.style.display = 'none';
      placeholderEl.style.display = 'flex';
      html5QrCode = null;
    }).catch(err => {
      console.error("Failed to stop camera scanner:", err);
      readerEl.style.display = 'none';
      placeholderEl.style.display = 'flex';
    });
  } else {
    readerEl.style.display = 'none';
    placeholderEl.style.display = 'flex';
  }
}

function toggleCameraScanner() {
  if (html5QrCode && html5QrCode.isScanning) {
    stopCameraScanner();
  } else {
    startCameraScanner();
  }
}

// Invoices log rendering
function renderMobileInvoices() {
  const container = document.getElementById('mobile-invoices-list');
  const countBadge = document.getElementById('mobile-invoice-count');
  
  if (!salesLogs || salesLogs.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; color: var(--text-muted); padding: 3rem 0;">
        <i class="fa-solid fa-receipt" style="font-size: 2.5rem; opacity: 0.2; display: block; margin-bottom: 1rem;"></i>
        No invoices received yet...
      </div>
    `;
    countBadge.innerText = '0';
    return;
  }
  
  countBadge.innerText = salesLogs.length;
  container.innerHTML = '';
  
  // Show in reverse chronological order
  [...salesLogs].reverse().forEach(log => {
    const date = new Date(log.timestamp);
    const timeStr = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const isRetail = log.mode === 'Retail';
    const totalQty = log.items.reduce((sum, item) => sum + item.quantity, 0);
    
    const invoiceCard = document.createElement('div');
    invoiceCard.className = 'mobile-invoice-card';
    
    let itemsHtml = '';
    log.items.forEach(item => {
      itemsHtml += `
        <div class="mobile-invoice-item-row">
          <span>${item.name} x${item.quantity}</span>
          <span>$${(item.price * item.quantity).toFixed(2)}</span>
        </div>
      `;
    });

    invoiceCard.innerHTML = `
      <div class="mobile-invoice-card-header" onclick="toggleInvoiceDetails('${log.id}')">
        <div class="header-left">
          <strong>${log.id}</strong>
          <span class="invoice-time">${timeStr}</span>
        </div>
        <div class="header-right">
          <span class="invoice-mode-badge ${isRetail ? 'retail' : 'wholesale'}">${log.mode}</span>
          <span class="invoice-total">$${log.total.toFixed(2)}</span>
          <i class="fa-solid fa-chevron-down toggle-icon" id="icon-${log.id}"></i>
        </div>
      </div>
      <div class="mobile-invoice-card-details" id="details-${log.id}" style="display: none;">
        <div style="font-size: 0.75rem; color: var(--text-muted); padding-bottom: 0.4rem; margin-bottom: 0.4rem; border-bottom: 1px dashed var(--card-border);">
          Method: <strong>${log.paymentMethod}</strong> | Qty: ${totalQty} items
        </div>
        <div class="invoice-items-list">
          ${itemsHtml}
        </div>
      </div>
    `;
    container.appendChild(invoiceCard);
  });
}

function toggleInvoiceDetails(id) {
  const details = document.getElementById(`details-${id}`);
  const icon = document.getElementById(`icon-${id}`);
  
  if (details.style.display === 'none') {
    details.style.display = 'block';
    icon.className = 'fa-solid fa-chevron-up toggle-icon';
  } else {
    details.style.display = 'none';
    icon.className = 'fa-solid fa-chevron-down toggle-icon';
  }
}

// Form scanning barcodes triggers
function startFormBarcodeScan() {
  const modal = document.getElementById('form-scan-modal');
  modal.style.display = 'flex';
  
  formHtml5QrCode = new Html5Qrcode("form-reader");
  const config = { fps: 15, qrbox: { width: 250, height: 120 } };
  
  formHtml5QrCode.start(
    { facingMode: "environment" },
    config,
    (decodedText, decodedResult) => {
      document.getElementById('add-barcode').value = decodedText;
      playBeepSound();
      stopFormBarcodeScan();
    },
    (errorMessage) => {
      // scan error callback
    }
  ).catch(err => {
    console.error("Failed to start barcode scanner inside form modal:", err);
    alert("Camera initialization failed: " + err);
    stopFormBarcodeScan();
  });
}

function stopFormBarcodeScan() {
  const modal = document.getElementById('form-scan-modal');
  modal.style.display = 'none';
  
  if (formHtml5QrCode && formHtml5QrCode.isScanning) {
    formHtml5QrCode.stop().then(() => {
      formHtml5QrCode = null;
    }).catch(err => console.error("Error stopping modal scanner:", err));
  }
}

// Product photo selection and base64 compression logic
function handleProductPhotoSelected(input) {
  const file = input.files[0];
  if (!file) return;
  
  const previewBox = document.getElementById('photo-preview-box');
  const previewImg = document.getElementById('photo-preview-img');
  const captureBtn = document.getElementById('photo-capture-btn');
  
  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
      // Resizing to max 600px width/height
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      const max_size = 600;
      
      if (width > height) {
        if (width > max_size) {
          height *= max_size / width;
          width = max_size;
        }
      } else {
        if (height > max_size) {
          width *= max_size / height;
          height = max_size;
        }
      }
      
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      
      // Convert to JPEG format with 0.7 compression ratio
      capturedPhotoBase64 = canvas.toDataURL('image/jpeg', 0.7);
      
      // Render preview
      previewImg.src = capturedPhotoBase64;
      previewBox.style.display = 'flex';
      captureBtn.style.display = 'none';
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function removeCapturedPhoto() {
  capturedPhotoBase64 = '';
  document.getElementById('product-photo-input').value = '';
  document.getElementById('photo-preview-box').style.display = 'none';
  document.getElementById('photo-capture-btn').style.display = 'block';
}

// Submit new product schema
function submitNewProduct() {
  const name = document.getElementById('add-name').value.trim();
  const barcode = document.getElementById('add-barcode').value.trim();
  const category = document.getElementById('add-category').value;
  const retailPrice = parseFloat(document.getElementById('add-retail').value);
  const wholesalePrice = parseFloat(document.getElementById('add-wholesale').value);
  const stock = parseInt(document.getElementById('add-stock').value);
  
  if (!name || !barcode || isNaN(retailPrice) || isNaN(wholesalePrice) || isNaN(stock)) {
    alert("Please complete all inputs with valid values.");
    return;
  }
  
  const productData = {
    name,
    barcode,
    category,
    retailPrice,
    wholesalePrice,
    stock,
    image: capturedPhotoBase64
  };
  
  sendRemoteCreateProduct(productData);
}

// Connection Mode and Firebase Sync helpers
function initConnectionMode() {
  if (isCloudMode && firebaseProjectId) {
    try {
      if (!firebase.apps.length) {
        firebase.initializeApp({ projectId: firebaseProjectId });
      }
      dbCloud = firebase.firestore();
      
      // Update UI Status Pill
      document.getElementById('mobile-connection-status').innerText = 'Cloud Sync';
      document.getElementById('mobile-connection-dot').style.backgroundColor = 'var(--accent-active)';
      
      // Setup Firebase real-time listeners
      setupFirebaseListeners();
      
      // Close local socket if connected
      if (socket && socket.connected) {
        socket.disconnect();
      }
    } catch (e) {
      console.error('[Firebase] Failed to initialize:', e);
      alert('Firebase Cloud Initialization failed. Switching back to Wi-Fi mode.');
      isCloudMode = false;
      localStorage.setItem('aeropos_is_cloud', 'false');
      initConnectionMode();
    }
  } else {
    // Local Wi-Fi Mode
    setupSocketListeners();
    if (socket && socket.disconnected) {
      socket.connect();
    }
    document.getElementById('mobile-connection-status').innerText = 'Wi-Fi Sync';
  }
}

function setupFirebaseListeners() {
  if (!dbCloud) return;
  
  // 1. Live Products catalog
  dbCloud.collection('products').onSnapshot((snapshot) => {
    products = [];
    snapshot.forEach(doc => {
      products.push(doc.data());
    });
    renderQuickScanList();
  }, err => console.error('Products listener error:', err));
  
  // 2. Live Invoices log
  dbCloud.collection('sales').orderBy('timestamp', 'asc').onSnapshot((snapshot) => {
    salesLogs = [];
    snapshot.forEach(doc => {
      salesLogs.push(doc.data());
    });
    renderMobileInvoices();
  }, err => console.error('Sales listener error:', err));
  
  // 3. Live Active Register Cart
  dbCloud.collection('carts').doc('active').onSnapshot((doc) => {
    if (doc.exists) {
      const serverCart = doc.data();
      activeCart = serverCart.items || [];
      pricingMode = serverCart.mode || 'Retail';
      renderCustomerCart();
    }
  }, err => console.error('Active cart listener error:', err));
}

function sendRemoteScan(barcode) {
  if (isCloudMode && dbCloud) {
    const scanId = 'scan-' + Date.now();
    dbCloud.collection('scans').doc(scanId).set({
      barcode: barcode,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    }).then(() => {
      playBeepSound();
      showScanFeedback(true, barcode);
    }).catch(err => {
      showScanFeedback(false, err.message);
    });
  } else {
    socket.emit('remote_scan', barcode);
  }
}

function sendRemoteCreateProduct(productData) {
  if (isCloudMode && dbCloud) {
    const id = 'prod-' + Date.now();
    const newProduct = {
      id: id,
      name: productData.name,
      category: productData.category,
      retailPrice: productData.retailPrice,
      wholesalePrice: productData.wholesalePrice,
      stock: productData.stock,
      barcode: productData.barcode,
      image: productData.image || ''
    };
    
    dbCloud.collection('products').doc(id).set(newProduct).then(() => {
      playBeepSound();
      alert(`Success: Product "${productData.name}" successfully created in Firestore Cloud!`);
      document.getElementById('add-product-form').reset();
      removeCapturedPhoto();
      switchMobileTab('scanner');
    }).catch(err => {
      alert(`Firebase Cloud Error: ${err.message}`);
    });
  } else {
    socket.emit('remote_create_product', productData);
  }
}

function showScanFeedback(success, detail) {
  const feedback = document.getElementById('scan-feedback');
  if (feedback) {
    if (success) {
      feedback.className = 'scanner-feedback success';
      feedback.innerHTML = `<i class="fa-solid fa-circle-check"></i> Cloud Sent: Barcode <strong>${detail}</strong> added to register.`;
    } else {
      feedback.className = 'scanner-feedback error';
      feedback.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> Cloud Error: ${detail}`;
    }
    setTimeout(() => {
      feedback.className = 'scanner-feedback';
      feedback.innerHTML = 'Align barcode in camera viewport to scan.';
    }, 2500);
  }
}

// Connection Modal Controls
let selectedTempMode = isCloudMode ? 'cloud' : 'local';

function openConnectionModal() {
  document.getElementById('connection-modal').style.display = 'flex';
  document.getElementById('firebase-project-id-input').value = firebaseProjectId;
  selectConnectionMode(isCloudMode ? 'cloud' : 'local');
}

function closeConnectionModal() {
  document.getElementById('connection-modal').style.display = 'none';
}

function selectConnectionMode(mode) {
  selectedTempMode = mode;
  const btnLocal = document.getElementById('btn-mode-local');
  const btnCloud = document.getElementById('btn-mode-cloud');
  const cloudSec = document.getElementById('cloud-config-section');
  
  if (mode === 'cloud') {
    btnCloud.style.background = 'var(--accent-active)';
    btnCloud.style.color = '#0b0f19';
    btnLocal.style.background = 'var(--bg-primary)';
    btnLocal.style.color = '#fff';
    cloudSec.style.display = 'flex';
  } else {
    btnLocal.style.background = 'var(--accent-active)';
    btnLocal.style.color = '#0b0f19';
    btnCloud.style.background = 'var(--bg-primary)';
    btnCloud.style.color = '#fff';
    cloudSec.style.display = 'none';
  }
}

function saveConnectionSettings() {
  const projInput = document.getElementById('firebase-project-id-input').value.trim();
  
  if (selectedTempMode === 'cloud' && projInput === '') {
    alert('Please enter your Firebase Project ID to connect cloud mode.');
    return;
  }
  
  isCloudMode = (selectedTempMode === 'cloud');
  firebaseProjectId = projInput;
  
  localStorage.setItem('aeropos_is_cloud', isCloudMode ? 'true' : 'false');
  localStorage.setItem('aeropos_project_id', firebaseProjectId);
  
  closeConnectionModal();
  initConnectionMode();
}

// Admin Security authentication helpers
function checkAdminLoginStatus() {
  const isLogged = localStorage.getItem('aeropos_logged_in') === 'true';
  const panel = document.getElementById('mobile-login-panel');
  if (panel) {
    if (isLogged) {
      panel.style.display = 'none';
    } else {
      panel.style.display = 'flex';
    }
  }
}

function handleAdminLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pass = document.getElementById('login-password').value.trim();
  
  // Default login credentials
  const defaultEmail = 'admin@aeropos.com';
  const defaultPass = 'admin';
  
  if (email === defaultEmail && pass === defaultPass) {
    localStorage.setItem('aeropos_logged_in', 'true');
    checkAdminLoginStatus();
    playBeepSound();
  } else {
    alert('Invalid Email or Password / خطأ في البريد الإلكتروني أو كلمة المرور');
  }
}

function handleAdminLogout() {
  localStorage.removeItem('aeropos_logged_in');
  closeConnectionModal();
  checkAdminLoginStatus();
}
