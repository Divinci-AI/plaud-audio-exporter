# Plaud Audio Downloader

A desktop application to download audio recordings from app.plaud.ai, built with Electron and Playwright.

## Features

- **Main App**: Download audio recordings directly from your Plaud account
- **Share Link Downloader**: Extract and download audio files from Plaud share links
- **Batch Processing**: Download multiple files with progress tracking
- **Cross-Platform**: Works on Windows, macOS, and Linux
- **User-Friendly**: Simple graphical interface with settings management

## Installation

### Prerequisites

- Node.js (version 16 or higher)
- npm or yarn

### Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/Divinci-AI/plaud-audio-exporter.git
   cd plaud-audio-exporter
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the application:
   ```bash
   npm start
   ```

## Usage

### Main Application

The main application allows you to download audio recordings from your Plaud account:

1. **Launch the App**: Run `npm start` to open the Plaud Audio Downloader
2. **Configure Settings**: 
   - Set your download directory
   - Adjust delay between downloads
   - Configure browser settings
3. **Start Download**: Click "Start Download" - a browser window will open
4. **Login**: Log into your Plaud account in the browser window
5. **Navigate**: Go to your recordings page
6. **Download**: The app will automatically detect and download your recordings

### Share Link Downloader

Extract audio files from Plaud share links (e.g., `https://web.plaud.ai/share/123456789`):

#### Via Main App
1. Open the "Share Downloader" tab
2. Paste share URLs (one per line) into the text area
3. Click "Download Audio Files"

#### Via Command Line
```bash
# Single download
node plaude-html-link-downloader/share-downloader.js https://web.plaud.ai/share/123456789

# Multiple downloads
node plaude-html-link-downloader/share-downloader.js url1 url2 url3

# From file
node plaude-html-link-downloader/share-downloader.js --file urls.txt
```

#### URL File Format
Create a text file with one URL per line:
```
https://web.plaud.ai/share/123456789
https://web.plaud.ai/share/987654321
https://web.plaud.ai/share/456789123
```

## Configuration

### Settings

- **Download Directory**: Where to save audio files
- **Delay**: Time between downloads (recommended: 1000ms)
- **Max Recordings**: Limit number of downloads (-1 for all)
- **Headless Mode**: Run browser without UI (not recommended for first use)
- **Use Existing Profile**: Better support for Apple Passkey login

### Output

Downloaded files are saved with descriptive names:
- Main app: `recording_[timestamp].mp3`
- Share downloader: `plaud_[share_id]_[timestamp].mp3`

## Troubleshooting

### Common Issues

1. **Apple Passkey Login Issues**
   - Enable "Use existing browser profile" in Settings
   - Log into app.plaud.ai in Chrome/Brave first
   - Restart the application

2. **Download Failures**
   - Increase delay in Settings (try 2000ms)
   - Check internet connection
   - Verify you're on the correct recordings page

3. **Browser Profile Errors**
   - Restart the application
   - Clear browser cache
   - Try disabling "Use existing browser profile"

### Getting Help

1. Check the Help tab in the application
2. Review error messages in the status area
3. Check console logs for technical details

## Development

### Project Structure

```
plaud-audio-downloader/
├── main.js                    # Electron main process
├── renderer.js               # Frontend logic
├── preload.js               # Electron preload script
├── downloader.js            # Main download functionality
├── index.html               # Main UI
├── styles.css               # Application styles
├── plaude-html-link-downloader/  # Share link utility
│   ├── share-downloader.js  # Share link downloader
│   ├── share-downloader.html # Standalone UI
│   └── README.md           # Share downloader docs
└── tests/                   # Test files
```

### Building

```bash
# Install dependencies
npm install

# Run tests
npm test
npm run test:unit

# Start development
npm start
```

### Testing

The project includes both unit tests and end-to-end tests:

```bash
# Run all tests
npm test

# Run unit tests only
npm run test:unit
```

## Security

This application:
- ✅ Contains no hardcoded credentials or API keys
- ✅ Uses secure browser automation via Playwright
- ✅ Stores settings locally only
- ✅ Does not collect or transmit personal data
- ✅ Follows security best practices

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes
4. Run tests: `npm test`
5. Commit changes: `git commit -am 'Add feature'`
6. Push to branch: `git push origin feature-name`
7. Submit a pull request

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details.

## Disclaimer

This tool is for personal use only. Please respect Plaud's terms of service and only download content you have permission to access. The developers are not responsible for any misuse of this software.

## Changelog

### v1.0.0
- Initial release
- Main app with Electron GUI
- Share link downloader utility
- Batch download support
- Cross-platform compatibility
- Comprehensive test suite