// DOM Elements
const tabButtons = document.querySelectorAll('.tab-button');
const tabPanes = document.querySelectorAll('.tab-pane');

// Download Tab
const startDownloadBtn = document.getElementById('start-download');
const cancelDownloadBtn = document.getElementById('cancel-download');
const openFolderBtn = document.getElementById('open-folder');
const statusCard = document.getElementById('status-card');
const statusMessage = document.getElementById('status-message');
const progressContainer = document.querySelector('.progress-container');
const progressFill = document.querySelector('.progress-fill');
const progressText = document.querySelector('.progress-text');
const successCount = document.getElementById('success-count');
const errorCount = document.getElementById('error-count');

// Settings Tab
const downloadDirInput = document.getElementById('download-dir');
const selectDirBtn = document.getElementById('select-dir');
const delayInput = document.getElementById('delay');
const maxRecordingsInput = document.getElementById('max-recordings');
const headlessCheckbox = document.getElementById('headless');
const useExistingProfileCheckbox = document.getElementById('use-existing-profile');
const saveSettingsBtn = document.getElementById('save-settings');
const resetSettingsBtn = document.getElementById('reset-settings');

// Default settings
const defaultSettings = {
  downloadDir: '',
  delay: 1000,
  maxRecordings: -1,
  headless: false,
  useExistingProfile: true // Default to using existing profile for better passkey support
};

// Current settings
let currentSettings = { ...defaultSettings };

// Download state
let isDownloading = false;

// Initialize the app
async function init() {
  // Set up tab switching
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      // Remove active class from all buttons and panes
      tabButtons.forEach(btn => btn.classList.remove('active'));
      tabPanes.forEach(pane => pane.classList.remove('active'));

      // Add active class to clicked button and corresponding pane
      button.classList.add('active');
      const tabId = button.dataset.tab;
      document.getElementById(tabId).classList.add('active');
    });
  });

  // Load settings
  await loadSettings();

  // Set up event listeners
  setupEventListeners();

  // Set up download status listener
  setupDownloadStatusListener();
}

// Load settings from the main process
async function loadSettings() {
  try {
    const settings = await window.api.getSettings();
    currentSettings = { ...settings };

    // Update UI with settings
    downloadDirInput.value = settings.downloadDir;
    delayInput.value = settings.delay;
    maxRecordingsInput.value = settings.maxRecordings;
    headlessCheckbox.checked = settings.headless;
    useExistingProfileCheckbox.checked = settings.useExistingProfile !== false; // Default to true if not set
  } catch (error) {
    showError('Failed to load settings: ' + error.message);
  }
}

// Save settings to the main process
async function saveSettings() {
  try {
    // Get values from UI
    const settings = {
      downloadDir: downloadDirInput.value,
      delay: parseInt(delayInput.value),
      maxRecordings: parseInt(maxRecordingsInput.value),
      headless: headlessCheckbox.checked,
      useExistingProfile: useExistingProfileCheckbox.checked
    };

    // Validate settings
    if (!settings.downloadDir) {
      showError('Please select a download directory');
      return;
    }

    if (isNaN(settings.delay) || settings.delay < 500) {
      showError('Delay must be at least 500ms');
      return;
    }

    if (isNaN(settings.maxRecordings)) {
      showError('Maximum recordings must be a number');
      return;
    }

    // Save settings
    const result = await window.api.saveSettings(settings);

    if (result.success) {
      currentSettings = { ...settings };
      showMessage('Settings saved successfully');
    } else {
      showError('Failed to save settings: ' + result.error);
    }
  } catch (error) {
    showError('Failed to save settings: ' + error.message);
  }
}

// Reset settings to defaults
async function resetSettings() {
  try {
    const result = await window.api.saveSettings(defaultSettings);

    if (result.success) {
      currentSettings = { ...defaultSettings };

      // Update UI with default settings
      downloadDirInput.value = defaultSettings.downloadDir;
      delayInput.value = defaultSettings.delay;
      maxRecordingsInput.value = defaultSettings.maxRecordings;
      headlessCheckbox.checked = defaultSettings.headless;
      useExistingProfileCheckbox.checked = defaultSettings.useExistingProfile;

      showMessage('Settings reset to defaults');
    } else {
      showError('Failed to reset settings: ' + result.error);
    }
  } catch (error) {
    showError('Failed to reset settings: ' + error.message);
  }
}

