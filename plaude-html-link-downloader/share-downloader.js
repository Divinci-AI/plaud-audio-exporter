const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');

async function extractAudioUrl(shareUrl) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log(`Navigating to share page: ${shareUrl}`);
    await page.goto(shareUrl, { waitUntil: 'networkidle' });

    // Extract iframe URL
    const iframeUrl = await page.evaluate(() => {
      const iframe = document.querySelector('iframe');
      return iframe ? iframe.src : null;
    });

    if (!iframeUrl) {
      throw new Error('No iframe found on the share page');
    }

    console.log(`Found iframe URL: ${iframeUrl}`);

    // Navigate to iframe URL
    await page.goto(iframeUrl, { waitUntil: 'networkidle' });

    // Wait for audio element to appear (don't wait for visibility since it's hidden)
    await page.waitForSelector('audio source', { state: 'attached', timeout: 30000 });

    // Extract audio URL
    const audioUrl = await page.evaluate(() => {
      const audioSource = document.querySelector('audio source');
      return audioSource ? audioSource.src : null;
    });

    if (!audioUrl) {
      throw new Error('No audio source found in the iframe');
    }

    console.log(`Found audio URL: ${audioUrl}`);
    return audioUrl;

  } finally {
    await browser.close();
  }
}

function downloadFile(url, outputPath) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const protocol = urlObj.protocol === 'https:' ? https : http;
    
    const file = fs.createWriteStream(outputPath);
    
    const request = protocol.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Handle redirect
        file.close();
        fs.unlinkSync(outputPath);
        return downloadFile(response.headers.location, outputPath).then(resolve).catch(reject);
      }
      
      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(outputPath);
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }
      
      const totalSize = parseInt(response.headers['content-length'], 10);
      let downloadedSize = 0;
      
      response.on('data', (chunk) => {
        downloadedSize += chunk.length;
        const percentage = ((downloadedSize / totalSize) * 100).toFixed(2);
        process.stdout.write(`\rDownloading: ${percentage}%`);
      });
      
      response.pipe(file);
      
      file.on('finish', () => {
        file.close();
        console.log('\nDownload completed!');
        resolve();
      });
    });
    
    request.on('error', (err) => {
      fs.unlinkSync(outputPath);
      reject(err);
    });
    
    file.on('error', (err) => {
      fs.unlinkSync(outputPath);
      reject(err);
    });
  });
}

async function downloadAudioFromShareLink(shareUrl, outputDir = './downloads') {
  try {
    // Extract ID from share URL
    const shareId = shareUrl.split('/').pop();
    
    // Get audio URL
    const audioUrl = await extractAudioUrl(shareUrl);
    
    // Create output directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Generate output filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const outputPath = path.join(outputDir, `plaud_${shareId}_${timestamp}.mp3`);
    
    console.log(`Downloading to: ${outputPath}`);
    
    // Download the file
    await downloadFile(audioUrl, outputPath);
    
    return {
      success: true,
      shareUrl,
      audioUrl,
      outputPath
    };
    
  } catch (error) {
    console.error(`Error processing ${shareUrl}:`, error);
    return {
      success: false,
      shareUrl,
      error: error.message
    };
  }
}

async function batchDownload(shareUrls, outputDir = './downloads') {
  console.log(`Starting batch download of ${shareUrls.length} files...`);
  
  const results = [];
  
  for (let i = 0; i < shareUrls.length; i++) {
    console.log(`\n[${i + 1}/${shareUrls.length}] Processing: ${shareUrls[i]}`);
    const result = await downloadAudioFromShareLink(shareUrls[i], outputDir);
    results.push(result);
    
    // Add a small delay between downloads to be respectful to the server
    if (i < shareUrls.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  // Summary
  console.log('\n=== Download Summary ===');
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  console.log(`Total: ${results.length}`);
  console.log(`Successful: ${successful.length}`);
  console.log(`Failed: ${failed.length}`);
  
  if (failed.length > 0) {
    console.log('\nFailed downloads:');
    failed.forEach(f => {
      console.log(`- ${f.shareUrl}: ${f.error}`);
    });
  }
  
  return results;
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage:');
    console.log('  Single download: node share-downloader.js <share-url>');
    console.log('  Batch download:  node share-downloader.js <share-url1> <share-url2> ...');
    console.log('  From file:       node share-downloader.js --file <path-to-file>');
    console.log('\nExample:');
    console.log('  node share-downloader.js https://web.plaud.ai/share/23751753320127463');
    process.exit(1);
  }
  
  (async () => {
    let urls = [];
    
    if (args[0] === '--file' && args[1]) {
      // Read URLs from file
      const filePath = args[1];
      const content = fs.readFileSync(filePath, 'utf8');
      urls = content.split('\n').filter(line => line.trim().length > 0);
    } else {
      // URLs provided as arguments
      urls = args;
    }
    
    if (urls.length === 1) {
      await downloadAudioFromShareLink(urls[0]);
    } else {
      await batchDownload(urls);
    }
  })();
}

module.exports = {
  extractAudioUrl,
  downloadAudioFromShareLink,
  batchDownload
};