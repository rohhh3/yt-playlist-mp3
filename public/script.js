const form = document.getElementById('downloadForm');
const messageDiv = document.getElementById('message');
const downloadBtn = document.getElementById('downloadBtn');
const btnText = document.getElementById('btnText');
const consoleDiv = document.getElementById('console');
const metadataCheckbox = document.getElementById('includeMetadata');
const timerDiv = document.getElementById('timer');
const timerDisplay = document.getElementById('timerDisplay');

let eventSource = null;
let timerInterval = null;
let startTime = null;

function formatTime(seconds) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function startTimer() {
    timerDiv.classList.add('show');
    timerDiv.classList.remove('completed');
    startTime = Date.now();
    
    timerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        timerDisplay.textContent = formatTime(elapsed);
    }, 1000);
}

function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
        timerDiv.classList.add('completed');
    }
}

function resetTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    timerDiv.classList.remove('show', 'completed');
    timerDisplay.textContent = '00:00:00';
    startTime = null;
}

function addConsoleLine(text, type = 'info') {
    const line = document.createElement('div');
    line.className = `console-line ${type}`;
    line.textContent = `[${new Date().toLocaleTimeString()}] ${text}`;
    consoleDiv.appendChild(line);
    consoleDiv.scrollTop = consoleDiv.scrollHeight;
    consoleDiv.classList.add('show');
}

function clearConsole() {
    consoleDiv.innerHTML = '';
    consoleDiv.classList.remove('show');
    resetTimer();
}

// Connect to SSE for progress updates
function connectSSE() {
    if (eventSource) {
        eventSource.close();
    }

    eventSource = new EventSource('/progress');
    
    eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        addConsoleLine(data.message, data.type);
        
        // Check if download completed
        if (data.message.includes('Playlist download completed')) {
            stopTimer();
        }
    };

    eventSource.onerror = (error) => {
        console.error('SSE Error:', error);
    };
}

// Connect to SSE on page load
connectSSE();

form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const playlistUrl = document.getElementById('playlistUrl').value;
    const includeMetadata = metadataCheckbox.checked;

    // Clear previous console
    clearConsole();

    // Disable button and show loading
    downloadBtn.disabled = true;
    btnText.textContent = 'Processing...';
    messageDiv.className = 'message';
    messageDiv.textContent = '';

    addConsoleLine('Starting playlist download...', 'info');
    startTimer();

    try {
        const response = await fetch('/download', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                playlistUrl,
                includeMetadata
            })
        });

        const data = await response.json();

        if (response.ok) {
            messageDiv.className = 'message success show';
            messageDiv.textContent = `✅ Download started! Processing ${data.totalVideos} videos from "${data.playlistTitle}". It can take some time so check your download directory in a few minutes ☕`;
        } else {
            messageDiv.className = 'message error show';
            messageDiv.textContent = `❌ Error: ${data.error}`;
            addConsoleLine(`Error: ${data.error}`, 'error');
            stopTimer();
        }
    } catch (error) {
        messageDiv.className = 'message error show';
        messageDiv.textContent = `❌ Error: ${error.message}`;
        addConsoleLine(`Error: ${error.message}`, 'error');
        stopTimer();
    } finally {
        downloadBtn.disabled = false;
        btnText.textContent = 'Download Playlist';
    }
});
