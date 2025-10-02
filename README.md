# rohhh3/yt-playlist-mp3
Dead simple YouTube playlist to MP3 converter that runs locally on your machine. Start the server, paste the URL, click the download button once, and download all your music in bulk. Works great for getting music to Navidrome. Don't tell uncle Google.

![App Screenshot](https://github.com/rohhh3/yt-playlist-mp3/blob/main/untitled1.png)
## Features
- 🎵 Download entire YouTube playlists as MP3 (192kbps)
- 🖥️ Clean, modern web interface
- 📊 Real-time download progress
- 🏷️ Optional metadata (title, description)
- 💾 Runs completely locally on your machine
- ❌ Age restricted or unavailable vidoes will be omitted

## Requirements
1. Node.js 14+  [Official NodeJS webiste](https://nodejs.org/en/download)

## Installation

1. **Clone the repository:**
```bash
git clone https://github.com/yourusername/yt-playlist-mp3.git
cd yt-playlist-mp3
```
1b. **Or downlaod as zip**
Here: https://github.com/rohhh3/yt-playlist-mp3/archive/refs/heads/main.zip

2. **Install dependencies:**
```bash
npm i
```

3. **Start the server:**
```bash
npm run dev
```

4. **Open in browser:**
```bash
http://localhost:3000
```

## Used packages
1. "@distube/ytpl": "^1.2.1",
2. "express": "^4.18.2",
3. "ffmpeg-ffprobe-static": "^6.1.2-rc.1",
4. "yt-dlp-exec": "^1.0.2"
