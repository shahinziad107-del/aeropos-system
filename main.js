const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

// Start the Express and Socket.io server in the background
const server = require('./server.js');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 768,
    fullscreen: true,
    kiosk: true, // Lock screen in Kiosk Mode (no taskbar, no window controls)
    alwaysOnTop: true, // Prevent other apps from going on top
    frame: false, // Hide top title bar
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false, // Allow simple access to Electron APIs from client JS
    }
  });

  // Load the local POS cashier web application
  mainWindow.loadURL('http://localhost:3000');

  // Prevent Alt+F4 or direct window closing by default
  mainWindow.on('close', (e) => {
    // If not triggered by our secure exit call, prevent default behavior
    if (!app.isQuitting) {
      e.preventDefault();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Handle IPC exit command sent from client when admin enters the correct password
ipcMain.on('exit-system', () => {
  app.isQuitting = true;
  app.quit();
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
