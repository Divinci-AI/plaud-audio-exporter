const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');
const log = require('electron-log');

// Global state
let isRunning = false;
let shouldCancel = false;
let browser = null;
let context = null;
let page = null;

// Function to start the download process
async function startDownload(settings, statusCallback) {
  if (isRunning) {
    log.warn('Download process already running');
    return;
  }

  isRunning = true;
  shouldCancel = false;

  // Send initial status
  statusCallback({
    status: 'starting',
    message: 'Starting download process...'
  });

  try {
    // Launch the browser
    log.info('Launching browser');
    statusCallback({
      status: 'launching',
      message: 'Launching browser...'
    });

    // Check if we should use an existing browser profile
    const useExistingProfile = settings.useExistingProfile;

    if (useExistingProfile) {
      log.info('Using existing browser profile');
      statusCallback({
        status: 'launching',
        message: 'Launching browser with existing profile...'
      });

      // On macOS, use the default Chromium/Chrome profile location
      let userDataDir;

      if (process.platform === 'darwin') {
        // For macOS, try to use the Chrome profile first, then Brave if available
        const homeDir = os.homedir();
        const chromeProfilePath = path.join(homeDir, 'Library/Application Support/Google/Chrome');
        const braveProfilePath = path.join(homeDir, 'Library/Application Support/BraveSoftware/Brave-Browser');

        if (fs.existsSync(braveProfilePath)) {
          userDataDir = braveProfilePath;
          log.info('Using Brave browser profile');
        } else if (fs.existsSync(chromeProfilePath)) {
          userDataDir = chromeProfilePath;
          log.info('Using Chrome browser profile');
        } else {
          log.warn('No existing browser profile found, using default settings');
          userDataDir = undefined;
        }
      }

      if (userDataDir) {
        // Create a unique temporary directory for the persistent context
        const timestamp = new Date().getTime();
        const randomString = Math.random().toString(36).substring(2, 10);
        const tempUserDataDir = path.join(settings.downloadDir, `temp-browser-profile-${timestamp}-${randomString}`);

        // Clean up any existing temp profile directories
        try {
          const downloadDir = settings.downloadDir;
          if (fs.existsSync(downloadDir)) {
            const files = fs.readdirSync(downloadDir);
            for (const file of files) {
              if (file.startsWith('temp-browser-profile-')) {
                const tempDir = path.join(downloadDir, file);
                log.info(`Cleaning up old browser profile: ${tempDir}`);
                try {
                  // Use rimraf-like recursive deletion
                  deleteDirectory(tempDir);
                } catch (cleanupError) {
                  log.warn(`Failed to clean up directory ${tempDir}: ${cleanupError.message}`);
                }
              }
            }
          }
        } catch (error) {
          log.warn(`Error cleaning up old profiles: ${error.message}`);
        }

        // Create the new temp directory
        if (!fs.existsSync(tempUserDataDir)) {
          fs.mkdirSync(tempUserDataDir, { recursive: true });
        }

        // Launch a persistent context instead of a browser
        log.info(`Launching persistent context with temp profile at ${tempUserDataDir}`);
        context = await chromium.launchPersistentContext(tempUserDataDir, {
          headless: settings.headless,
          downloadsPath: path.resolve(settings.downloadDir),
          viewport: { width: 1280, height: 800 },
          acceptDownloads: true
        });

        // Set up download handler to ensure files are saved with .mp3 extension
        await setupDownloadHandler(context, settings);

        // Get the browser from the context
        browser = context.browser();
      } else {
        // Fall back to default launch if no profile found
        browser = await chromium.launch({
          headless: settings.headless,
          downloadsPath: path.resolve(settings.downloadDir)
        });

        // Create a new context with download permissions
        context = await browser.newContext({
          acceptDownloads: true,
          viewport: { width: 1280, height: 800 }
        });

        // Set up download handler to ensure files are saved with .mp3 extension
        await setupDownloadHandler(context, settings);
      }
    } else {
      // Launch with default settings
      browser = await chromium.launch({
        headless: settings.headless,
        downloadsPath: path.resolve(settings.downloadDir)
      });

      // Create a new context with download permissions
      context = await browser.newContext({
        acceptDownloads: true,
        viewport: { width: 1280, height: 800 }
      });

      // Set up download handler to ensure files are saved with .mp3 extension
      await setupDownloadHandler(context, settings);
    }

    // Set timeouts
    context.setDefaultNavigationTimeout(60000);
    context.setDefaultTimeout(30000);

    // Create a new page
    page = await context.newPage();

    // Navigate to the app
    log.info(`Navigating to https://app.plaud.ai`);
    statusCallback({
      status: 'navigating',
      message: 'Navigating to app.plaud.ai...'
    });

    await page.goto('https://app.plaud.ai');

    // Wait for the user to log in and navigate to recordings
    log.info('Waiting for login and navigation');

    // Provide different messages based on whether we're using an existing profile
    if (settings.useExistingProfile) {
      statusCallback({
        status: 'waiting_login',
        message: 'Please log in to app.plaud.ai and navigate to the recordings page. Using your existing browser profile for better passkey support. A blue dialog will appear in the browser window with an "I\'m Ready" button you can click when you\'re on the recordings page.'
      });
    } else {
      statusCallback({
        status: 'waiting_login',
        message: 'Please log in to app.plaud.ai and navigate to the recordings page. If you have trouble with Apple Passkey login, try enabling "Use existing browser profile" in Settings. A blue dialog will appear in the browser window with an "I\'m Ready" button you can click when you\'re on the recordings page.'
      });
    }

    // Wait for recordings to appear or for the user to signal they're ready
    await waitForRecordings(page, settings, statusCallback);

    if (shouldCancel) {
      throw new Error('Download process canceled');
    }

    // Find recordings
    log.info('Looking for recordings');
    statusCallback({
      status: 'finding',
      message: 'Looking for recordings...'
    });

    const recordings = await findRecordings(page);

    if (recordings.length === 0) {
      throw new Error('No recordings found. Please check if you are on the correct page.');
    }

    log.info(`Found ${recordings.length} recordings`);
    statusCallback({
      status: 'found',
      message: `Found ${recordings.length} recordings`,
      total: recordings.length
    });

    // Determine how many recordings to export
    const count = settings.maxRecordings > 0 ?
      Math.min(settings.maxRecordings, recordings.length) :
      recordings.length;

    log.info(`Will export ${count} recordings`);
    statusCallback({
      status: 'exporting',
      message: `Will export ${count} recordings`,
      total: count,
      current: 0
    });

    // Export each recording
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < count; i++) {
      if (shouldCancel) {
        throw new Error('Download process canceled');
      }

      try {
        log.info(`Processing recording ${i + 1} of ${count}`);
        statusCallback({
          status: 'processing',
          message: `Processing recording ${i + 1} of ${count}`,
          total: count,
          current: i + 1
        });

        // Click on the recording
        log.debug(`Clicking on recording ${i + 1}`);
        await recordings[i].click();
        await wait(settings.delay);

        // Find and click the download button
        log.debug('Looking for download button');
        const downloaded = await clickDownloadButton(page, settings);

        if (downloaded) {
          log.info(`Successfully initiated download for recording ${i + 1}`);
          statusCallback({
            status: 'downloading',
            message: `Successfully initiated download for recording ${i + 1}`,
            total: count,
            current: i + 1
          });
          successCount++;

          // Wait for the download to complete
          log.debug('Waiting for download to complete');
          // We don't need to wait here as the download handler will take care of it
          // Just add a small delay to ensure UI updates
          await wait(settings.delay / 2);
        } else {
          log.error(`Could not find download button for recording ${i + 1}`);
          statusCallback({
            status: 'error',
            message: `Could not find download button for recording ${i + 1}`,
            total: count,
            current: i + 1
          });
          errorCount++;
        }

        // Go back to the recordings list if needed
        const isOnListPage = await isOnRecordingsList(page);
        if (!isOnListPage) {
          log.debug('Navigating back to recordings list');
          await navigateToRecordingsList(page, settings);
          await wait(settings.delay);

          // Refresh the recordings list
          const newRecordings = await findRecordings(page);
          if (newRecordings.length > 0) {
            recordings.splice(0, recordings.length, ...newRecordings);
          }
        }
      } catch (error) {
        log.error(`Error processing recording ${i + 1}: ${error.message}`);
        statusCallback({
          status: 'error',
          message: `Error processing recording ${i + 1}: ${error.message}`,
          total: count,
          current: i + 1
        });
        errorCount++;

        // Try to get back to the recordings list
        try {
          await navigateToRecordingsList(page, settings);
          await wait(settings.delay);

          // Refresh the recordings list
          const newRecordings = await findRecordings(page);
          if (newRecordings.length > 0) {
            recordings.splice(0, recordings.length, ...newRecordings);
          }
        } catch (navError) {
          log.error(`Error navigating back to recordings list: ${navError.message}`);
          break;
        }
      }
    }

    // Check for any files without .mp3 extension and rename them
    try {
      log.info('Checking for files without .mp3 extension...');
      const files = fs.readdirSync(settings.downloadDir);
      let renamedCount = 0;

      for (const file of files) {
        const filePath = path.join(settings.downloadDir, file);

        // Skip directories and files that already have .mp3 extension
        if (fs.statSync(filePath).isDirectory() || file.toLowerCase().endsWith('.mp3')) {
          continue;
        }

        // Check if it's a UUID-like filename
        const isUuid = file.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

        // Generate a new filename
        let newFilename;
        if (isUuid) {
          // For UUID files, use a more descriptive name with timestamp
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          newFilename = `plaud-recording-${timestamp}.mp3`;
        } else {
          // For other files, just add .mp3 extension
          newFilename = `${file}.mp3`;
        }

        const newFilePath = path.join(settings.downloadDir, newFilename);

        // Rename the file
        log.info(`Renaming file without extension: ${file} -> ${newFilename}`);
        fs.renameSync(filePath, newFilePath);
        renamedCount++;
      }

      if (renamedCount > 0) {
        log.info(`Renamed ${renamedCount} files to add .mp3 extension`);
      }
    } catch (error) {
      log.error(`Error checking for files without extension: ${error.message}`);
    }

    // Log summary
    log.info('Export complete!');
    log.info(`Successfully exported: ${successCount}`);
    log.info(`Errors: ${errorCount}`);

    statusCallback({
      status: 'complete',
      message: 'Export complete!',
      total: count,
      success: successCount,
      error: errorCount
    });

  } catch (error) {
    log.error(`Error: ${error.message}`);
    statusCallback({
      status: 'error',
      message: `Error: ${error.message}`
    });
  } finally {
    isRunning = false;

    // Close the browser if headless
    if (settings.headless && browser) {
      log.info('Closing browser');
      await browser.close();
      browser = null;
      context = null;
      page = null;
    } else if (browser) {
      log.info('Keeping browser open for inspection');
      statusCallback({
        status: 'browser_open',
        message: 'Browser is kept open for inspection. You can close it manually.'
      });
    }

    // Close the file watcher if it exists
    if (global.fileWatcher) {
      log.info('Closing file watcher');
      global.fileWatcher.close();
      global.fileWatcher = null;
    }

    // Clean up any temporary browser profile directories
    try {
      const downloadDir = settings.downloadDir;
      if (fs.existsSync(downloadDir)) {
        const files = fs.readdirSync(downloadDir);
        for (const file of files) {
          if (file.startsWith('temp-browser-profile-')) {
            const tempDir = path.join(downloadDir, file);
            log.info(`Cleaning up browser profile: ${tempDir}`);
            try {
              deleteDirectory(tempDir);
            } catch (cleanupError) {
              log.warn(`Failed to clean up directory ${tempDir}: ${cleanupError.message}`);
            }
          }
        }
      }
    } catch (error) {
      log.warn(`Error cleaning up profiles: ${error.message}`);
    }
  }
}

