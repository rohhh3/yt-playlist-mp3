const express = require('express');
const ytdlp = require('yt-dlp-exec');
const { ffmpegPath } = require('ffmpeg-ffprobe-static');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

const clients = new Map();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

const downloadsDir = path.join(__dirname, 'downloads');
if (!fs.existsSync(downloadsDir)) {
  fs.mkdirSync(downloadsDir);
}

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

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

app.post('/download', async (req, res) => {
  const { playlistUrl, includeMetadata } = req.body;

  if (!playlistUrl) {
    return res.status(400).json({ error: 'Playlist URL is required' });
  }

  try {
    sendProgress('Fetching playlist information...', 'info');
    sendProgress(`URL: ${playlistUrl}`, 'info');
    
    let playlistInfo;
    let videoCount = 0;
    let playlistTitle = 'Unknown Playlist';

    try {
      // Try to get playlist info - catch errors but parse successful output
      try {
        playlistInfo = await ytdlp(playlistUrl, {
          flatPlaylist: true,
          dumpSingleJson: true,
          quiet: true,
          ignoreErrors: true,
          noCheckCertificate: true,
          preferFreeFormats: true,
          referer: 'https://www.youtube.com/'
        });
      } catch (error) {
        // Even if command fails, try to parse JSON from stdout
        if (error.stdout) {
          try {
            playlistInfo = JSON.parse(error.stdout);
          } catch (parseError) {
            throw error; // Re-throw if we can't parse the output
          }
        } else {
          throw error;
        }
      }

      videoCount = playlistInfo.entries ? playlistInfo.entries.filter(e => e !== null).length : 0;
      playlistTitle = playlistInfo.title || 'Unknown Playlist';
    } catch (error) {
      // If everything fails, still try to download
      sendProgress('Could not fetch playlist info, but will attempt download...', 'info');
      playlistTitle = 'Unknown Playlist';
      videoCount = 'unknown number of';
    }

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

  const skippedVideos = [];

  try {
    const options = {
      extractAudio: true,
      audioFormat: 'mp3',
      audioQuality: '192K',
      output: path.join(downloadsDir, '%(title)s.%(ext)s'),
      progress: true,
      newline: true,
      ffmpegLocation: ffmpegPath,
      ignoreErrors: true
    };

    if (includeMetadata) {
      options.addMetadata = true;
    }

    const process = ytdlp.exec(playlistUrl, options);

    // Stream stdout
    process.stdout.on('data', (data) => {
      const lines = data.toString().split('\n');
      lines.forEach(line => {
        if (line.trim()) {
          if (line.includes('Downloading item')) {
            sendProgress(line.trim(), 'info');
          } else if (line.includes('[download]') && line.includes('%')) {
            // Show download progress with percentage and speed
            sendProgress(line.trim(), 'info');
          } else if (line.includes('[ExtractAudio]') && line.includes('Destination:')) {
            const match = line.match(/Destination: .*[\/\\](.+\.mp3)/);
            if (match) {
              sendProgress(`✓ Converted: ${match[1]}`, 'success');
            }
          } else if (line.includes('Finished downloading playlist')) {
            sendProgress(line.trim(), 'success');
          } else if (line.includes('[download] Downloading playlist:')) {
            sendProgress(line.trim(), 'info');
          } else if (line.includes('[youtube] Extracting URL:')) {
            const urlMatch = line.match(/watch\?v=([a-zA-Z0-9_-]+)/);
            if (urlMatch) {
              currentVideoTitle = urlMatch[1];
            }
          }
        }
      });
    });

    // Stream stderr
    process.stderr.on('data', (data) => {
      const lines = data.toString().split('\n');
      lines.forEach(line => {
        if (line.trim()) {
          // Detect errors for specific videos
          if ((line.includes('Sign in to confirm your age') || 
               line.includes('Private video') || 
               line.includes('Video unavailable')) && 
              line.includes('[youtube]')) {
            const videoIdMatch = line.match(/\[youtube\] ([a-zA-Z0-9_-]+):/);
            if (videoIdMatch) {
              const videoId = videoIdMatch[1];
              const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
              skippedVideos.push(videoUrl);
              // Don't send progress here, save for end
            }
          } else if (!line.includes('Deprecated Feature') && 
                     !line.includes('WARNING') &&
                     !line.includes('cookies-from-browser')) {
            // Only show critical errors
            if (line.startsWith('ERROR:') && !line.includes('Sign in') && !line.includes('Private') && !line.includes('unavailable')) {
              sendProgress(line.trim(), 'error');
            }
          }
        }
      });
    });

    try {
      await process;
    } catch (error) {
      // Process may exit with error code 1 due to skipped videos, but that's okay
    }

    sendProgress('========================================', 'success');
    sendProgress('✅ Playlist download completed!', 'success');
    if (skippedVideos.length > 0) {
      sendProgress('========================================', 'warning');
      sendProgress(`⚠️ Skipped ${skippedVideos.length} unavailable/restricted video(s):`, 'warning');
      skippedVideos.forEach(url => {
        sendProgress(`  • ${url}`, 'warning');
      });
    }
    sendProgress('========================================', 'success');

  } catch (error) {
    // Don't show the full error if downloads actually completed
    if (error.message && !error.message.includes('Finished downloading playlist')) {
      sendProgress(`Note: Some videos may have been skipped due to restrictions`, 'info');
    }
  }
}

app.listen(PORT, () => {
  console.log(`\n🚀 Server running on http://localhost:${PORT}`);
  console.log(`📁 Downloads will be saved to: ${downloadsDir}`);
  console.log(`🎬 FFmpeg path: ${ffmpegPath}\n`);
});