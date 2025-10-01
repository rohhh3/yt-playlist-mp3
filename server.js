// server.js
const express = require('express');
const ytdlp = require('yt-dlp-exec');
const { ffmpegPath } = require('ffmpeg-ffprobe-static');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

// Store SSE clients
const clients = new Map();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Ensure downloads directory exists
const downloadsDir = path.join(__dirname, 'downloads');
if (!fs.existsSync(downloadsDir)) {
  fs.mkdirSync(downloadsDir);
}

// Home page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// SSE endpoint for progress updates
app.get('/progress', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const clientId = Date.now();
  clients.set(clientId, res);

  req.on('close', () => {
    clients.delete(clientId);
  });
});

// Function to send progress to all clients
function sendProgress(message, type = 'info') {
  const data = JSON.stringify({ message, type, timestamp: new Date().toISOString() });
  clients.forEach((client) => {
    client.write(`data: ${data}\n\n`);
  });
  console.log(message);
}

// Download playlist endpoint
app.post('/download', async (req, res) => {
  const { playlistUrl, includeMetadata } = req.body;

  if (!playlistUrl) {
    return res.status(400).json({ error: 'Playlist URL is required' });
  }

  try {
    sendProgress('Fetching playlist information...', 'info');
    sendProgress(`URL: ${playlistUrl}`, 'info');
    
    // Get playlist info using yt-dlp
    const playlistInfo = await ytdlp(playlistUrl, {
      dumpSingleJson: true,
      noWarnings: true,
      noCheckCertificate: true,
      preferFreeFormats: true,
      referer: 'https://www.youtube.com/'
    });

    const videoCount = playlistInfo.entries ? playlistInfo.entries.length : 1;
    const playlistTitle = playlistInfo.title || 'Unknown Playlist';

    sendProgress(`Playlist Title: ${playlistTitle}`, 'success');
    sendProgress(`Total Videos: ${videoCount}`, 'success');
    sendProgress(`Metadata: ${includeMetadata ? 'Enabled' : 'Disabled'}`, 'info');

    res.json({
      success: true,
      message: 'Download started',
      totalVideos: videoCount,
      playlistTitle: playlistTitle
    });

    // Download videos in background
    downloadPlaylist(playlistUrl, playlistTitle, videoCount, includeMetadata);

  } catch (error) {
    console.error('Error details:', error);
    sendProgress(`Error: ${error.message}`, 'error');
    res.status(500).json({ error: 'Failed to process playlist: ' + error.message });
  }
});

// Function to download playlist
async function downloadPlaylist(playlistUrl, playlistTitle, videoCount, includeMetadata) {
  sendProgress('========================================', 'info');
  sendProgress(`Starting download of ${videoCount} videos`, 'info');
  sendProgress(`Playlist: ${playlistTitle}`, 'info');
  sendProgress('========================================', 'info');

  try {
    const options = {
      extractAudio: true,
      audioFormat: 'mp3',
      audioQuality: '192K',
      output: path.join(downloadsDir, '%(title)s.%(ext)s'),
      progress: true,
      newline: true,
      ffmpegLocation: ffmpegPath
    };

    // Add metadata only if enabled
    if (includeMetadata) {
      options.addMetadata = true;
    }

    // Download entire playlist as MP3 with yt-dlp
    const process = ytdlp.exec(playlistUrl, options);

    // Stream stdout
    process.stdout.on('data', (data) => {
      const lines = data.toString().split('\n');
      lines.forEach(line => {
        if (line.trim()) {
          // Parse and format the line
          if (line.includes('[download]')) {
            sendProgress(line.trim(), 'info');
          } else if (line.includes('[ExtractAudio]')) {
            sendProgress(line.trim(), 'success');
          } else if (line.includes('Downloading item')) {
            sendProgress(line.trim(), 'info');
          } else if (line.includes('[youtube]')) {
            sendProgress(line.trim(), 'info');
          } else if (line.includes('[info]')) {
            sendProgress(line.trim(), 'info');
          } else if (line.trim().length > 0) {
            sendProgress(line.trim(), 'info');
          }
        }
      });
    });

    // Stream stderr
    process.stderr.on('data', (data) => {
      const lines = data.toString().split('\n');
      lines.forEach(line => {
        if (line.trim() && !line.includes('Deprecated Feature')) {
          sendProgress(line.trim(), 'error');
        }
      });
    });

    await process;

    sendProgress('========================================', 'success');
    sendProgress('✅ Playlist download completed!', 'success');
    sendProgress('========================================', 'success');

  } catch (error) {
    sendProgress(`❌ Download failed: ${error.message}`, 'error');
    console.error(error);
  }
}

app.listen(PORT, () => {
  console.log(`\n🚀 Server running on http://localhost:${PORT}`);
  console.log(`📁 Downloads will be saved to: ${downloadsDir}`);
  console.log(`🎬 FFmpeg path: ${ffmpegPath}\n`);
});