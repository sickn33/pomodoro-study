// Timer configuration
let MODES = {
  work: { duration: 25 * 60, label: "Focus Time", color: "--color-work" },
  shortBreak: {
    duration: 5 * 60,
    label: "Short Break",
    color: "--color-short",
  },
  longBreak: { duration: 15 * 60, label: "Long Break", color: "--color-long" },
};

// Task State
let tasks = [];

// DOM Elements
const timeDisplay = document.getElementById("time");
const startBtn = document.getElementById("startBtn");
const resetBtn = document.getElementById("resetBtn");
const sessionCount = document.getElementById("sessionCount");
const totalTime = document.getElementById("totalTime");
const modeBtns = document.querySelectorAll(".mode-btn");
const progressCircle = document.querySelector(".progress-ring__circle");

// Task Elements
const taskInput = document.getElementById("taskInput");
const addTaskBtn = document.getElementById("addTaskBtn");
const taskList = document.getElementById("taskList");
const tasksCount = document.getElementById("tasksCount");

// Settings Elements
const settingsBtn = document.getElementById("settingsBtn");
const settingsModal = document.getElementById("settingsModal");
const saveSettingsBtn = document.getElementById("saveSettings");
const cancelSettingsBtn = document.getElementById("cancelSettings");
const workDurationInput = document.getElementById("workDuration");
const shortBreakInput = document.getElementById("shortBreakDuration");
const longBreakInput = document.getElementById("longBreakDuration");

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

const CIRCUMFERENCE = 2 * Math.PI * 105; // radius is now 105 in HTML

// --- Initialization ---

function init() {
  loadSettings();
  loadTasks();

  // Set initial circumference
  progressCircle.style.strokeDasharray = CIRCUMFERENCE;

  // Restore date check
  checkDailyReset();

  // Initial render
  updateTimerState();
  renderTasks();
  updateStats();

  // Apply theme
  applyTheme(currentMode);
}

// --- Task Management ---

function loadTasks() {
  const saved = localStorage.getItem("pomodoro_tasks");
  if (saved) {
    tasks = JSON.parse(saved);
  }
}

function saveTasks() {
  localStorage.setItem("pomodoro_tasks", JSON.stringify(tasks));
  renderTasks();
}

function addTask(text) {
  if (!text.trim()) return;

  const newTask = {
    id: Date.now().toString(),
    text: text.trim(),
    completed: false,
    active: tasks.length === 0, // Make first task active by default if list empty
  };

  tasks.push(newTask);
  taskInput.value = "";
  saveTasks();
}

function toggleTask(id) {
  const task = tasks.find((t) => t.id === id);
  if (task) {
    task.completed = !task.completed;
    saveTasks();
  }
}

function deleteTask(id) {
  tasks = tasks.filter((t) => t.id !== id);
  saveTasks();
}

function setActiveTask(id) {
  tasks.forEach((t) => {
    t.active = t.id === id;
  });
  saveTasks();
}

function renderTasks() {
  taskList.innerHTML = "";

  const activeCount = tasks.filter((t) => !t.completed).length;
  tasksCount.textContent = `${activeCount} remaining`;

  tasks.forEach((task) => {
    const li = document.createElement("li");
    li.className = `task-item ${task.completed ? "completed" : ""} ${
      task.active && !task.completed ? "active-task" : ""
    }`;
    li.onclick = (e) => {
      // Don't trigger if clicking delete button or checkbox directly (handled by children)
      if (
        !e.target.closest(".delete-task") &&
        !e.target.closest(".task-checkbox")
      ) {
        setActiveTask(task.id);
      }
    };

    li.innerHTML = `
      <div class="task-checkbox" onclick="event.stopPropagation(); window.handleTaskToggle('${
        task.id
      }')">
        ${task.completed ? "✓" : ""}
      </div>
      <span class="task-text">${escapeHtml(task.text)}</span>
      <button class="delete-task" onclick="event.stopPropagation(); window.handleTaskDelete('${
        task.id
      }')" title="Delete">✕</button>
    `;
    taskList.appendChild(li);
  });
}

// Global handlers for HTML inline onclick
window.handleTaskToggle = toggleTask;
window.handleTaskDelete = deleteTask;

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// --- Timer Logic ---

function tick() {
  timeRemaining--;
  updateDisplay();

  if (timeRemaining <= 0) {
    completeSession();
  }
}

function completeSession() {
  pause();
  playSound();

  if (currentMode === "work") {
    sessions++;
    totalFocusMinutes += Math.round(MODES.work.duration / 60);

    // Save stats
    localStorage.setItem("pomodoro_sessions", sessions.toString());
    localStorage.setItem(
      "pomodoro_focus_minutes",
      totalFocusMinutes.toString()
    );
    updateStats();

    // Notify
    notifyUser("Focus Complete!", "Time for a break.");

    // Auto-switch
    const nextMode = sessions % 4 === 0 ? "longBreak" : "shortBreak";
    switchMode(nextMode);
  } else {
    notifyUser("Break Over!", "Ready to focus?");
    switchMode("work");
  }
}

function start() {
  if (!isRunning) {
    isRunning = true;
    interval = setInterval(tick, 1000);
    startBtn.textContent = "Pause";
    requestNotificationPermission();
  } else {
    pause();
  }
}

