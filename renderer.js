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

// Share Downloader Tab
const shareUrlsTextarea = document.getElementById('shareUrls');
const downloadShareBtn = document.getElementById('downloadShareBtn');
const clearShareBtn = document.getElementById('clearShareBtn');
const shareStatus = document.getElementById('shareStatus');
const shareProgress = document.getElementById('shareProgress');
const shareProgressBar = document.getElementById('shareProgressBar');
const shareProgressText = document.getElementById('shareProgressText');
const shareResults = document.getElementById('shareResults');

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
let isDownloadingShare = false;

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

  // Share Downloader Tab
  downloadShareBtn.addEventListener('click', startShareDownload);
  clearShareBtn.addEventListener('click', clearShareDownloader);
}

// Share Downloader Functions
async function startShareDownload() {
  if (isDownloadingShare) return;

  const urlsText = shareUrlsTextarea.value.trim();
  if (!urlsText) {
    updateShareStatus('Please enter at least one share URL', 'error');
    return;
  }

  const urls = urlsText.split('\n')
    .map(url => url.trim())
    .filter(url => url.length > 0);

  if (urls.length === 0) {
    updateShareStatus('No valid URLs found', 'error');
    return;
  }

  isDownloadingShare = true;
  downloadShareBtn.disabled = true;
  shareResults.innerHTML = '';
  shareResults.style.display = 'none';

  updateShareStatus(`Starting download of ${urls.length} file(s)...`, 'processing');

  try {
    const results = await window.api.downloadShareAudio(urls);

    // Update results
    shareResults.style.display = 'block';
    shareResults.innerHTML = '';
    
    results.forEach(result => {
      const resultItem = document.createElement('div');
      resultItem.className = `result-item ${result.success ? 'result-success' : 'result-error'}`;
      if (result.success) {
        resultItem.textContent = `✓ ${result.shareUrl}: Downloaded successfully`;
      } else {
        resultItem.textContent = `✗ ${result.shareUrl}: ${result.error}`;
      }
      shareResults.appendChild(resultItem);
    });

    // Summary
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    if (failed === 0) {
      updateShareStatus(`All ${successful} file(s) downloaded successfully!`, 'success');
    } else if (successful === 0) {
      updateShareStatus(`All ${failed} downloads failed`, 'error');
    } else {
      updateShareStatus(`Downloaded ${successful} file(s), ${failed} failed`, 'warning');
    }

  } catch (error) {
    updateShareStatus(`Error: ${error.message}`, 'error');
  } finally {
    isDownloadingShare = false;
    downloadShareBtn.disabled = false;
    shareProgress.style.display = 'none';
  }
}

function clearShareDownloader() {
  shareUrlsTextarea.value = '';
  shareStatus.style.display = 'none';
  shareResults.style.display = 'none';
  shareResults.innerHTML = '';
  shareProgress.style.display = 'none';
}

function updateShareStatus(message, type = 'processing') {
  shareStatus.textContent = message;
  shareStatus.className = 'status-message';
  
  if (type === 'error') {
    shareStatus.style.color = '#721c24';
    shareStatus.style.backgroundColor = '#f8d7da';
  } else if (type === 'success') {
    shareStatus.style.color = '#155724';
    shareStatus.style.backgroundColor = '#d4edda';
  } else if (type === 'warning') {
    shareStatus.style.color = '#856404';
    shareStatus.style.backgroundColor = '#fff3cd';
  } else {
    shareStatus.style.color = '#004085';
    shareStatus.style.backgroundColor = '#d1ecf1';
  }
  
  shareStatus.style.display = 'block';
}

function updateShareProgress(current, total) {
  shareProgress.style.display = 'block';
  const percentage = Math.round((current / total) * 100);
  shareProgressBar.style.width = percentage + '%';
  shareProgressText.textContent = `${percentage}% (${current}/${total})`;
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

  // Listen for share download progress updates
  window.api.onDownloadProgress((data) => {
    updateShareProgress(data.current, data.total);
    updateShareStatus(`Downloading file ${data.current} of ${data.total}...`, 'processing');
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
