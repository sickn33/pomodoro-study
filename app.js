// ============================================
// CONSTANTS
// ============================================
const PROGRESS_CIRCLE_RADIUS = 90;
const CIRCUMFERENCE = 2 * Math.PI * PROGRESS_CIRCLE_RADIUS;
const TIMER_INTERVAL_MS = 100; // Use smaller interval for smoother updates
const SESSIONS_FOR_LONG_BREAK = 4;

// Timer configuration (mutable for custom settings)
let MODES = {
  work: { duration: 25 * 60, label: "Focus Time" },
  shortBreak: { duration: 5 * 60, label: "Short Break" },
  longBreak: { duration: 15 * 60, label: "Long Break" },
};

// ============================================
// SETTINGS PERSISTENCE
// ============================================

/**
 * Load saved settings from localStorage with validation and error handling.
 * Falls back to defaults if data is corrupted or invalid.
 */
function loadSettings() {
  try {
    const saved = localStorage.getItem("pomodoro_settings");
    if (saved) {
      const settings = JSON.parse(saved);
      // Validate parsed values before applying (must be positive numbers)
      if (typeof settings.work === "number" && settings.work > 0) {
        MODES.work.duration = settings.work * 60;
      }
      if (typeof settings.shortBreak === "number" && settings.shortBreak > 0) {
        MODES.shortBreak.duration = settings.shortBreak * 60;
      }
      if (typeof settings.longBreak === "number" && settings.longBreak > 0) {
        MODES.longBreak.duration = settings.longBreak * 60;
      }
    }
  } catch (e) {
    // If localStorage data is corrupted, reset to defaults
    console.warn("Failed to load settings, using defaults:", e);
    localStorage.removeItem("pomodoro_settings");
  }
}

const TIPS = [
  "Stay hydrated! Keep a glass of water nearby while studying.",
  "Take notes by hand - it helps with memory retention.",
  "Review your notes within 24 hours for better recall.",
  "Break complex topics into smaller, manageable chunks.",
  "Teach concepts to others to deepen your understanding.",
  "Get enough sleep - your brain consolidates memories while resting.",
  "Use active recall instead of passive re-reading.",
  "Take short walks between sessions to boost creativity.",
  "Minimize distractions - put your phone in another room.",
  "Set specific goals for each study session.",
];

// Track last shown tip to avoid consecutive duplicates
let lastTipIndex = -1;

// Reusable AudioContext for sound playback (created on first use)
let audioContext = null;

// Timer persistence functions
function saveTimerState() {
  if (isRunning) {
    const endTimestamp = Date.now() + timeRemaining * 1000;
    localStorage.setItem(
      "pomodoro_timer_state",
      JSON.stringify({
        endTimestamp,
        mode: currentMode,
        totalDuration,
      })
    );
  }
}

function clearTimerState() {
  localStorage.removeItem("pomodoro_timer_state");
}

function restoreTimerState() {
  try {
    const saved = localStorage.getItem("pomodoro_timer_state");
    if (!saved) return false;

    const state = JSON.parse(saved);
    const now = Date.now();
    const remaining = Math.floor((state.endTimestamp - now) / 1000);

    if (remaining <= 0) {
      // Timer has expired while page was closed
      clearTimerState();
      // Switch to appropriate mode and complete
      currentMode = state.mode;
      totalDuration = state.totalDuration || MODES[state.mode].duration;
      timeRemaining = 0;
      return "expired";
    }

    // Restore running timer
    currentMode = state.mode;
    totalDuration = state.totalDuration || MODES[state.mode].duration;
    timeRemaining = remaining;
    return true;
  } catch (e) {
    console.warn("Failed to restore timer state:", e);
    clearTimerState();
    return false;
  }
}

// State
let currentMode = "work";
let timeRemaining = MODES.work.duration;
let totalDuration = MODES.work.duration;
let isRunning = false;
let interval = null;
let sessions = parseInt(localStorage.getItem("pomodoro_sessions") || "0");
let totalFocusMinutes = parseInt(
  localStorage.getItem("pomodoro_focus_minutes") || "0"
);

// DOM Elements
const timeDisplay = document.getElementById("time");
const startBtn = document.getElementById("startBtn");
const resetBtn = document.getElementById("resetBtn");
const sessionCount = document.getElementById("sessionCount");
const totalTime = document.getElementById("totalTime");
const tipElement = document.getElementById("tip");
const timerCard = document.querySelector(".timer-card");
const progressCircle = document.querySelector(".progress-ring__circle");
const modeBtns = document.querySelectorAll(".mode-btn");
const modeLabel = document.getElementById("modeLabel");

