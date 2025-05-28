const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const log = require('electron-log');

// Configure logging
log.transports.file.level = 'info';
log.transports.console.level = 'debug';
log.info('App starting...');

// Simple settings storage using a JSON file
const settingsPath = path.join(app.getPath('userData'), 'settings.json');
let settings = {
  downloadDir: path.join(app.getPath('downloads'), 'PlaudAudio'),
  delay: 1000,
  maxRecordings: -1,
  headless: false,
  useExistingProfile: true // Default to using existing profile for better passkey support
};

// Load settings from file if it exists
function loadSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf8');
      const loadedSettings = JSON.parse(data);
      settings = { ...settings, ...loadedSettings };
      log.info('Settings loaded from file');
    } else {
      log.info('No settings file found, using defaults');
      saveSettings();
    }
  } catch (error) {
    log.error('Error loading settings:', error);
  }
}

// Save settings to file
function saveSettings() {
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    log.info('Settings saved to file');
  } catch (error) {
    log.error('Error saving settings:', error);
  }
}

// Load settings on startup
loadSettings();

// Keep a global reference of the window object to avoid garbage collection
let mainWindow;

// Create the browser window
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'assets/icon.png')
  });

  // Load the index.html file
  mainWindow.loadFile('index.html');

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  // Window closed event
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Create window when Electron is ready
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle IPC messages from the renderer process

// Get settings
ipcMain.handle('get-settings', async () => {
  return { ...settings };
});

// Save settings
ipcMain.handle('save-settings', async (event, newSettings) => {
  try {
    settings = { ...settings, ...newSettings };
    saveSettings();
    return { success: true };
  } catch (error) {
    log.error('Error saving settings:', error);
    return { success: false, error: error.message };
  }
});

// Select download directory
ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Download Directory'
  });

  if (!result.canceled && result.filePaths.length > 0) {
    settings.downloadDir = result.filePaths[0];
    saveSettings();
    return result.filePaths[0];
  }
  return null;
});

// Start the download process
ipcMain.handle('start-download', async (event, newSettings) => {
  try {
    // Save the current settings
    settings = { ...settings, ...newSettings };
    saveSettings();

    // Create the download directory if it doesn't exist
    if (!fs.existsSync(settings.downloadDir)) {
      fs.mkdirSync(settings.downloadDir, { recursive: true });
    }

    // Import the downloader module
    const { startDownload } = require('./downloader');

    // Start the download process
    const downloadProcess = startDownload(settings, (status) => {
      // Send status updates to the renderer
      if (mainWindow) {
        mainWindow.webContents.send('download-status', status);
      }
    });

    // Return a success message
    return { success: true };
  } catch (error) {
    log.error('Error starting download:', error);
    return { success: false, error: error.message };
  }
});

// Cancel the download process
ipcMain.handle('cancel-download', async () => {
  try {
    // Import the downloader module
    const { cancelDownload } = require('./downloader');

    // Cancel the download process
    cancelDownload();

    // Return a success message
    return { success: true };
  } catch (error) {
    log.error('Error canceling download:', error);
    return { success: false, error: error.message };
  }
});

// Open the download directory
ipcMain.handle('open-download-dir', async () => {
  try {
    const downloadDir = settings.downloadDir;
    if (fs.existsSync(downloadDir)) {
      // Open the directory in the file explorer
      shell.openPath(downloadDir);
      return { success: true };
    } else {
      return { success: false, error: 'Download directory does not exist' };
    }
  } catch (error) {
    log.error('Error opening download directory:', error);
    return { success: false, error: error.message };
  }
});
