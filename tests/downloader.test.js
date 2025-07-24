const { describe, it, expect, vi, beforeEach, afterEach } = require('vitest');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Mock the required modules
vi.mock('electron-log', () => ({
  info: vi.fn(),
  debug: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  transports: {
    file: { level: 'info' },
    console: { level: 'debug' }
  }
}));

vi.mock('playwright', () => {
  const mockContext = {
    on: vi.fn(),
    setDefaultNavigationTimeout: vi.fn(),
    setDefaultTimeout: vi.fn(),
    browser: vi.fn().mockReturnValue({ close: vi.fn() }),
    newPage: vi.fn().mockResolvedValue({
      goto: vi.fn(),
      waitForSelector: vi.fn(),
      evaluate: vi.fn(),
      exposeFunction: vi.fn(),
      context: vi.fn().mockReturnValue(mockContext)
    })
  };

  const mockBrowser = {
    newContext: vi.fn().mockResolvedValue(mockContext),
    close: vi.fn()
  };

  return {
    chromium: {
      launch: vi.fn().mockResolvedValue(mockBrowser),
      launchPersistentContext: vi.fn().mockResolvedValue(mockContext)
    }
  };
});

// Create a temporary directory for testing
const testDir = path.join(os.tmpdir(), 'plaud-unit-test');
if (!fs.existsSync(testDir)) {
  fs.mkdirSync(testDir, { recursive: true });
}

// Test settings
const testSettings = {
  downloadDir: testDir,
  delay: 500,
  maxRecordings: 5,
  headless: true,
  useExistingProfile: false
};

// Mock callback function
const mockCallback = vi.fn();

describe('Downloader Module', () => {
  let downloader;

  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();

    // Reset the module cache to ensure a fresh module for each test
    vi.resetModules();

    // Import the downloader module
    downloader = require('../downloader');
  });

  afterEach(() => {
    // Clean up any resources
  });

  it('should export the required functions', () => {
    expect(downloader).toHaveProperty('startDownload');
    expect(downloader).toHaveProperty('cancelDownload');
    expect(typeof downloader.startDownload).toBe('function');
    expect(typeof downloader.cancelDownload).toBe('function');
  });

  it('should handle cancellation correctly', async () => {
    // Start a download
    const downloadPromise = downloader.startDownload(testSettings, mockCallback);

    // Cancel it immediately
    downloader.cancelDownload();

    // Wait for the download process to complete
    await downloadPromise;

    // Verify that the callback was called with the correct status
    expect(mockCallback).toHaveBeenCalledWith(expect.objectContaining({
      status: 'starting',
      message: 'Starting download process...'
    }));

    expect(mockCallback).toHaveBeenCalledWith(expect.objectContaining({
      status: 'launching',
      message: 'Launching browser...'
    }));
  });

  // Note: We can't fully test the download process in a unit test
  // because it requires interaction with the Plaud website
  // These tests just verify the basic functionality of the module
});
