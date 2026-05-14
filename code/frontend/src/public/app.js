// Constants
const MAX_HISTORY_ITEMS = 20;
const LANGUAGE_NAMES = {
  es: 'Spanish',
  fr: 'French',
  de: 'German',
};

// State
let currentSession = null;
let eventSource = null;
let sessionHistory = [];
let currentHistoryIndex = -1;

// Helpers
function getCurrentHistoryItem() {
  return currentHistoryIndex >= 0 && currentHistoryIndex < sessionHistory.length
    ? sessionHistory[currentHistoryIndex]
    : null;
}

function closeHistoryPanel() {
  historyPanel.style.display = 'none';
  historyToggle.textContent = '📋 History';
}

// Load history from localStorage on startup
function loadHistory() {
  const saved = localStorage.getItem('translationHistory');
  if (saved) {
    try {
      sessionHistory = JSON.parse(saved);
    } catch (e) {
      console.error('Failed to load history:', e);
      sessionHistory = [];
    }
  }
}

// Save history to localStorage
function saveHistory() {
  try {
    const historyToSave = sessionHistory.slice(-MAX_HISTORY_ITEMS);
    localStorage.setItem('translationHistory', JSON.stringify(historyToSave));
  } catch (e) {
    console.error('Failed to save history:', e);
  }
}

// Add session to history
function addToHistory(session, originalText) {
  // Remove any items after current position (when navigating back then creating new)
  if (currentHistoryIndex < sessionHistory.length - 1) {
    sessionHistory = sessionHistory.slice(0, currentHistoryIndex + 1);
  }

  const historyItem = {
    session,
    originalText,
    timestamp: Date.now(),
  };

  sessionHistory.push(historyItem);
  currentHistoryIndex = sessionHistory.length - 1;
  saveHistory();
  updateHistoryUI();
}

// Navigate history
function navigateHistory(direction) {
  const newIndex = currentHistoryIndex + direction;

  if (newIndex >= 0 && newIndex < sessionHistory.length) {
    currentHistoryIndex = newIndex;
    const historyItem = sessionHistory[currentHistoryIndex];

    // Disconnect from SSE (we're viewing history, not live)
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }

    closeHistoryPanel();
    showResults(historyItem.session, historyItem.originalText);
    updateHistoryUI();
    resultsSection.scrollIntoView({ behavior: 'smooth' });
  }
}

// Update history UI controls
function updateHistoryUI() {
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const historyPosition = document.getElementById('historyPosition');

  prevBtn.disabled = currentHistoryIndex <= 0;
  nextBtn.disabled = currentHistoryIndex >= sessionHistory.length - 1;

  if (sessionHistory.length > 0) {
    historyPosition.textContent = `${currentHistoryIndex + 1} of ${sessionHistory.length}`;
  } else {
    historyPosition.textContent = '';
  }

  renderHistoryList();
}

// Render history list
function renderHistoryList() {
  const historyList = document.getElementById('historyList');

  if (sessionHistory.length === 0) {
    historyList.innerHTML =
      '<p style="color: var(--text-muted); text-align: center;">No history yet</p>';
    return;
  }

  historyList.innerHTML = '';

  // Show in reverse order (newest first)
  for (let i = sessionHistory.length - 1; i >= 0; i--) {
    const item = sessionHistory[i];
    const isActive = i === currentHistoryIndex;

    const itemEl = document.createElement('div');
    itemEl.className = `history-item ${isActive ? 'active' : ''}`;
    itemEl.onclick = () => {
      currentHistoryIndex = i;
      const historyItem = sessionHistory[i];

      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }

      closeHistoryPanel();
      showResults(historyItem.session, historyItem.originalText);
      updateHistoryUI();
      resultsSection.scrollIntoView({ behavior: 'smooth' });
    };

    const text =
      item.originalText.length > 50
        ? item.originalText.substring(0, 50) + '...'
        : item.originalText;

    const date = new Date(item.timestamp);
    const timeStr = date.toLocaleTimeString();
    const dateStr = date.toLocaleDateString();

    itemEl.innerHTML = `
      <div class="history-item-text">
        <div>${text}</div>
        <div class="history-item-meta">${item.session.jobs.length} language(s) · ${dateStr}</div>
      </div>
      <div class="history-item-time">${timeStr}</div>
    `;

    historyList.appendChild(itemEl);
  }
}

// Initialize history on load
loadHistory();
updateHistoryUI();

// DOM elements
const form = document.getElementById('translationForm');
const submitBtn = document.getElementById('submitBtn');
const errorDiv = document.getElementById('error');
const resultsSection = document.getElementById('resultsSection');
const sessionInfo = document.getElementById('sessionInfo');
const resultsGrid = document.getElementById('resultsGrid');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const historyToggle = document.getElementById('historyToggle');
const historyPanel = document.getElementById('historyPanel');

// History navigation
prevBtn.addEventListener('click', () => navigateHistory(-1));
nextBtn.addEventListener('click', () => navigateHistory(1));

historyToggle.addEventListener('click', () => {
  const isVisible = historyPanel.style.display !== 'none';
  historyPanel.style.display = isVisible ? 'none' : 'block';
  historyToggle.textContent = isVisible ? '📋 History' : '✖ Close History';
});