// Select download directory
async function selectDirectory() {
  try {
    const dir = await window.api.selectDirectory();

    if (dir) {
      downloadDirInput.value = dir;
    }
  } catch (error) {
    showError('Failed to select directory: ' + error.message);
  }
}

// Start download process
async function startDownload() {
  try {
    // Validate settings
    if (!currentSettings.downloadDir) {
      showError('Please select a download directory in Settings');
      return;
    }

    // Update UI
    isDownloading = true;
    startDownloadBtn.disabled = true;
    cancelDownloadBtn.disabled = false;
    statusCard.style.display = 'block';
    statusMessage.textContent = 'Starting download process...';
    progressContainer.style.display = 'none';
    successCount.style.display = 'none';
    errorCount.style.display = 'none';

    // Start download
    const result = await window.api.startDownload(currentSettings);

    if (!result.success) {
      showError('Failed to start download: ' + result.error);
      resetDownloadUI();
    }
  } catch (error) {
    showError('Failed to start download: ' + error.message);
    resetDownloadUI();
  }
}

// Cancel download process
async function cancelDownload() {
  try {
    const result = await window.api.cancelDownload();

    if (result.success) {
      statusMessage.textContent = 'Download canceled';
      resetDownloadUI();
    } else {
      showError('Failed to cancel download: ' + result.error);
    }
  } catch (error) {
    showError('Failed to cancel download: ' + error.message);
  }
}

// Open download directory
async function openDownloadDir() {
  try {
    const result = await window.api.openDownloadDir();

    if (!result.success) {
      showError('Failed to open download directory: ' + result.error);
    }
  } catch (error) {
    showError('Failed to open download directory: ' + error.message);
  }
}

// Set up event listeners
function setupEventListeners() {
  // Download Tab
  startDownloadBtn.addEventListener('click', startDownload);
  cancelDownloadBtn.addEventListener('click', cancelDownload);
  openFolderBtn.addEventListener('click', openDownloadDir);

  // Settings Tab
  selectDirBtn.addEventListener('click', selectDirectory);
  saveSettingsBtn.addEventListener('click', saveSettings);
  resetSettingsBtn.addEventListener('click', resetSettings);
}

// Set up download status listener
function setupDownloadStatusListener() {
  window.api.onDownloadStatus((status) => {
    // Update status message
    statusMessage.textContent = status.message;

    // Update progress bar if total is available
    if (status.total && status.total > 0) {
      progressContainer.style.display = 'block';
      const percent = (status.current / status.total) * 100;
      progressFill.style.width = `${percent}%`;
      progressText.textContent = `${status.current} / ${status.total}`;
    }

    // Update success and error counts
    if (status.success !== undefined) {
      successCount.style.display = 'block';
      successCount.querySelector('span').textContent = status.success;
    }

    if (status.error !== undefined) {
      errorCount.style.display = 'block';
      errorCount.querySelector('span').textContent = status.error;
    }

    // Handle status changes
    switch (status.status) {
      case 'complete':
        resetDownloadUI();
        break;
      case 'error':
        resetDownloadUI();
        break;
      case 'canceled':
        resetDownloadUI();
        break;
    }
  });
}

// Reset download UI
function resetDownloadUI() {
  isDownloading = false;
  startDownloadBtn.disabled = false;
  cancelDownloadBtn.disabled = true;
}

// Show error message
function showError(message) {
  // For now, just use alert
  alert('Error: ' + message);
}

// Show message
function showMessage(message) {
  // For now, just use alert
  alert(message);
}

// Initialize the app when the DOM is loaded
document.addEventListener('DOMContentLoaded', init);

// Clean up event listeners when the window is closed
window.addEventListener('beforeunload', () => {
  window.api.removeAllListeners();
});