// Settings modal elements
const settingsBtn = document.getElementById("settingsBtn");
const settingsModal = document.getElementById("settingsModal");
const saveSettingsBtn = document.getElementById("saveSettings");
const cancelSettingsBtn = document.getElementById("cancelSettings");
const workDurationInput = document.getElementById("workDuration");
const shortBreakInput = document.getElementById("shortBreakDuration");
const longBreakInput = document.getElementById("longBreakDuration");

// Initialize progress circle
if (progressCircle) {
  progressCircle.style.strokeDasharray = CIRCUMFERENCE;
}

// Initialize
function init() {
  loadSettings();
  checkDailyReset();

  // Try to restore a running timer from previous session
  const restored = restoreTimerState();

  if (restored === "expired") {
    // Timer expired while page was closed - complete the session
    updateModeButtons();
    updateDisplay();
    completeSession();
  } else if (restored === true) {
    // Timer is still running - resume it
    updateModeButtons();
    updateDisplay();
    // Auto-start the timer
    isRunning = true;
    interval = setInterval(tick, 1000);
    startBtn.textContent = "Pause";
    timerCard.classList.add("running");
  } else {
    // No saved timer - normal initialization
    timeRemaining = MODES[currentMode].duration;
    totalDuration = MODES[currentMode].duration;
    updateDisplay();
  }

  updateStats();
  showRandomTip();
  populateSettingsInputs();
}

// Update mode buttons to reflect current mode
function updateModeButtons() {
  modeBtns.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === currentMode);
  });
  const isBreak = currentMode !== "work";
  progressCircle.classList.toggle("break", isBreak);

  // Update mode label text
  if (modeLabel) {
    modeLabel.textContent = MODES[currentMode].label;
  }
}

// Populate settings inputs with current values
function populateSettingsInputs() {
  workDurationInput.value = Math.round(MODES.work.duration / 60);
  shortBreakInput.value = Math.round(MODES.shortBreak.duration / 60);
  longBreakInput.value = Math.round(MODES.longBreak.duration / 60);
}

// Check if we need to reset daily stats
function checkDailyReset() {
  const lastDate = localStorage.getItem("pomodoro_date");
  const today = new Date().toDateString();

  if (lastDate !== today) {
    sessions = 0;
    totalFocusMinutes = 0;
    localStorage.setItem("pomodoro_date", today);
    localStorage.setItem("pomodoro_sessions", "0");
    localStorage.setItem("pomodoro_focus_minutes", "0");
    updateStats();
  }
}