// Function to cancel the download process
function cancelDownload() {
  if (!isRunning) {
    log.warn('No download process running');
    return;
  }

  log.info('Canceling download process');
  shouldCancel = true;

  // Close the browser if it's open
  if (browser) {
    log.info('Closing browser');
    browser.close().catch(error => {
      log.error(`Error closing browser: ${error.message}`);
    });
    browser = null;
    context = null;
    page = null;
  }

  // Close the file watcher if it exists
  if (global.fileWatcher) {
    log.info('Closing file watcher');
    global.fileWatcher.close();
    global.fileWatcher = null;
  }

  // Clean up any temporary browser profile directories
  try {
    // We don't have access to settings here, so we'll use a common location
    const downloadDirs = [
      path.join(os.homedir(), 'Downloads', 'PlaudAudio'),
      path.join(os.tmpdir(), 'PlaudAudio')
    ];

    for (const dir of downloadDirs) {
      if (fs.existsSync(dir)) {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          if (file.startsWith('temp-browser-profile-')) {
            const tempDir = path.join(dir, file);
            log.info(`Cleaning up browser profile: ${tempDir}`);
            try {
              deleteDirectory(tempDir);
            } catch (cleanupError) {
              log.warn(`Failed to clean up directory ${tempDir}: ${cleanupError.message}`);
            }
          }
        }
      }
    }
  } catch (error) {
    log.warn(`Error cleaning up profiles: ${error.message}`);
  }
}