// Form submission handler
form.addEventListener('submit', async (e) => {
  e.preventDefault();

  // Clear previous errors
  hideError();

  // Get form data
  const formData = new FormData(form);
  const text = formData.get('text').trim();
  const targetLanguages = formData.getAll('targetLanguages');

  // Validate
  if (!text) {
    showError('Please enter some text to translate');
    return;
  }

  if (targetLanguages.length === 0) {
    showError('Please select at least one target language');
    return;
  }

  if (targetLanguages.length > 3) {
    showError('Maximum 3 target languages allowed');
    return;
  }

  // Disable form
  submitBtn.disabled = true;
  submitBtn.textContent = 'Submitting...';

  // Close history panel if open
  closeHistoryPanel();

  try {
    // Submit translation request
    const response = await fetch('/api/translate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        targetLanguages,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        errorData.error || 'Failed to submit translation request',
      );
    }

    const data = await response.json();
    currentSession = data;

    // Add to history
    addToHistory(data, text);

    // Show results section (live)
    showResults(data, text, true);

    // Connect to SSE
    connectToSSE(data.sessionId);
  } catch (error) {
    showError(error.message);
    submitBtn.disabled = false;
    submitBtn.textContent = 'Translate';
  }
});

// Show error message
function showError(message) {
  errorDiv.textContent = message;
  errorDiv.style.display = 'block';
}

// Hide error message
function hideError() {
  errorDiv.style.display = 'none';
  errorDiv.textContent = '';
}

// Show results section
function showResults(session, originalText, isLive = false) {
  // Show session info
  sessionInfo.innerHTML = `
        <div><strong>Session ID:</strong> ${session.sessionId}</div>
        <div><strong>Original text:</strong> ${originalText}</div>
        <div><strong>Target languages:</strong> ${session.jobs.length}</div>
    `;

  // Add/remove live indicator
  if (isLive) {
    sessionInfo.classList.add('live');
  } else {
    sessionInfo.classList.remove('live');
  }

  // Create result cards
  resultsGrid.innerHTML = '';
  for (const job of session.jobs) {
    // Determine status and content from job if available
    const status = job.status || 'queued';
    const content = job.translatedText || job.error || null;
    const card = createResultCard(job.targetLanguage, status, content);
    resultsGrid.appendChild(card);
  }

  // Show results section
  resultsSection.style.display = 'block';

  // Scroll to results
  resultsSection.scrollIntoView({ behavior: 'smooth' });
}

// Create result card
function createResultCard(language, status, content = null) {
  const card = document.createElement('div');
  card.className = `result-card ${status}`;
  card.id = `result-${language}`;

  const statusHtml =
    status === 'processing'
      ? `<span class="status-badge status-${status}"><span class="spinner"></span> ${status}</span>`
      : `<span class="status-badge status-${status}">${status}</span>`;

  let contentHtml = '';
  if (status === 'queued') {
    contentHtml = '<p class="result-content">Waiting in queue...</p>';
  } else if (status === 'processing') {
    contentHtml = '<p class="result-content">Translating...</p>';
  } else if (status === 'completed' && content) {
    contentHtml = `<p class="result-content">${content}</p>`;
  } else if (status === 'error' && content) {
    contentHtml = `<p class="result-content error-content">Error: ${content}</p>`;
  }

  card.innerHTML = `
        <div class="result-header">
            <div class="language-name">${LANGUAGE_NAMES[language] || language}</div>
            ${statusHtml}
        </div>
        <div class="result-body">
            ${contentHtml}
        </div>
    `;

  return card;
}

// Update result card
function updateResultCard(language, status, content = null) {
  const existingCard = document.getElementById(`result-${language}`);
  if (existingCard) {
    existingCard.replaceWith(createResultCard(language, status, content));
  }
}

// Connect to SSE
function connectToSSE(sessionId) {
  // Close existing connection
  if (eventSource) {
    eventSource.close();
  }

  // Create new EventSource
  eventSource = new EventSource(`/api/translate/${sessionId}/events`);

  eventSource.addEventListener('translation_complete', (event) => {
    const result = JSON.parse(event.data);
    console.log('Translation complete:', result);
    updateResultCard(result.targetLanguage, 'completed', result.translatedText);

    // Update history with completed translation
    const historyItem = getCurrentHistoryItem();
    if (historyItem) {
      const job = historyItem.session.jobs.find(
        (j) => j.targetLanguage === result.targetLanguage,
      );
      if (job) {
        job.status = 'completed';
        job.translatedText = result.translatedText;
        saveHistory();
      }
    }
  });

  eventSource.addEventListener('translation_error', (event) => {
    const result = JSON.parse(event.data);
    console.error('Translation error:', result);
    updateResultCard(result.targetLanguage, 'error', result.error);

    // Update history with error
    const historyItem = getCurrentHistoryItem();
    if (historyItem) {
      const job = historyItem.session.jobs.find(
        (j) => j.targetLanguage === result.targetLanguage,
      );
      if (job) {
        job.status = 'error';
        job.error = result.error;
        saveHistory();
      }
    }
  });

  eventSource.addEventListener('session_complete', (event) => {
    const result = JSON.parse(event.data);
    console.log('Session complete:', result);

    // Close SSE connection
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }

    // Re-enable form
    submitBtn.disabled = false;
    submitBtn.textContent = 'Translate';
  });

  eventSource.addEventListener('error', (error) => {
    console.error('SSE error:', error);

    if (eventSource.readyState === EventSource.CLOSED) {
      console.log('SSE connection closed');
    }
  });

  // Auto-update status to processing when connection is established
  // (slight delay to show queued state first)
  setTimeout(() => {
    if (currentSession && currentSession.jobs) {
      for (const job of currentSession.jobs) {
        // Only update if still queued
        const card = document.getElementById(`result-${job.targetLanguage}`);
        if (card && card.textContent.includes('Waiting in queue')) {
          updateResultCard(job.targetLanguage, 'processing');
        }
      }
    }
  }, 1000);
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (eventSource) {
    eventSource.close();
  }
});