function pause() {
  isRunning = false;
  clearInterval(interval);
  startBtn.textContent = "Start";
}

function reset() {
  pause();
  timeRemaining = totalDuration;
  updateDisplay();
}

function switchMode(mode) {
  currentMode = mode;
  updateTimerState();
  applyTheme(mode);

  // Update UI buttons
  modeBtns.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.mode === mode);
  });
}

function updateTimerState() {
  totalDuration = MODES[currentMode].duration;
  timeRemaining = totalDuration;
  updateDisplay();
}

function updateDisplay() {
  const mins = Math.floor(timeRemaining / 60);
  const secs = timeRemaining % 60;
  const timeString = `${mins.toString().padStart(2, "0")}:${secs
    .toString()
    .padStart(2, "0")}`;

  timeDisplay.textContent = timeString;
  document.title = `${timeString} - ${MODES[currentMode].label}`;

  // Progress Ring
  const progress = timeRemaining / totalDuration;
  const offset = CIRCUMFERENCE * (1 - progress);
  progressCircle.style.strokeDashoffset = offset;
}

// --- Theming & Visuals ---

function applyTheme(mode) {
  const colorVar = MODES[mode].color; // e.g., --color-work

  // Set root variables for global theme
  document.documentElement.style.setProperty(
    "--current-color",
    `var(${colorVar})`
  );

  // Calculate glow color (mostly for the shadow)
  // We can just reuse the var since we used rgba in CSS for some, but specific vars for others
  // In style.css: --current-glow: rgba(..., 0.3)
  // Let's rely on hardcoded mappings for glow to match CSS intent perfectly
  let glowColor;
  switch (mode) {
    case "work":
      glowColor = "rgba(255, 107, 107, 0.3)";
      break;
    case "shortBreak":
      glowColor = "rgba(78, 205, 196, 0.3)";
      break;
    case "longBreak":
      glowColor = "rgba(69, 183, 209, 0.3)";
      break;
    default:
      glowColor = "rgba(255, 107, 107, 0.3)";
  }
  document.documentElement.style.setProperty("--current-glow", glowColor);
}

// --- Utils & Events ---

function playSound() {
  try {
    const audioContext = new (window.AudioContext ||
      window.webkitAudioContext)();
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();

    osc.connect(gain);
    gain.connect(audioContext.destination);

    osc.type = "sine";
    osc.frequency.setValueAtTime(440, audioContext.currentTime);
    osc.frequency.exponentialRampToValueAtTime(
      880,
      audioContext.currentTime + 0.1
    );

    gain.gain.setValueAtTime(0.3, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.01,
      audioContext.currentTime + 0.5
    );

    osc.start();
    osc.stop(audioContext.currentTime + 0.5);
  } catch (e) {
    console.error("Audio play failed", e);
  }
}

function notifyUser(title, body) {
  if (Notification.permission === "granted") {
    new Notification(title, { body, icon: "🍅" });
  }
}

function requestNotificationPermission() {
  if (Notification.permission === "default") {
    Notification.requestPermission();
  }
}

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

function updateStats() {
  sessionCount.textContent = sessions;
  const h = Math.floor(totalFocusMinutes / 60);
  const m = totalFocusMinutes % 60;
  totalTime.textContent = `${h}h ${m}m`;
}

function loadSettings() {
  const saved = localStorage.getItem("pomodoro_settings");
  if (saved) {
    const s = JSON.parse(saved);
    MODES.work.duration = s.work * 60;
    MODES.shortBreak.duration = s.shortBreak * 60;
    MODES.longBreak.duration = s.longBreak * 60;
  }
}

// Event Listeners
startBtn.addEventListener("click", start);
resetBtn.addEventListener("click", reset);

modeBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    pause();
    switchMode(btn.dataset.mode);
  });
});

addTaskBtn.addEventListener("click", () => addTask(taskInput.value));
taskInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addTask(taskInput.value);
});

// Settings Modal
settingsBtn.addEventListener("click", () => {
  pause();
  workDurationInput.value = Math.round(MODES.work.duration / 60);
  shortBreakInput.value = Math.round(MODES.shortBreak.duration / 60);
  longBreakInput.value = Math.round(MODES.longBreak.duration / 60);
  settingsModal.classList.add("active");
});

cancelSettingsBtn.addEventListener("click", () => {
  settingsModal.classList.remove("active");
});

saveSettingsBtn.addEventListener("click", () => {
  MODES.work.duration = (parseInt(workDurationInput.value) || 25) * 60;
  MODES.shortBreak.duration = (parseInt(shortBreakInput.value) || 5) * 60;
  MODES.longBreak.duration = (parseInt(longBreakInput.value) || 15) * 60;

  localStorage.setItem(
    "pomodoro_settings",
    JSON.stringify({
      work: parseInt(workDurationInput.value),
      shortBreak: parseInt(shortBreakInput.value),
      longBreak: parseInt(longBreakInput.value),
    })
  );

  settingsModal.classList.remove("active");
  updateTimerState();
});

settingsModal.addEventListener("click", (e) => {
  if (e.target === settingsModal) settingsModal.classList.remove("active");
});

// Initialize
init();