// Helper function to wait for a specified time
async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Helper function to recursively delete a directory
function deleteDirectory(dirPath) {
  if (fs.existsSync(dirPath)) {
    fs.readdirSync(dirPath).forEach(file => {
      const curPath = path.join(dirPath, file);
      if (fs.lstatSync(curPath).isDirectory()) {
        // Recursive call for directories
        deleteDirectory(curPath);
      } else {
        // Delete file
        fs.unlinkSync(curPath);
      }
    });
    // Delete the empty directory
    fs.rmdirSync(dirPath);
  }
}

// Function to set up download handler to ensure files are saved with .mp3 extension
async function setupDownloadHandler(context, settings) {
  // Make sure the download directory exists
  if (!fs.existsSync(settings.downloadDir)) {
    log.info(`Creating download directory: ${settings.downloadDir}`);
    fs.mkdirSync(settings.downloadDir, { recursive: true });
  }

  // Set up a file watcher to rename files without extensions
  const watcher = fs.watch(settings.downloadDir, (eventType, filename) => {
    if (eventType === 'rename' && filename) {
      try {
        // Check if this is a new file without an extension or with a UUID-like name
        const filePath = path.join(settings.downloadDir, filename);

        // Only process if it's a file (not a directory) and doesn't end with .mp3
        if (fs.existsSync(filePath) &&
            fs.statSync(filePath).isFile() &&
            !filename.toLowerCase().endsWith('.mp3')) {

          // Check if it's a UUID-like filename
          const isUuid = filename.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

          // Generate a new filename
          let newFilename;
          if (isUuid) {
            // For UUID files, use a more descriptive name with timestamp
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            newFilename = `plaud-recording-${timestamp}.mp3`;
          } else {
            // For other files, just add .mp3 extension
            newFilename = `${filename}.mp3`;
          }

          const newFilePath = path.join(settings.downloadDir, newFilename);

          // Rename the file
          log.info(`Renaming file without extension: ${filename} -> ${newFilename}`);
          fs.renameSync(filePath, newFilePath);
        }
      } catch (error) {
        log.error(`Error in file watcher: ${error.message}`);
      }
    }
  });

  // Store the watcher in a global variable so we can close it later
  global.fileWatcher = watcher;

  // Listen for download events
  context.on('download', async download => {
    try {
      log.info(`Download started: ${download.suggestedFilename()}`);

      // Get the suggested filename
      let filename = download.suggestedFilename() || 'recording.mp3';

      // Generate a timestamp for unique filenames
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

      // If the filename is a UUID or doesn't have an extension, use a more descriptive name
      if (filename.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i) ||
          !filename.includes('.')) {
        filename = `plaud-recording-${timestamp}.mp3`;
        log.info(`Using generated filename: ${filename}`);
      } else if (!filename.toLowerCase().endsWith('.mp3')) {
        // Remove any existing extension
        const baseName = filename.includes('.') ?
          filename.substring(0, filename.lastIndexOf('.')) :
          filename;

        // Add .mp3 extension
        filename = `${baseName}.mp3`;
        log.info(`Added .mp3 extension: ${filename}`);
      }

      // Create the full path
      const downloadPath = path.join(settings.downloadDir, filename);

      log.info(`Saving download to: ${downloadPath}`);

      try {
        // Save the file
        await download.saveAs(downloadPath);

        // Verify the file was saved
        if (fs.existsSync(downloadPath)) {
          const stats = fs.statSync(downloadPath);
          log.info(`Download completed: ${filename} (${stats.size} bytes)`);

          // If the file size is 0, it might be an error
          if (stats.size === 0) {
            log.warn(`Downloaded file has 0 bytes: ${downloadPath}`);
          }
        } else {
          log.error(`File not found after download: ${downloadPath}`);

          // Try to find the file without extension
          const basePathWithoutExt = downloadPath.substring(0, downloadPath.lastIndexOf('.'));
          if (fs.existsSync(basePathWithoutExt)) {
            log.info(`Found file without extension: ${basePathWithoutExt}`);

            // Rename the file to add the .mp3 extension
            fs.renameSync(basePathWithoutExt, downloadPath);
            log.info(`Renamed file to add .mp3 extension: ${downloadPath}`);
          } else {
            // Try to save to a different location as a fallback
            const fallbackPath = path.join(os.homedir(), 'Downloads', filename);
            log.info(`Trying fallback location: ${fallbackPath}`);
            await download.saveAs(fallbackPath);
          }
        }
      } catch (saveError) {
        log.error(`Error saving file: ${saveError.message}`);

        // Try to save to a different location as a fallback
        try {
          const fallbackPath = path.join(os.homedir(), 'Downloads', filename);
          log.info(`Trying fallback location: ${fallbackPath}`);
          await download.saveAs(fallbackPath);
        } catch (fallbackError) {
          log.error(`Error saving to fallback location: ${fallbackError.message}`);
        }
      }
    } catch (error) {
      log.error(`Error handling download: ${error.message}`);
    }
  });
}

