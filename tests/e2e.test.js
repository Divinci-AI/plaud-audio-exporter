const { test, expect } = require('@playwright/test');
const { _electron: electron } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Test configuration
const appPath = path.join(__dirname, '..');
const downloadDir = path.join(os.tmpdir(), 'plaud-test-downloads');

// Ensure the download directory exists
if (!fs.existsSync(downloadDir)) {
  fs.mkdirSync(downloadDir, { recursive: true });
}

// Clean up the download directory before each test
test.beforeEach(async () => {
  // Ensure the download directory exists
  if (!fs.existsSync(downloadDir)) {
    fs.mkdirSync(downloadDir, { recursive: true });
  }

  // Clean up any existing files
  const files = fs.readdirSync(downloadDir);
  for (const file of files) {
    fs.unlinkSync(path.join(downloadDir, file));
  }
});

test('App launches and shows the main UI', async () => {
  // Launch the app
  const electronApp = await electron.launch({
    args: [appPath],
    env: {
      NODE_ENV: 'test',
    },
  });

  // Get the first window
  const window = await electronApp.firstWindow();

  // Check that the window title is correct
  expect(await window.title()).toBe('Plaud Audio Downloader');

  // Check that the main UI elements are visible
  await expect(window.locator('h1:has-text("Plaud Audio Downloader")')).toBeVisible();
  await expect(window.locator('button:has-text("Start Download")')).toBeVisible();
  await expect(window.locator('button:has-text("Settings")')).toBeVisible();

  // Close the app
  await electronApp.close();
});

test('Settings can be changed and saved', async () => {
  // Launch the app
  const electronApp = await electron.launch({
    args: [appPath],
    env: {
      NODE_ENV: 'test',
    },
  });

  // Get the first window
  const window = await electronApp.firstWindow();

  // Navigate to the Settings tab
  await window.click('button[data-tab="settings"]');

  // Wait for the settings tab to be active
  await expect(window.locator('.tab-pane#settings')).toHaveClass(/active/);

  // Set the download directory
  await window.fill('#download-dir', downloadDir);

  // Set the delay
  await window.fill('#delay', '1500');

  // Set the max recordings
  await window.fill('#max-recordings', '5');

  // Toggle the headless mode
  const headlessCheckbox = window.locator('#headless');
  const isChecked = await headlessCheckbox.isChecked();
  if (!isChecked) {
    await headlessCheckbox.check();
  } else {
    await headlessCheckbox.uncheck();
    await headlessCheckbox.check();
  }

  // Save the settings
  await window.click('#save-settings');

  // Close the app
  await electronApp.close();

  // Launch the app again to verify settings were saved
  const newElectronApp = await electron.launch({
    args: [appPath],
    env: {
      NODE_ENV: 'test',
    },
  });

  // Get the first window
  const newWindow = await newElectronApp.firstWindow();

  // Navigate to the Settings tab
  await newWindow.click('button[data-tab="settings"]');

  // Verify the settings were saved
  await expect(newWindow.locator('#download-dir')).toHaveValue(downloadDir);
  await expect(newWindow.locator('#delay')).toHaveValue('1500');
  await expect(newWindow.locator('#max-recordings')).toHaveValue('5');
  await expect(newWindow.locator('#headless')).toBeChecked();

  // Close the app
  await newElectronApp.close();
});

// Note: We can't fully test the download process in an automated way
// because it requires user interaction with the Plaud website
// This test just verifies that the download button works and the status UI updates
test('Download button shows status UI', async () => {
  // Launch the app
  const electronApp = await electron.launch({
    args: [appPath],
    env: {
      NODE_ENV: 'test',
    },
  });

  // Get the first window
  const window = await electronApp.firstWindow();

  // Click the Start Download button
  await window.click('#start-download');

  // Check that the status card becomes visible
  await expect(window.locator('#status-card')).toBeVisible();

  // Check that the status message is updated
  await expect(window.locator('#status-message')).not.toHaveText('Waiting to start...');

  // Check that the Cancel button is enabled
  await expect(window.locator('#cancel-download')).not.toBeDisabled();

  // Click the Cancel button to stop the download
  await window.click('#cancel-download');

  // Wait for the UI to update
  await window.waitForTimeout(1000);

  // Check that the Start Download button is enabled again
  await expect(window.locator('#start-download')).not.toBeDisabled();

  // Close the app
  await electronApp.close();
});