// Format time as MM:SS
function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs
    .toString()
    .padStart(2, "0")}`;
}

// Update time display
function updateDisplay() {
  timeDisplay.textContent = formatTime(timeRemaining);
  document.title = `${formatTime(timeRemaining)} - 🍅 Pomodoro`;

  // Update progress ring
  const progress = timeRemaining / totalDuration;
  const offset = CIRCUMFERENCE * (1 - progress);
  progressCircle.style.strokeDashoffset = offset;
}

// Update stats display
function updateStats() {
  sessionCount.textContent = sessions;
  const hours = Math.floor(totalFocusMinutes / 60);
  const mins = totalFocusMinutes % 60;
  totalTime.textContent = `${hours}h ${mins}m`;
}

// Show random study tip, avoiding consecutive duplicates
function showRandomTip() {
  let newIndex;
  do {
    newIndex = Math.floor(Math.random() * TIPS.length);
  } while (newIndex === lastTipIndex && TIPS.length > 1);
  lastTipIndex = newIndex;
  tipElement.textContent = TIPS[newIndex];
}

/**
 * Send a browser notification safely, handling potential errors.
 * @param {string} title - Notification title
 * @param {string} body - Notification body text
 */
function safeNotify(title, body) {
  try {
    if (Notification.permission === "granted") {
      new Notification(title, { body, icon: "🍅" });
    }
  } catch (e) {
    console.warn("Failed to show notification:", e);
  }
}

/**
 * Play notification sound using reusable AudioContext.
 * Wrapped in try-catch to handle restricted environments.
 */
function playSound() {
  try {
    // Create AudioContext on first use (avoids browser autoplay restrictions)
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    // Resume context if suspended (browser security feature)
    if (audioContext.state === "suspended") {
      audioContext.resume();
    }
  } catch (e) {
    console.warn("AudioContext not available:", e);
    return; // Exit gracefully if audio is not supported
  }

  // Create a pleasant chime
  const playTone = (freq, startTime, duration) => {
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();

    osc.connect(gain);
    gain.connect(audioContext.destination);

    osc.frequency.value = freq;
    osc.type = "sine";

    gain.gain.setValueAtTime(0.3, startTime);
    gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);

    osc.start(startTime);
    osc.stop(startTime + duration);
  };

  const now = audioContext.currentTime;
  playTone(523.25, now, 0.2); // C5
  playTone(659.25, now + 0.15, 0.2); // E5
  playTone(783.99, now + 0.3, 0.3); // G5
}

// Timer tick
function tick() {
  timeRemaining--;
  updateDisplay();

  if (timeRemaining <= 0) {
    completeSession();
  }
}

/**
 * Complete the current session and transition to the next mode.
 * Handles statistics updates and browser notifications.
 */
function completeSession() {
  pause();
  playSound();

  if (currentMode === "work") {
    sessions++;
    // Use actual work duration for accurate tracking
    const focusMinutesCompleted = Math.round(MODES.work.duration / 60);
    totalFocusMinutes += focusMinutesCompleted;
    localStorage.setItem("pomodoro_sessions", sessions.toString());
    localStorage.setItem(
      "pomodoro_focus_minutes",
      totalFocusMinutes.toString()
    );
    updateStats();

    // Auto-switch to break (long break every N sessions)
    const nextMode =
      sessions % SESSIONS_FOR_LONG_BREAK === 0 ? "longBreak" : "shortBreak";
    switchMode(nextMode);

    // Browser notification using safe helper
    const breakType = nextMode === "longBreak" ? "long" : "short";
    safeNotify(
      "🍅 Pomodoro Complete!",
      `Great work! Time for a ${breakType} break.`
    );
  } else {
    // Auto-switch back to work
    switchMode("work");
    showRandomTip();

    safeNotify("⏰ Break Over!", "Ready to focus again?");
  }
}

// Start timer
function start() {
  if (!isRunning) {
    isRunning = true;
    interval = setInterval(tick, 1000);
    startBtn.textContent = "Pause";
    timerCard.classList.add("running");

    // Save timer state for persistence across page reloads
    saveTimerState();

    // Request notification permission
    if (Notification.permission === "default") {
      Notification.requestPermission();
    }
  } else {
    pause();
  }
}

// Pause timer with null-safe interval clearing
function pause() {
  isRunning = false;
  if (interval !== null) {
    clearInterval(interval);
    interval = null;
  }
  startBtn.textContent = "Start";
  timerCard.classList.remove("running");

  // Clear saved timer state when paused
  clearTimerState();
}

// Reset timer
function reset() {
  pause();
  clearTimerState();
  timeRemaining = totalDuration;
  updateDisplay();
}

/**
 * Switch to a different timer mode.
 * @param {string} mode - The mode to switch to ('work', 'shortBreak', 'longBreak')
 */
function switchMode(mode) {
  if (!MODES[mode]) {
    console.warn(`Invalid mode: ${mode}`);
    return;
  }

  currentMode = mode;
  totalDuration = MODES[mode].duration;
  timeRemaining = totalDuration;

  // Reuse updateModeButtons for DRY compliance
  updateModeButtons();
  updateDisplay();
}

// Event listeners
startBtn.addEventListener("click", start);
resetBtn.addEventListener("click", reset);

modeBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    pause();
    switchMode(btn.dataset.mode);
  });
});

// Keyboard shortcuts
document.addEventListener("keydown", (e) => {
  if (e.code === "Space" && !settingsModal.classList.contains("active")) {
    e.preventDefault();
    start();
  } else if (e.code === "KeyR" && !settingsModal.classList.contains("active")) {
    reset();
  } else if (e.code === "Escape") {
    closeSettings();
  }
});

// Settings modal functions
function openSettings() {
  pause();
  populateSettingsInputs();
  settingsModal.classList.add("active");
}

function closeSettings() {
  settingsModal.classList.remove("active");
}

function saveSettings() {
  // Validate and clamp input values to safe ranges
  const clamp = (val, min, max) => Math.max(min, Math.min(max, val));

  const work = clamp(parseInt(workDurationInput.value) || 25, 1, 120);
  const shortBreak = clamp(parseInt(shortBreakInput.value) || 5, 1, 30);
  const longBreak = clamp(parseInt(longBreakInput.value) || 15, 1, 60);

  // Update input fields to reflect clamped values
  workDurationInput.value = work;
  shortBreakInput.value = shortBreak;
  longBreakInput.value = longBreak;

  MODES.work.duration = work * 60;
  MODES.shortBreak.duration = shortBreak * 60;
  MODES.longBreak.duration = longBreak * 60;

  localStorage.setItem(
    "pomodoro_settings",
    JSON.stringify({ work, shortBreak, longBreak })
  );

  // Update current timer if not running
  totalDuration = MODES[currentMode].duration;
  timeRemaining = totalDuration;
  updateDisplay();
  closeSettings();
}

settingsBtn.addEventListener("click", openSettings);
cancelSettingsBtn.addEventListener("click", closeSettings);
saveSettingsBtn.addEventListener("click", saveSettings);
settingsModal.addEventListener("click", (e) => {
  if (e.target === settingsModal) closeSettings();
});

// Initialize app
init();