// Function to wait for recordings to appear
async function waitForRecordings(page, settings, statusCallback) {
  const selectors = [
    'li[draggable="true"]',
    '.vue-recycle-scroller__item-view li',
    '.fileInfo'
  ];

  log.info('Waiting for recordings to appear on the page...');

  // Create a dialog to let the user signal when they're ready
  await page.evaluate(() => {
    // Only create the dialog if it doesn't exist yet
    if (!document.getElementById('plaud-downloader-ready-dialog')) {
      const dialog = document.createElement('div');
      dialog.id = 'plaud-downloader-ready-dialog';
      dialog.style.position = 'fixed';
      dialog.style.top = '20px';
      dialog.style.right = '20px';
      dialog.style.backgroundColor = '#4a6fa5';
      dialog.style.color = 'white';
      dialog.style.padding = '15px';
      dialog.style.borderRadius = '5px';
      dialog.style.zIndex = '9999';
      dialog.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
      dialog.style.maxWidth = '300px';

      dialog.innerHTML = `
        <h3 style="margin-top: 0; margin-bottom: 10px;">Plaud Audio Downloader</h3>
        <p style="margin-bottom: 10px;">Please navigate to your recordings page, then click the button below:</p>
        <p style="margin-bottom: 10px; font-size: 12px;">If you have trouble with Apple Passkey login, try using your regular browser first, then restart the app with "Use existing browser profile" enabled in Settings.</p>
        <button id="plaud-downloader-ready-button" style="background-color: white; color: #4a6fa5; border: none; padding: 8px 15px; border-radius: 3px; cursor: pointer; font-weight: bold;">I'm Ready</button>
      `;

      document.body.appendChild(dialog);
    }
  });

  // Set up a flag to track if the user has clicked the ready button
  let userReady = false;

  // Set up a listener for the ready button
  await page.exposeFunction('notifyUserReady', () => {
    userReady = true;
  });

  // Add click handler to the button
  await page.evaluate(() => {
    document.getElementById('plaud-downloader-ready-button').addEventListener('click', () => {
      window.notifyUserReady();
      document.getElementById('plaud-downloader-ready-dialog').style.display = 'none';
    });
  });

  // Wait for either the user to click the ready button or for recordings to appear
  const maxAttempts = 300; // Increase to 5 minutes (300 seconds)

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (shouldCancel) {
      throw new Error('Download process canceled');
    }

    // Check if the user has clicked the ready button
    if (userReady) {
      log.info('User indicated they are ready');
      // Give a short delay for any page transitions to complete
      await wait(1000);
      break;
    }

    // Check for recordings
    for (const selector of selectors) {
      const elements = await page.$$(selector);
      if (elements.length > 0) {
        log.info(`Found recordings with selector: ${selector}`);

        // Remove the dialog since we found recordings
        await page.evaluate(() => {
          const dialog = document.getElementById('plaud-downloader-ready-dialog');
          if (dialog) {
            dialog.remove();
          }
        });

        return true;
      }
    }

    // Update status every 5 seconds to avoid too many updates
    if (attempt % 5 === 0) {
      log.debug(`Waiting for recordings (attempt ${attempt}/${maxAttempts})`);
      statusCallback({
        status: 'waiting_recordings',
        message: `Waiting for recordings to appear or for you to click "I'm Ready"...`
      });
    }

    await wait(1000);
  }

  // After the loop, check one more time for recordings
  for (const selector of selectors) {
    const elements = await page.$$(selector);
    if (elements.length > 0) {
      log.info(`Found recordings with selector: ${selector}`);
      return true;
    }
  }

  // If we get here and userReady is true but no recordings were found,
  // we'll still proceed and let the rest of the code handle it
  if (userReady) {
    log.info('Proceeding based on user readiness signal');
    return true;
  }

  log.error('Timed out waiting for recordings to appear');
  throw new Error('Timed out waiting for recordings to appear');
}

