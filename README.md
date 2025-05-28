# Plaud Audio Downloader

A desktop application to bulk download audio recordings from app.plaud.ai.

## Features

- User-friendly interface for downloading audio recordings
- Automatic detection and download of recordings as MP3 files
- Ensures all downloaded files have the .mp3 extension
- Configurable settings for download behavior
- Works on macOS (optimized for Apple Passkey login)

## Installation

### Prerequisites

- Node.js and npm must be installed on your computer
- Internet connection for the initial installation (to download dependencies)

### For Windows Users

1. Extract the ZIP file to a location of your choice
2. Open the extracted folder in File Explorer
3. Double-click on `install.bat`
4. This will install the dependencies and start the app

### For macOS/Linux Users

1. Extract the ZIP file to a location of your choice
2. Open a terminal and navigate to the extracted directory:
   ```
   cd path/to/plaud-audio-downloader
   ```
3. Make the install script executable:
   ```
   chmod +x install.sh
   ```
4. Run the install script:
   ```
   ./install.sh
   ```

### Running the App After Installation

After the initial installation, you can run the app by:

1. Opening a terminal/command prompt in the app directory
2. Running:
   ```
   npm start
   ```

## Usage

1. **Start the Download Process**
   - Click the "Start Download" button on the Download tab.

2. **Log In to Plaud**
   - A browser window will open. Log in to your Plaud account if needed.

3. **Navigate to Your Recordings**
   - Go to the page where your recordings are listed.

4. **Wait for the Process to Complete**
   - The app will automatically detect and download your recordings.

5. **Access Your Downloads**
   - Click "Open Download Folder" to see your downloaded audio files.

## Settings

- **Download Directory**: Where your audio files will be saved
- **Delay between actions**: Adjust this if you experience issues with downloads
- **Maximum recordings to download**: Limit the number of recordings to download (-1 for all)
- **Headless mode**: Run without showing the browser window (not recommended for first use)

## Troubleshooting

- If downloads are failing, try increasing the delay in Settings
- Make sure you're on the correct page with your recordings
- If the app can't find your recordings, try refreshing the page
- For technical support, contact your administrator

## License

MIT
