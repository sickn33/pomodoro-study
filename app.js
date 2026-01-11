// Timer configuration (mutable for custom settings)
let MODES = {
  work: { duration: 25 * 60, label: "Focus Time" },
  shortBreak: { duration: 5 * 60, label: "Short Break" },
  longBreak: { duration: 15 * 60, label: "Long Break" },
};

// Load saved settings with error handling
function loadSettings() {
  try {
    const saved = localStorage.getItem("pomodoro_settings");
    if (saved) {
      const settings = JSON.parse(saved);
      // Validate parsed values before applying
      if (settings.work > 0) MODES.work.duration = settings.work * 60;
      if (settings.shortBreak > 0)
        MODES.shortBreak.duration = settings.shortBreak * 60;
      if (settings.longBreak > 0)
        MODES.longBreak.duration = settings.longBreak * 60;
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

// Settings modal elements
const settingsBtn = document.getElementById("settingsBtn");
const settingsModal = document.getElementById("settingsModal");
const saveSettingsBtn = document.getElementById("saveSettings");
const cancelSettingsBtn = document.getElementById("cancelSettings");
const workDurationInput = document.getElementById("workDuration");
const shortBreakInput = document.getElementById("shortBreakDuration");
const longBreakInput = document.getElementById("longBreakDuration");

// Circle circumference
const CIRCUMFERENCE = 2 * Math.PI * 90;
progressCircle.style.strokeDasharray = CIRCUMFERENCE;

// Initialize
function init() {
  loadSettings();
  timeRemaining = MODES[currentMode].duration;
  totalDuration = MODES[currentMode].duration;
  updateDisplay();
  updateStats();
  showRandomTip();
  checkDailyReset();
  populateSettingsInputs();
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

// Play notification sound using reusable AudioContext
function playSound() {
  // Create AudioContext on first use (avoids browser autoplay restrictions)
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }

  // Resume context if suspended (browser security feature)
  if (audioContext.state === "suspended") {
    audioContext.resume();
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

// Complete session
function completeSession() {
  pause();
  playSound();

  if (currentMode === "work") {
    sessions++;
    // FIX: Use actual work duration instead of hardcoded 25 minutes
    const focusMinutesCompleted = Math.round(MODES.work.duration / 60);
    totalFocusMinutes += focusMinutesCompleted;
    localStorage.setItem("pomodoro_sessions", sessions.toString());
    localStorage.setItem(
      "pomodoro_focus_minutes",
      totalFocusMinutes.toString()
    );
    updateStats();

    // Auto-switch to break
    const nextMode = sessions % 4 === 0 ? "longBreak" : "shortBreak";
    switchMode(nextMode);

    // Browser notification
    if (Notification.permission === "granted") {
      new Notification("🍅 Pomodoro Complete!", {
        body: `Great work! Time for a ${
          nextMode === "longBreak" ? "long" : "short"
        } break.`,
        icon: "🍅",
      });
    }
  } else {
    // Auto-switch back to work
    switchMode("work");
    showRandomTip();

    if (Notification.permission === "granted") {
      new Notification("⏰ Break Over!", {
        body: "Ready to focus again?",
        icon: "🍅",
      });
    }
  }
}

// Start timer
function start() {
  if (!isRunning) {
    isRunning = true;
    interval = setInterval(tick, 1000);
    startBtn.textContent = "Pause";
    timerCard.classList.add("running");

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
}

// Reset timer
function reset() {
  pause();
  timeRemaining = totalDuration;
  updateDisplay();
}

// Switch mode
function switchMode(mode) {
  currentMode = mode;
  totalDuration = MODES[mode].duration;
  timeRemaining = totalDuration;

  // Update UI
  modeBtns.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === mode);
  });

  // Update progress ring color
  const isBreak = mode !== "work";
  progressCircle.classList.toggle("break", isBreak);

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