// Function to find recordings on the page
async function findRecordings(page) {
  try {
    // Based on the HTML structure, we know exactly which selectors to use
    log.debug('Looking for recordings with specific selectors based on HTML structure');

    // Try multiple approaches to find recordings
    const selectors = [
      // Draggable list items (most common)
      'li[draggable="true"]',

      // List items in recycler view
      '.vue-recycle-scroller__item-view li',

      // Elements with fileInfo class
      '.fileInfo',

      // Additional selectors that might be used in the app
      '.recording-item',
      '.audio-item',
      '.file-item',
      '.item-container',

      // More generic selectors as fallbacks
      'li.item',
      'div[role="listitem"]',
      '.list-item'
    ];

    // Try each selector
    for (const selector of selectors) {
      const items = await page.$$(selector);
      if (items.length > 0) {
        log.debug(`Found ${items.length} items with selector: ${selector}`);

        // If we found fileInfo elements, try to get their parent li elements
        if (selector === '.fileInfo') {
          const parentItems = [];
          for (const item of items) {
            const parent = await item.evaluateHandle(el => el.closest('li'));
            if (parent) {
              parentItems.push(parent);
            } else {
              parentItems.push(item); // Use the item itself if no parent found
            }
          }
          return parentItems;
        }

        return items;
      }
    }

    // If we still haven't found anything, try a more aggressive approach
    // Look for any clickable elements that might be recordings
    log.debug('No recordings found with specific selectors, trying to find clickable elements');

    // Try to find elements that look like they might be recordings
    const potentialRecordings = await page.$$('li, div[role="button"], div[class*="item"], div[class*="recording"], div[class*="audio"]');

    if (potentialRecordings.length > 0) {
      log.debug(`Found ${potentialRecordings.length} potential recording elements`);

      // Filter to only include elements that are visible and have some content
      const visibleRecordings = [];
      for (const item of potentialRecordings) {
        const isVisible = await item.isVisible();
        if (isVisible) {
          // Check if it has some content (text or child elements)
          const hasContent = await item.evaluate(el => {
            return el.textContent.trim() !== '' || el.children.length > 0;
          });

          if (hasContent) {
            visibleRecordings.push(item);
          }
        }
      }

      if (visibleRecordings.length > 0) {
        log.debug(`Found ${visibleRecordings.length} visible potential recordings`);
        return visibleRecordings;
      }
    }

    // If we still haven't found anything, log a warning but return an empty array
    log.warn('No recordings found with any selector');
    return [];
  } catch (error) {
    log.error(`Error finding recordings: ${error.message}`);
    return [];
  }
}

