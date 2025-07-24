# Plaud Share Link Downloader

A utility to download audio files from Plaud share links (e.g., https://web.plaud.ai/share/23751753320127463).

## How it Works

1. Navigates to the share page
2. Extracts the iframe URL
3. Navigates to the iframe content
4. Finds the AWS S3 audio URL
5. Downloads the audio file

## Usage

### Command Line Interface

#### Single file download:
```bash
node share-downloader.js https://web.plaud.ai/share/23751753320127463
```

#### Multiple files:
```bash
node share-downloader.js https://web.plaud.ai/share/23751753320127463 https://web.plaud.ai/share/23751753320127464
```

#### From a file:
Create a text file with URLs (one per line):
```
https://web.plaud.ai/share/23751753320127463
https://web.plaud.ai/share/23751753320127464
https://web.plaud.ai/share/23751753320127465
```

Then run:
```bash
node share-downloader.js --file urls.txt
```

### As a Module

```javascript
const { downloadAudioFromShareLink, batchDownload } = require('./share-downloader');

// Download single file
const result = await downloadAudioFromShareLink('https://web.plaud.ai/share/23751753320127463');

// Download multiple files
const urls = [
  'https://web.plaud.ai/share/23751753320127463',
  'https://web.plaud.ai/share/23751753320127464'
];
const results = await batchDownload(urls, './downloads');
```

## Output

Files are downloaded with the naming format:
```
plaud_[SHARE_ID]_[TIMESTAMP].mp3
```

Example: `plaud_23751753320127463_2024-01-24T10-30-45.mp3`

## Requirements

- Node.js
- Playwright (automatically installed with `npm install`)

## Features

- Automatic URL extraction from share pages
- Progress tracking
- Batch downloading with delays between downloads
- Error handling and retry logic
- Summary report after batch downloads