// Function to click the download button
async function clickDownloadButton(page, settings) {
  // Get the browser context from the page
  const context = page.context();
  try {
    // Based on the user's description, we need to follow a multi-step process:
    // 1. Click on the share icon
    // 2. Click on "Export Audio" option
    // 3. Select MP3 format
    // 4. Click on the "Export" button in the popup modal

    log.debug('Starting multi-step export process');

    // Step 1: Click on the share icon
    log.debug('Step 1: Looking for share icon');
    const shareIcon = await page.$('.iconfont.myIcon.icon-icon_share');
    if (!shareIcon) {
      log.debug('Share icon not found, trying alternative selectors');

      // Try alternative selectors for the share icon
      const alternativeShareSelectors = [
        '.icon-icon_share',
        '.icon-share',
        '[class*="share"]',
        'button:has-text("Share")',
        '[role="button"]:has-text("Share")'
      ];

      let found = false;
      for (const selector of alternativeShareSelectors) {
        const element = await page.$(selector);
        if (element) {
          log.debug(`Found share icon with alternative selector: ${selector}`);
          await element.click();
          found = true;
          break;
        }
      }

      if (!found) {
        log.error('Could not find share icon with any selector');
        return false;
      }
    } else {
      log.debug('Found share icon');
      await shareIcon.click();
    }

    // Wait for the share menu to appear - use a shorter wait and check for the element
    await page.waitForSelector('div.name:has-text("Export Audio")', { timeout: settings.delay }).catch(() => {
      log.debug('Waiting a bit longer for Export Audio option to appear');
      return wait(settings.delay / 2);
    });

    // Step 2: Click on "Export Audio" option
    log.debug('Step 2: Looking for "Export Audio" option');
    const exportAudioOption = await page.$('div.name:has-text("Export Audio")');
    if (!exportAudioOption) {
      log.debug('"Export Audio" option not found, trying alternative selectors');

      // Try alternative selectors for the Export Audio option
      const alternativeExportSelectors = [
        'div:has-text("Export Audio")',
        '[class*="name"]:has-text("Export Audio")',
        'div:has-text("Export")',
        'button:has-text("Export Audio")',
        '[role="button"]:has-text("Export Audio")'
      ];

      let found = false;
      for (const selector of alternativeExportSelectors) {
        const element = await page.$(selector);
        if (element) {
          log.debug(`Found "Export Audio" option with alternative selector: ${selector}`);
          await element.click();
          found = true;
          break;
        }
      }

      if (!found) {
        log.error('Could not find "Export Audio" option with any selector');
        return false;
      }
    } else {
      log.debug('Found "Export Audio" option');
      await exportAudioOption.click();
    }

    // Wait for the export modal to appear - use a shorter wait and check for the element
    await page.waitForSelector('div.name:has-text("MP3")', { timeout: settings.delay }).catch(() => {
      log.debug('Waiting a bit longer for MP3 format option to appear');
      return wait(settings.delay / 2);
    });

    // Step 3: Select MP3 format
    log.debug('Step 3: Looking for MP3 format option');
    const mp3Option = await page.$('div.name:has-text("MP3")');
    if (!mp3Option) {
      log.debug('MP3 format option not found, trying alternative selectors');

      // Try alternative selectors for the MP3 option
      const alternativeMp3Selectors = [
        'div:has-text("MP3")',
        '[class*="name"]:has-text("MP3")',
        'button:has-text("MP3")',
        '[role="button"]:has-text("MP3")',
        '.format-option:has-text("MP3")'
      ];

      let found = false;
      for (const selector of alternativeMp3Selectors) {
        const element = await page.$(selector);
        if (element) {
          log.debug(`Found MP3 format option with alternative selector: ${selector}`);
          await element.click();
          found = true;
          break;
        }
      }

      if (!found) {
        log.error('Could not find MP3 format option with any selector');
        return false;
      }
    } else {
      log.debug('Found MP3 format option');
      await mp3Option.click();
    }

    // Wait after selecting MP3 format - use a shorter wait and check for the element
    await page.waitForSelector('div.commonBtn:has-text("Export")', { timeout: settings.delay }).catch(() => {
      log.debug('Waiting a bit longer for Export button to appear');
      return wait(settings.delay / 2);
    });

    // Step 4: Click on the "Export" button in the popup modal
    log.debug('Step 4: Looking for "Export" button in modal');
    const exportButton = await page.$('div.commonBtn:has-text("Export")');
    if (!exportButton) {
      log.debug('"Export" button not found, trying alternative selectors');

      // Try alternative selectors for the Export button
      const alternativeButtonSelectors = [
        '.commonBtn',
        'div:has-text("Export")',
        'button:has-text("Export")',
        '[role="button"]:has-text("Export")',
        '.btn:has-text("Export")',
        '[class*="button"]:has-text("Export")'
      ];

      let found = false;
      for (const selector of alternativeButtonSelectors) {
        const element = await page.$(selector);
        if (element) {
          log.debug(`Found "Export" button with alternative selector: ${selector}`);
          await element.click();
          found = true;
          break;
        }
      }

      if (!found) {
        log.error('Could not find "Export" button with any selector');
        return false;
      }
    } else {
      log.debug('Found "Export" button');
      await exportButton.click();
    }

    // Wait for the export to start
    log.debug('Export process initiated, waiting for download to start');

    // Set up a promise that will resolve when a download starts
    const downloadPromise = new Promise(resolve => {
      // Define the listener function separately
      const listenerFn = download => {
        log.debug('Download detected');

        // Get the suggested filename
        let filename = download.suggestedFilename() || 'recording.mp3';
        log.debug(`Original download filename: ${filename}`);

        // Generate a timestamp for unique filenames
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

        // Force the file to be saved as MP3
        try {
          // If the filename is a UUID or doesn't have an extension, use a more descriptive name
          if (filename.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i) ||
              !filename.includes('.')) {
            filename = `plaud-recording-${timestamp}.mp3`;
            log.debug(`Using generated filename: ${filename}`);
          } else if (!filename.toLowerCase().endsWith('.mp3')) {
            // Remove any existing extension
            const baseName = filename.includes('.') ?
              filename.substring(0, filename.lastIndexOf('.')) :
              filename;

            // Add .mp3 extension
            filename = `${baseName}.mp3`;
            log.debug(`Added .mp3 extension: ${filename}`);
          }

          // Create the full path
          const downloadPath = path.join(settings.downloadDir, filename);
          log.debug(`Saving download to: ${downloadPath}`);

          // Remove the listener before async operations
          context.removeListener('download', listenerFn);

          // Save the file (this happens asynchronously)
          download.saveAs(downloadPath)
            .then(() => {
              log.debug(`File saved successfully: ${downloadPath}`);

              // Verify the file exists and has the correct extension
              if (fs.existsSync(downloadPath)) {
                log.debug(`Verified file exists: ${downloadPath}`);
              } else {
                log.error(`File not found after saving: ${downloadPath}`);

                // Try to find the file without extension
                const basePathWithoutExt = downloadPath.substring(0, downloadPath.lastIndexOf('.'));
                if (fs.existsSync(basePathWithoutExt)) {
                  log.debug(`Found file without extension: ${basePathWithoutExt}`);

                  // Rename the file to add the .mp3 extension
                  fs.renameSync(basePathWithoutExt, downloadPath);
                  log.debug(`Renamed file to add .mp3 extension: ${downloadPath}`);
                }
              }
            })
            .catch(error => {
              log.error(`Error saving file: ${error.message}`);

              // Try to save to the user's Downloads folder as a fallback
              const fallbackPath = path.join(os.homedir(), 'Downloads', filename);
              log.debug(`Trying fallback location: ${fallbackPath}`);

              download.saveAs(fallbackPath)
                .then(() => log.debug(`File saved to fallback location: ${fallbackPath}`))
                .catch(fallbackError => log.error(`Error saving to fallback location: ${fallbackError.message}`));
            });
        } catch (error) {
          log.error(`Error handling download: ${error.message}`);
          // Remove the listener in case of error
          context.removeListener('download', listenerFn);
        }

        resolve(true);
      };

      // Add the listener
      context.on('download', listenerFn);

      // Set a timeout in case the download doesn't start
      setTimeout(() => {
        // Remove the listener
        context.removeListener('download', listenerFn);
        log.debug('Download timeout - continuing anyway');
        resolve(false);
      }, settings.delay * 3); // Increase timeout to give more time for download to start
    });

    // Wait for the download to start or timeout
    await downloadPromise;

    // Add a small delay to ensure the download is being processed
    await wait(settings.delay);

    return true;
  } catch (error) {
    log.error(`Error clicking download button: ${error.message}`);
    return false;
  }
}

// Function to check if we're on the recordings list page
async function isOnRecordingsList(page) {
  try {
    // Check for elements that would indicate we're on the recordings list
    const listIndicators = [
      '.vue-recycle-scroller__item-view',
      'li[draggable="true"]',
      '.fileInfo'
    ];

    for (const selector of listIndicators) {
      const elements = await page.$$(selector);
      if (elements.length > 1) { // More than one element suggests we're on a list
        return true;
      }
    }

    return false;
  } catch (error) {
    log.error(`Error checking if on recordings list: ${error.message}`);
    return false;
  }
}

// Function to navigate back to the recordings list
async function navigateToRecordingsList(page, settings) {
  try {
    // First, try to click the logo or home button which is usually the fastest way back
    const homeSelectors = [
      '.logo',
      '.home-button',
      '.brand-logo',
      'a[href="/"]',
      'a[href="/home"]',
      'a[href="/files"]',
      'a[href="/recordings"]'
    ];

    for (const selector of homeSelectors) {
      const homeButton = await page.$(selector);
      if (homeButton) {
        log.debug(`Found home/logo button with selector: ${selector}`);
        await homeButton.click();
        // Use a shorter wait time
        await wait(settings.delay / 2);
        return;
      }
    }

    // Try clicking the back button if it exists
    const backButtonSelectors = [
      'button:has-text("Back")',
      '[aria-label="Back"]',
      '.back-button',
      '.nav-back',
      '.iconfont.icon-back',
      '.iconfont.icon-return'
    ];

    for (const selector of backButtonSelectors) {
      const backButton = await page.$(selector);
      if (backButton) {
        log.debug(`Found back button with selector: ${selector}`);
        await backButton.click();
        // Use a shorter wait time
        await wait(settings.delay / 2);
        return;
      }
    }

    // Try clicking on a navigation item that would take us to recordings
    const navItemSelectors = [
      'a:has-text("Recordings")',
      'a:has-text("Files")',
      'a:has-text("Library")',
      '.nav-item:has-text("Recordings")',
      '.nav-item:has-text("Files")',
      '.nav-item:has-text("Library")'
    ];

    for (const selector of navItemSelectors) {
      const navItem = await page.$(selector);
      if (navItem) {
        log.debug(`Found navigation item with selector: ${selector}`);
        await navItem.click();
        // Use a shorter wait time
        await wait(settings.delay / 2);
        return;
      }
    }

    // If all else fails, use browser history to go back
    log.debug('Trying browser history back navigation');
    await page.goBack();
    await wait(settings.delay / 2);

    // If that doesn't work, reload the page
    if (!await isOnRecordingsList(page)) {
      log.debug('Could not navigate back. Reloading page.');
      await page.reload();
      await page.waitForLoadState('domcontentloaded'); // Faster than 'networkidle'
    }
  } catch (error) {
    log.error(`Error navigating to recordings list: ${error.message}`);
    throw error;
  }
}

module.exports = {
  startDownload,
  cancelDownload
};
