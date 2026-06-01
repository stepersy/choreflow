/* ================= CHOREFLOW INTERACTIVE CONTROLLER ================= */

// State Variables
let currentUser = null;
let selectedDate = null; // Format: YYYY-MM-DD
let userResponses = {};  // Format: { 'YYYY-MM-DD': { lunch: { home: bool, washed: bool }, dinner: { ... } } }
let wizardState = {
    stepHistory: [],     // Stores IDs of previous steps for back navigation
    answers: {}          // Current active responses being entered
};

// Available questionnaire screens in order
const WIZARD_STEPS = {
    LUNCH_HOME: 'step-lunch-home',
    LUNCH_WASH: 'step-lunch-wash',
    DINNER_HOME: 'step-dinner-home',
    DINNER_WASH: 'step-dinner-wash'
};

// Initial setup on document load
document.addEventListener('DOMContentLoaded', () => {
    // Set selected date to today (local time in YYYY-MM-DD format)
    const today = new Date();
    selectedDate = formatDateString(today);
    
    // Register Service Worker for real mobile lock-screen alerts
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('service-worker.js')
            .then(reg => console.log('Service Worker registered successfully:', reg))
            .catch(err => console.error('Service Worker registration failed:', err));
    }
    
    // Check if there is an active session
    const savedUser = localStorage.getItem('choreflow_logged_in_user');
    if (savedUser) {
        loginUser(savedUser);
    } else {
        showScreen('auth-screen');
    }
    
    // Start notification background check
    startNotificationService();
});

// Mock hour helper to allow manually testing time gates (e.g. ?mockHour=15)
function getActiveHour() {
    const urlParams = new URLSearchParams(window.location.search);
    const mockHour = urlParams.get('mockHour');
    if (mockHour !== null) {
        return parseInt(mockHour, 10);
    }
    return new Date().getHours();
}

/* ================= DATE FORMATTING UTILITIES ================= */

// Format Date object to YYYY-MM-DD
function formatDateString(date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

// Get Monday of the week YYYY-MM-DD string
function getMondayOfDateString(dateStr) {
    const parts = dateStr.split('-');
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const d = new Date(year, month, day);
    const dayOfWeek = d.getDay();
    const diff = d.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    return formatDateString(new Date(d.setDate(diff)));
}

// Get formatted week range display e.g. "Week of May 25 - May 31"
function getWeekRangeDisplay(dateStr) {
    const mondayStr = getMondayOfDateString(dateStr);
    const parts = mondayStr.split('-');
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const monday = new Date(year, month, day);
    
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    
    const optMonthDay = { month: 'short', day: 'numeric' };
    const mondayStrFormatted = monday.toLocaleDateString('en-US', optMonthDay);
    
    let sundayStrFormatted = '';
    if (monday.getMonth() === sunday.getMonth()) {
        sundayStrFormatted = sunday.toLocaleDateString('en-US', { day: 'numeric' });
    } else {
        sundayStrFormatted = sunday.toLocaleDateString('en-US', optMonthDay);
    }
    
    let yearStr = '';
    if (monday.getFullYear() !== new Date().getFullYear()) {
        yearStr = `, ${monday.getFullYear()}`;
    }
    
    return `Week of ${mondayStrFormatted} - ${sundayStrFormatted}${yearStr}`;
}

// Get phrasing for dynamic wizard questions e.g. "on the 25 of May"
function getQuestionDatePhrase(dateStr) {
    const todayStr = formatDateString(new Date());
    if (dateStr === todayStr) {
        return "today";
    }
    
    const parts = dateStr.split('-');
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const adjustedDate = new Date(year, month, day);
    
    const monthName = adjustedDate.toLocaleDateString('en-US', { month: 'long' });
    return `on the ${day} of ${monthName}`;
}

// Format YYYY-MM-DD to "Today, Mon DD" or "Mon DD, YYYY"
function getFormattedDisplayDate(dateStr) {
    const todayStr = formatDateString(new Date());
    
    // Parse the date string safely in local time to avoid timezone shifts
    const parts = dateStr.split('-');
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const adjustedDate = new Date(year, month, day);
    
    const options = { weekday: 'long', month: 'short', day: 'numeric' };
    let formatted = adjustedDate.toLocaleDateString('en-US', options);
    
    if (dateStr === todayStr) {
        return `Today, ${adjustedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    }
    
    // Add year if different
    if (adjustedDate.getFullYear() !== new Date().getFullYear()) {
        formatted += `, ${adjustedDate.getFullYear()}`;
    }
    return formatted;
}

/* ================= SCREEN NAVIGATION ================= */
function showScreen(screenId) {
    document.querySelectorAll('.screen, .screen-content').forEach(screen => {
        screen.classList.add('hidden');
    });
    
    if (screenId === 'auth-screen') {
        document.getElementById('auth-screen').classList.remove('hidden');
        document.getElementById('main-app').classList.add('hidden');
    } else {
        document.getElementById('main-app').classList.remove('hidden');
        document.getElementById(screenId).classList.remove('hidden');
    }
}

/* ================= AUTHENTICATION FLOW ================= */
function switchAuthTab(tab) {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const tabs = document.querySelectorAll('.auth-tab');
    const messageEl = document.getElementById('auth-message');
    
    messageEl.textContent = '';
    
    if (tab === 'login') {
        tabs[0].classList.add('active');
        tabs[1].classList.remove('active');
        loginForm.classList.remove('hidden');
        registerForm.classList.add('hidden');
    } else {
        tabs[0].classList.remove('active');
        tabs[1].classList.add('active');
        loginForm.classList.add('hidden');
        registerForm.classList.remove('hidden');
    }
}

function handleLogin(event) {
    event.preventDefault();
    const usernameInput = document.getElementById('login-username').value.trim();
    const passwordInput = document.getElementById('login-password').value;
    const messageEl = document.getElementById('auth-message');
    
    if (!usernameInput || !passwordInput) return;
    
    const users = JSON.parse(localStorage.getItem('choreflow_users') || '{}');
    
    // For demo purposes, we will support instant registration/login or match password
    if (users[usernameInput.toLowerCase()]) {
        if (users[usernameInput.toLowerCase()].password === passwordInput) {
            loginUser(usernameInput);
        } else {
            messageEl.textContent = 'Incorrect password!';
            messageEl.className = 'auth-message error';
        }
    } else {
        messageEl.textContent = 'Username not found. Please click register!';
        messageEl.className = 'auth-message error';
    }
}

function handleRegister(event) {
    event.preventDefault();
    const usernameInput = document.getElementById('register-username').value.trim();
    const passwordInput = document.getElementById('register-password').value;
    const confirmPasswordInput = document.getElementById('register-confirm-password').value;
    const messageEl = document.getElementById('auth-message');
    
    if (!usernameInput || !passwordInput) return;
    
    if (passwordInput !== confirmPasswordInput) {
        messageEl.textContent = 'Passwords do not match!';
        messageEl.className = 'auth-message error';
        return;
    }
    
    const users = JSON.parse(localStorage.getItem('choreflow_users') || '{}');
    const lowerUser = usernameInput.toLowerCase();
    
    if (users[lowerUser]) {
        messageEl.textContent = 'Username already exists!';
        messageEl.className = 'auth-message error';
        return;
    }
    
    // Save User
    users[lowerUser] = {
        username: usernameInput,
        password: passwordInput
    };
    localStorage.setItem('choreflow_users', JSON.stringify(users));
    
    messageEl.textContent = 'Account created successfully! Logging in...';
    messageEl.className = 'auth-message success';
    
    setTimeout(() => {
        loginUser(usernameInput);
    }, 800);
}

function loginUser(username) {
    currentUser = username;
    localStorage.setItem('choreflow_logged_in_user', username);
    
    // Load existing responses
    userResponses = JSON.parse(localStorage.getItem(`choreflow_responses_${currentUser.toLowerCase()}`) || '{}');
    
    // Update Header Profile Info
    document.getElementById('user-display-name').textContent = currentUser;
    document.getElementById('user-initial').textContent = currentUser.charAt(0).toUpperCase();
    
    // Clear login form
    document.getElementById('login-username').value = '';
    document.getElementById('login-password').value = '';
    
    // Request permission for push reminders
    requestNotificationPermission();
    
    // Initialize session state on load
    checkStatusAndLoadScreen();
}

function handleLogout() {
    currentUser = null;
    userResponses = {};
    localStorage.removeItem('choreflow_logged_in_user');
    showScreen('auth-screen');
}

/* ================= DATE MANAGEMENT ================= */
function checkStatusAndLoadScreen() {
    // Sync Date Text UI
    document.getElementById('current-date-text').textContent = getFormattedDisplayDate(selectedDate);
    
    // Sync week navigation range label
    document.getElementById('week-display-range').textContent = getWeekRangeDisplay(selectedDate);
    
    // Block forward date tracking (disable future date logging for realism)
    const todayStr = formatDateString(new Date());
    const nextDateBtn = document.getElementById('next-date-btn');
    if (selectedDate >= todayStr) {
        nextDateBtn.style.opacity = '0.3';
        nextDateBtn.style.pointerEvents = 'none';
    } else {
        nextDateBtn.style.opacity = '1';
        nextDateBtn.style.pointerEvents = 'auto';
    }
    
    // Handle week navigator next button status
    const nextWeekBtn = document.getElementById('next-week-btn');
    const todayMondayStr = getMondayOfDateString(todayStr);
    const selectedMondayStr = getMondayOfDateString(selectedDate);
    
    if (selectedMondayStr >= todayMondayStr) {
        nextWeekBtn.style.opacity = '0.3';
        nextWeekBtn.style.pointerEvents = 'none';
    } else {
        nextWeekBtn.style.opacity = '1';
        nextWeekBtn.style.pointerEvents = 'auto';
    }
    
    const existingData = userResponses[selectedDate];
    
    // We allow compiling the form at any time, both for lunch and dinner.
    // An entry is fully complete if both lunch and dinner answers are logged.
    const bothCompleted = existingData && 
                          existingData.lunch && existingData.lunch.home !== null && 
                          existingData.dinner && existingData.dinner.home !== null;
    
    if (bothCompleted) {
        showScreen('dashboard-screen');
        updateDashboard();
    } else {
        startQuestionnaireFlow();
    }
}

function adjustDate(days) {
    const parts = selectedDate.split('-');
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const currentDate = new Date(year, month, day);
    
    currentDate.setDate(currentDate.getDate() + days);
    
    const nextDateStr = formatDateString(currentDate);
    const todayStr = formatDateString(new Date());
    
    // Don't allow navigating into the future
    if (nextDateStr > todayStr) return;
    
    selectedDate = nextDateStr;
    checkStatusAndLoadScreen();
}

function adjustWeek(weeks) {
    const parts = selectedDate.split('-');
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const currentDate = new Date(year, month, day);
    
    currentDate.setDate(currentDate.getDate() + (weeks * 7));
    
    const nextDateStr = formatDateString(currentDate);
    const todayStr = formatDateString(new Date());
    
    const todayMondayStr = getMondayOfDateString(todayStr);
    const nextDateMonday = getMondayOfDateString(nextDateStr);
    
    // Don't allow navigating to weeks fully in the future
    if (nextDateMonday > todayMondayStr) {
        return;
    }
    
    selectedDate = nextDateStr;
    checkStatusAndLoadScreen();
}

function setDateFromPicker(dateVal) {
    if (!dateVal) return;
    const todayStr = formatDateString(new Date());
    
    if (dateVal > todayStr) {
        alert("You cannot log details for future dates!");
        return;
    }
    
    selectedDate = dateVal;
    checkStatusAndLoadScreen();
}

function jumpToDate(dateStr) {
    selectedDate = dateStr;
    checkStatusAndLoadScreen();
}

/* ================= QUESTIONNAIRE FLOW WIZARD ================= */
function startQuestionnaireFlow(forceEdit = false) {
    // Default answers setup
    wizardState.answers = {
        lunch: { home: null, washed: null },
        dinner: { home: null, washed: null }
    };
    
    // Pre-populate answers if we have existing records (essential for forced editing/viewing)
    const existingData = userResponses[selectedDate];
    if (existingData) {
        wizardState.answers.lunch = existingData.lunch ? { ...existingData.lunch } : { home: null, washed: null };
        wizardState.answers.dinner = existingData.dinner ? { ...existingData.dinner } : { home: null, washed: null };
    }
    
    let startStep = WIZARD_STEPS.LUNCH_HOME;
    
    // All time gates are removed. When compiling, we go through both Lunch and Dinner.
    
    wizardState.stepHistory = [startStep];
    
    // Dynamically update question wordings based on selectedDate
    const datePhrase = getQuestionDatePhrase(selectedDate);
    const todayStr = formatDateString(new Date());
    
    if (selectedDate === todayStr) {
        document.getElementById('q-lunch-home-text').textContent = "Have you eaten at home today at lunch?";
        document.getElementById('q-dinner-home-text').textContent = "Have you eaten at home today at dinner?";
    } else {
        document.getElementById('q-lunch-home-text').textContent = `Have you eaten at home at lunch ${datePhrase}?`;
        document.getElementById('q-dinner-home-text').textContent = `Have you eaten at home at dinner ${datePhrase}?`;
    }
    
    // Hide all steps, show starting step
    document.querySelectorAll('.question-step').forEach(step => step.classList.add('hidden'));
    document.getElementById(startStep).classList.remove('hidden');
    
    // Update navigation controls
    updateWizardUIControls();
    showScreen('questionnaire-screen');
}

function reTriggerTodayQuestions() {
    // Force edit when the user explicitly clicks the Log/Edit button
    startQuestionnaireFlow(true);
}

function updateWizardUIControls() {
    const currentStep = wizardState.stepHistory[wizardState.stepHistory.length - 1];
    const prevBtn = document.getElementById('wizard-prev-btn');
    const label = document.getElementById('wizard-progress-label');
    const sectionTitle = document.getElementById('wizard-section-title');
    
    // Disable Back button if we are at step 1
    prevBtn.disabled = wizardState.stepHistory.length === 1;
    
    // Adjust dots & progress numbers
    const dotLunch = document.getElementById('dot-lunch');
    const dotDinner = document.getElementById('dot-dinner');
    
    if (currentStep === WIZARD_STEPS.LUNCH_HOME || currentStep === WIZARD_STEPS.LUNCH_WASH) {
        sectionTitle.textContent = "Lunch Log";
        dotLunch.classList.add('active');
        dotDinner.classList.remove('active');
    } else {
        sectionTitle.textContent = "Dinner Log";
        dotLunch.classList.remove('active');
        dotDinner.classList.add('active');
    }
    
    label.textContent = `Progress: Step ${wizardState.stepHistory.length}`;
}

function answerQuestion(questionKey, answerValue) {
    const currentStep = wizardState.stepHistory[wizardState.stepHistory.length - 1];
    let nextStep = null;
    
    // Process answers with no day/time-gate interruptions
    if (questionKey === 'lunchHome') {
        wizardState.answers.lunch.home = answerValue;
        if (answerValue === true) {
            nextStep = WIZARD_STEPS.LUNCH_WASH;
        } else {
            // Skips dishwashing if didn't eat at home
            wizardState.answers.lunch.washed = false;
            nextStep = WIZARD_STEPS.DINNER_HOME;
        }
    } 
    else if (questionKey === 'lunchWash') {
        wizardState.answers.lunch.washed = answerValue;
        nextStep = WIZARD_STEPS.DINNER_HOME;
    } 
    else if (questionKey === 'dinnerHome') {
        wizardState.answers.dinner.home = answerValue;
        if (answerValue === true) {
            nextStep = WIZARD_STEPS.DINNER_WASH;
        } else {
            wizardState.answers.dinner.washed = false;
            saveAndCompleteQuestionnaire();
            return;
        }
    } 
    else if (questionKey === 'dinnerWash') {
        wizardState.answers.dinner.washed = answerValue;
        saveAndCompleteQuestionnaire();
        return;
    }
    
    if (nextStep) {
        transitionWizardStep(currentStep, nextStep);
    }
}

function transitionWizardStep(fromStep, toStep) {
    const fromEl = document.getElementById(fromStep);
    const toEl = document.getElementById(toStep);
    
    // Apply exit anim / hide class
    fromEl.classList.add('hidden');
    
    // Show next
    toEl.classList.remove('hidden');
    toEl.classList.add('animate-slide-in');
    
    // Register in history
    wizardState.stepHistory.push(toStep);
    updateWizardUIControls();
}

function goToPrevWizardStep() {
    if (wizardState.stepHistory.length <= 1) return;
    
    const currentStep = wizardState.stepHistory.pop();
    const prevStep = wizardState.stepHistory[wizardState.stepHistory.length - 1];
    
    const currentEl = document.getElementById(currentStep);
    const prevEl = document.getElementById(prevStep);
    
    currentEl.classList.add('hidden');
    prevEl.classList.remove('hidden');
    
    updateWizardUIControls();
}

function skipQuestionnaire() {
    showScreen('dashboard-screen');
    updateDashboard();
}

function saveAndCompleteQuestionnaire() {
    const existingData = userResponses[selectedDate] || {};
    
    // Merge lunch and dinner answers safely (so dinner logging doesn't overwrite lunch)
    userResponses[selectedDate] = {
        lunch: wizardState.answers.lunch.home !== null ? { ...wizardState.answers.lunch } : (existingData.lunch || { home: null, washed: null }),
        dinner: wizardState.answers.dinner.home !== null ? { ...wizardState.answers.dinner } : (existingData.dinner || { home: null, washed: null })
    };
    
    // Persist to localstorage
    localStorage.setItem(`choreflow_responses_${currentUser.toLowerCase()}`, JSON.stringify(userResponses));
    
    // Show Dashboard
    showScreen('dashboard-screen');
    updateDashboard();
}

/* ================= STATS COMPUTATION & DASHBOARD ================= */
function updateDashboard() {
    // Filter response dates strictly for the currently selected week (Monday to Sunday)
    const mondayStr = getMondayOfDateString(selectedDate);
    const parts = mondayStr.split('-');
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const mondayDate = new Date(year, month, day);
    
    const weekDays = [];
    for (let i = 0; i < 7; i++) {
        const loopDate = new Date(mondayDate);
        loopDate.setDate(mondayDate.getDate() + i);
        weekDays.push(formatDateString(loopDate));
    }
    
    let totalMealsRecorded = 0;
    let homeMealsCount = 0;
    let dishesWashedCount = 0;
    
    // Iterate through logged days in the current selected week to calculate statistics
    weekDays.forEach(dateKey => {
        const dayData = userResponses[dateKey];
        if (dayData) {
            // Count Lunch if logged
            if (dayData.lunch && dayData.lunch.home !== null) {
                totalMealsRecorded++;
                if (dayData.lunch.home) {
                    homeMealsCount++;
                    if (dayData.lunch.washed) {
                        dishesWashedCount++;
                    }
                }
            }
            
            // Count Dinner if logged
            if (dayData.dinner && dayData.dinner.home !== null) {
                totalMealsRecorded++;
                if (dayData.dinner.home) {
                    homeMealsCount++;
                    if (dayData.dinner.washed) {
                        dishesWashedCount++;
                    }
                }
            }
        }
    });
    
    // Percentages with fallback guards for division by zero
    const mealsHomePercent = totalMealsRecorded > 0 
        ? Math.round((homeMealsCount / totalMealsRecorded) * 100) 
        : 0;
        
    const dishesWashedPercent = homeMealsCount > 0 
        ? Math.round((dishesWashedCount / homeMealsCount) * 100) 
        : 0;
        
    // Update DOM texts & Progress Bars
    animateNumber('meals-home-percentage', mealsHomePercent, '%');
    document.getElementById('meals-home-fraction').textContent = `${homeMealsCount} / ${totalMealsRecorded} meals`;
    document.getElementById('meals-home-bar').style.width = `${mealsHomePercent}%`;
    
    animateNumber('wash-dishes-percentage', dishesWashedPercent, '%');
    document.getElementById('wash-dishes-fraction').textContent = `${dishesWashedCount} / ${homeMealsCount} cleaned`;
    document.getElementById('wash-dishes-bar').style.width = `${dishesWashedPercent}%`;
    
    // Render Weekly Overview list
    renderWeeklySummaryList();
    
    // Generate intelligent insights
    renderSmartInsights(mealsHomePercent, dishesWashedPercent, homeMealsCount);
}

// Micro-animation for counting up metrics
function animateNumber(elementId, targetVal, suffix = '') {
    const el = document.getElementById(elementId);
    let currentVal = 0;
    const duration = 800; // ms
    const stepTime = 15;
    const steps = duration / stepTime;
    const increment = targetVal / steps;
    
    if (targetVal === 0) {
        el.textContent = '0' + suffix;
        return;
    }
    
    const timer = setInterval(() => {
        currentVal += increment;
        if (currentVal >= targetVal) {
            el.textContent = Math.round(targetVal) + suffix;
            clearInterval(timer);
        } else {
            el.textContent = Math.round(currentVal) + suffix;
        }
    }, stepTime);
}

/* ================= RENDERING WEEKLY SUMMARY LIST ================= */
function renderWeeklySummaryList() {
    const listContainer = document.getElementById('weekly-overview-list');
    listContainer.innerHTML = '';
    
    // Generate dates for the selected week starting on Monday
    const mondayStr = getMondayOfDateString(selectedDate);
    const parts = mondayStr.split('-');
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const mondayDate = new Date(year, month, day);
    
    const dateArray = [];
    for (let i = 0; i < 7; i++) {
        const loopDate = new Date(mondayDate);
        loopDate.setDate(mondayDate.getDate() + i);
        dateArray.push(formatDateString(loopDate));
    }
    
    // Loop through the 7 days and render summaries
    dateArray.forEach(dateStr => {
        const dayData = userResponses[dateStr];
        const displayDay = getFormattedDisplayDate(dateStr);
        const isSelected = dateStr === selectedDate;
        
        const itemEl = document.createElement('div');
        itemEl.className = `weekly-item ${isSelected ? 'current-item' : ''}`;
        
        let lunchHtml = '';
        let dinnerHtml = '';
        
        if (dayData) {
            // Render Lunch Details
            if (dayData.lunch && dayData.lunch.home !== null) {
                if (dayData.lunch.home) {
                    const washedBadge = dayData.lunch.washed 
                        ? `<span class="badge-washed"><i class="fa-solid fa-soap"></i> Washed</span>`
                        : `<span class="badge-notwashed"><i class="fa-solid fa-ban"></i> Leftovers</span>`;
                    lunchHtml = `
                        <div class="meal-widget">
                            <span class="meal-label">Lunch</span>
                            <div class="status-badge">
                                <span class="badge-home"><i class="fa-solid fa-house"></i> Home</span>
                                ${washedBadge}
                            </div>
                        </div>
                    `;
                } else {
                    lunchHtml = `
                        <div class="meal-widget">
                            <span class="meal-label">Lunch</span>
                            <div class="status-badge">
                                <span class="badge-out"><i class="fa-solid fa-utensils"></i> Out</span>
                            </div>
                        </div>
                    `;
                }
            } else {
                lunchHtml = `
                    <div class="meal-widget" style="opacity: 0.55;">
                        <span class="meal-label">Lunch</span>
                        <span style="color: var(--text-muted); font-size: 0.78rem;"><i class="fa-solid fa-hourglass"></i> Unlogged</span>
                    </div>
                `;
            }
            
            // Render Dinner Details
            if (dayData.dinner && dayData.dinner.home !== null) {
                if (dayData.dinner.home) {
                    const washedBadge = dayData.dinner.washed 
                        ? `<span class="badge-washed"><i class="fa-solid fa-soap"></i> Washed</span>`
                        : `<span class="badge-notwashed"><i class="fa-solid fa-ban"></i> Leftovers</span>`;
                    dinnerHtml = `
                        <div class="meal-widget">
                            <span class="meal-label">Dinner</span>
                            <div class="status-badge">
                                <span class="badge-home"><i class="fa-solid fa-house"></i> Home</span>
                                ${washedBadge}
                            </div>
                        </div>
                    `;
                } else {
                    dinnerHtml = `
                        <div class="meal-widget">
                            <span class="meal-label">Dinner</span>
                            <div class="status-badge">
                                <span class="badge-out"><i class="fa-solid fa-utensils"></i> Out</span>
                            </div>
                        </div>
                    `;
                }
            } else {
                dinnerHtml = `
                    <div class="meal-widget" style="opacity: 0.55;">
                        <span class="meal-label">Dinner</span>
                        <span style="color: var(--text-muted); font-size: 0.78rem;"><i class="fa-solid fa-hourglass"></i> Unlogged</span>
                    </div>
                `;
            }
        } else {
            // Unlogged state placeholder
            lunchHtml = `
                <button class="btn btn-outline btn-sm" onclick="jumpToDate('${dateStr}')">
                    <i class="fa-solid fa-pencil"></i> Log Day
                </button>
            `;
        }
        
        itemEl.innerHTML = `
            <div class="day-info" onclick="jumpToDate('${dateStr}')" style="cursor: pointer;">
                <span class="day-name">${displayDay}</span>
                <span class="day-date">${dateStr === formatDateString(new Date()) ? 'Today' : ''}</span>
            </div>
            <div class="meals-row">
                ${lunchHtml}
                ${dayData ? dinnerHtml : ''}
            </div>
        `;
        
        listContainer.appendChild(itemEl);
    });
}

/* ================= INTELLIGENT INSIGHTS ENGINE ================= */
function renderSmartInsights(homeMealsPct, dishesWashedPct, homeMealsCount) {
    const insightsContainer = document.getElementById('insights-container');
    insightsContainer.innerHTML = '';
    
    // Insight 1: Dining Profile
    let diningHeading = "Healthy Eating";
    let diningDesc = "Eating at home is a great way to save money and stay fit. Log at least one meal to get started!";
    let diningIcon = "fa-solid fa-carrot";
    let diningColor = "color-amber";
    
    if (homeMealsPct >= 75) {
        diningHeading = "Eco Masterchef";
        diningDesc = "Outstanding! Eating at home over 75% of the time means you're super healthy and economical.";
        diningIcon = "fa-solid fa-award";
        diningColor = "color-emerald";
    } else if (homeMealsPct > 40) {
        diningHeading = "Balanced Dining";
        diningDesc = "Good balance! You divide your meals nicely between dining out and eating at home.";
        diningIcon = "fa-solid fa-circle-half-stroke";
        diningColor = "color-blue";
    } else if (homeMealsCount > 0) {
        diningHeading = "Social Butterfly";
        diningDesc = "You eat out quite often. Consider cooking simple meals at home to cut costs this week.";
        diningIcon = "fa-regular fa-compass";
        diningColor = "text-indigo";
    }
    
    // Insight 2: Cleanliness Score
    let cleanHeading = "Dishes Duty";
    let cleanDesc = "Wash dishes right after meals to avoid kitchen clutter and maintain great habits.";
    let cleanIcon = "fa-solid fa-circle-info";
    let cleanColor = "text-indigo";
    
    if (dishesWashedPct === 100 && homeMealsCount > 0) {
        cleanHeading = "Cleanliness Legend";
        cleanDesc = "Incredible effort! You have cleaned up every single home meal you ate. Sparkling clean!";
        cleanIcon = "fa-solid fa-handshake-angle";
        cleanColor = "color-emerald";
    } else if (dishesWashedPct >= 60) {
        cleanHeading = "Cooperative Housemate";
        cleanDesc = "Excellent helper. You washed dishes for most of your home meals. Keep it up!";
        cleanIcon = "fa-regular fa-thumbs-up";
        cleanColor = "color-blue";
    } else if (homeMealsCount > 0) {
        cleanHeading = "Dish Accumulation";
        cleanDesc = "The sink might be filling up! Try to handle your share of cleanups a bit more often.";
        cleanIcon = "fa-solid fa-triangle-exclamation";
        cleanColor = "text-rose";
    }
    
    insightsContainer.innerHTML = `
        <div class="insight-item animate-fade-in">
            <div class="insight-icon ${diningColor}">
                <i class="${diningIcon}"></i>
            </div>
            <div class="insight-content">
                <h5>${diningHeading}</h5>
                <p>${diningDesc}</p>
            </div>
        </div>
        <div class="insight-item animate-fade-in">
            <div class="insight-icon ${cleanColor}">
                <i class="${cleanIcon}"></i>
            </div>
            <div class="insight-content">
                <h5>${cleanHeading}</h5>
                <p>${cleanDesc}</p>
            </div>
        </div>
    `;
}

/* ================= WEB PUSH NOTIFICATION SERVICE ================= */
function requestNotificationPermission() {
    if ("Notification" in window) {
        if (Notification.permission !== "granted" && Notification.permission !== "denied") {
            Notification.requestPermission();
        }
    }
}

function triggerTestNotification() {
    if (!("Notification" in window)) {
        showInAppNotificationBanner("ChoreFlow Simulated Reminder 🧼", "It is 9:00 PM! Don't forget to track your home meals and dishes today.");
        return;
    }
    
    const title = "ChoreFlow Test Notification 🧼";
    const options = {
        body: "Success! Real push notification system is working correctly. You'll be reminded daily at 9:00 PM.",
        icon: "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/svgs/solid/soap.svg",
        badge: "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/svgs/solid/soap.svg",
        vibrate: [200, 100, 200]
    };
    
    if (Notification.permission === "granted") {
        sendRealNotification(title, options);
    } else if (Notification.permission === "denied") {
        showInAppNotificationBanner("Browser notifications are blocked. Simulated alert:", "Daily Reminder: Don't forget to track your home meals today!");
    } else {
        Notification.requestPermission().then(permission => {
            if (permission === "granted") {
                sendRealNotification(title, options);
            } else {
                showInAppNotificationBanner("Notification permission request was denied.", "Daily Reminder: Don't forget to track your home meals today!");
            }
        });
    }
}

function sendRealNotification(title, options) {
    // 1. Try using Service Worker registration first (this works perfectly on mobile phones!)
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready.then(registration => {
            registration.showNotification(title, options)
                .catch(err => {
                    // Fall back to main thread new Notification if service worker fails
                    try {
                        new Notification(title, options);
                    } catch (e) {
                        showInAppNotificationBanner(title, options.body);
                    }
                });
        });
    } else {
        // 2. Fall back to standard Notification constructor on desktop
        try {
            new Notification(title, options);
        } catch (e) {
            showInAppNotificationBanner(title, options.body);
        }
    }
}

function showInAppNotificationBanner(title, body) {
    let banner = document.getElementById('in-app-notification-banner');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'in-app-notification-banner';
        banner.innerHTML = `
            <div class="banner-icon">
                <i class="fa-solid fa-soap logo-icon"></i>
            </div>
            <div class="banner-content">
                <div class="banner-title" id="banner-title-text"></div>
                <div class="banner-body" id="banner-body-text"></div>
            </div>
        `;
        document.body.appendChild(banner);
    }
    
    document.getElementById('banner-title-text').textContent = title;
    document.getElementById('banner-body-text').textContent = body;
    
    // Force a reflow to restart transition
    banner.classList.remove('show');
    banner.getBoundingClientRect();
    
    // Add class to trigger CSS animation slide down
    banner.classList.add('show');
    
    // Remove after 5.0 seconds
    setTimeout(() => {
        banner.classList.remove('show');
    }, 5000);
}

function startNotificationService() {
    if (!("Notification" in window)) return;
    
    // Check local time every 30 seconds
    setInterval(() => {
        if (Notification.permission !== "granted" || !currentUser) return;
        
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();
        
        // 9:00 PM local time daily trigger
        if (currentHour === 21 && currentMinute === 0) {
            const todayStr = formatDateString(now);
            const lastNotifiedDay = localStorage.getItem(`choreflow_last_notified_${currentUser.toLowerCase()}`);
            
            // Check if user was already reminded today to prevent repetitive banners in the same minute
            if (lastNotifiedDay !== todayStr) {
                const todayData = userResponses[todayStr];
                
                // If today is not fully completed
                const isFullyLogged = todayData && 
                                      todayData.lunch && todayData.lunch.home !== null && 
                                      todayData.dinner && todayData.dinner.home !== null;
                                      
                if (!isFullyLogged) {
                    sendRealNotification("ChoreFlow Reminder 🧼", {
                        body: "It is 9:00 PM! Don't forget to track your home meals and dishes today.",
                        icon: "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/svgs/solid/soap.svg",
                        badge: "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/svgs/solid/soap.svg",
                        vibrate: [200, 100, 200]
                    });
                    
                    // Mark as notified today
                    localStorage.setItem(`choreflow_last_notified_${currentUser.toLowerCase()}`, todayStr);
                }
            }
        }
    }, 30000);
}

/* ================= SYSTEM RESET & DANGER ZONE ================= */
function toggleSettingsPanel() {
    const panel = document.getElementById('settings-panel');
    panel.classList.toggle('hidden');
    // Clear input field on open/close
    document.getElementById('reset-confirm-input').value = '';
}

function confirmResetAllData() {
    const inputVal = document.getElementById('reset-confirm-input').value.trim();
    if (inputVal !== 'RESET') {
        alert('Please type RESET exactly (case sensitive) to confirm.');
        return;
    }
    
    if (currentUser) {
        // Wipe responses memory and localstorage key
        userResponses = {};
        localStorage.removeItem(`choreflow_responses_${currentUser.toLowerCase()}`);
        
        // Hide panel & clear confirm textbox
        document.getElementById('settings-panel').classList.add('hidden');
        document.getElementById('reset-confirm-input').value = '';
        
        // Refresh session screens and stats instantly
        checkStatusAndLoadScreen();
        alert('All meal histories and dashboard items have been successfully wiped.');
    }
}

/* ================= REPORT ENGINE & SVG CHARTS ================= */

function showReportScreen() {
    // Hide main dashboard, show report screen
    document.getElementById('dashboard-screen').classList.add('hidden');
    document.getElementById('questionnaire-screen').classList.add('hidden');
    document.getElementById('report-screen').classList.remove('hidden');
    
    // Render all-time report metrics & graphs
    generateReportData();
}

function hideReportScreen() {
    document.getElementById('report-screen').classList.add('hidden');
    document.getElementById('dashboard-screen').classList.remove('hidden');
    checkStatusAndLoadScreen();
}

function generateReportData() {
    const totalDays = Object.keys(userResponses).length;
    
    let totalMealsRecorded = 0;
    let homeMealsCount = 0;
    let dishesWashedCount = 0;
    
    // Weekly arrays initialized for analytics
    // Monday (0) to Sunday (6)
    const weekdaysNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    
    // Analytics data structures
    const outCounts = [0, 0, 0, 0, 0, 0, 0];       // Dining out frequency
    const washCounts = [0, 0, 0, 0, 0, 0, 0];      // Cleaned meals count
    const homeLunchCounts = [0, 0, 0, 0, 0, 0, 0]; // Home lunch count
    const homeDinnerCounts = [0, 0, 0, 0, 0, 0, 0];// Home dinner count
    const homeMealsByDay = [0, 0, 0, 0, 0, 0, 0];   // Total home meals for consistency percentage calculation
    
    Object.keys(userResponses).forEach(dateKey => {
        const dayData = userResponses[dateKey];
        if (dayData) {
            // Calculate day of week index (Monday = 0, Tuesday = 1, ..., Sunday = 6)
            const parts = dateKey.split('-');
            const year = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10) - 1;
            const day = parseInt(parts[2], 10);
            const dt = new Date(year, month, day);
            let dayIndex = dt.getDay(); // 0 = Sun, 1 = Mon, ..., 6 = Sat
            dayIndex = dayIndex === 0 ? 6 : dayIndex - 1; // Map Sun to 6, Mon to 0
            
            // Count Lunch
            if (dayData.lunch && dayData.lunch.home !== null) {
                totalMealsRecorded++;
                if (dayData.lunch.home) {
                    homeMealsCount++;
                    homeLunchCounts[dayIndex]++;
                    homeMealsByDay[dayIndex]++;
                    if (dayData.lunch.washed) {
                        dishesWashedCount++;
                        washCounts[dayIndex]++;
                    }
                } else {
                    outCounts[dayIndex]++;
                }
            }
            
            // Count Dinner
            if (dayData.dinner && dayData.dinner.home !== null) {
                totalMealsRecorded++;
                if (dayData.dinner.home) {
                    homeMealsCount++;
                    homeDinnerCounts[dayIndex]++;
                    homeMealsByDay[dayIndex]++;
                    if (dayData.dinner.washed) {
                        dishesWashedCount++;
                        washCounts[dayIndex]++;
                    }
                } else {
                    outCounts[dayIndex]++;
                }
            }
        }
    });
    
    // Calculate All-Time Percentages
    const mealsHomePercent = totalMealsRecorded > 0 
        ? Math.round((homeMealsCount / totalMealsRecorded) * 100) 
        : 0;
        
    const dishesWashedPercent = homeMealsCount > 0 
        ? Math.round((dishesWashedCount / homeMealsCount) * 100) 
        : 0;
        
    // Update Report Header Cards (All-time metrics)
    document.getElementById('report-total-days').textContent = `${totalDays} Day${totalDays === 1 ? '' : 's'}`;
    document.getElementById('report-total-meals').textContent = `${totalMealsRecorded} meal${totalMealsRecorded === 1 ? '' : 's'} recorded`;
    
    animateNumber('report-meals-home-percentage', mealsHomePercent, '%');
    document.getElementById('report-meals-home-fraction').textContent = `${homeMealsCount} / ${totalMealsRecorded} meals`;
    document.getElementById('report-meals-home-bar').style.width = `${mealsHomePercent}%`;
    
    animateNumber('report-wash-dishes-percentage', dishesWashedPercent, '%');
    document.getElementById('report-wash-dishes-fraction').textContent = `${dishesWashedCount} / ${homeMealsCount} cleaned`;
    document.getElementById('report-wash-dishes-bar').style.width = `${dishesWashedPercent}%`;
    
    // Render Chart 1: Dining Out Frequency
    const maxOutValue = Math.max(...outCounts);
    const outChartData = weekdaysNames.map((name, idx) => ({
        label: name.substring(0, 3),
        value: outCounts[idx],
        highlight: outCounts[idx] === maxOutValue && maxOutValue > 0
    }));
    renderBarChartSVG('chart-dining-out', outChartData, { barColor: 'url(#grad-rose)', glowClass: 'glow-rose' });
    
    // Determine caption for Dining Out
    let maxOutDay = "None";
    let maxOutIdx = outCounts.indexOf(maxOutValue);
    if (maxOutValue > 0 && maxOutIdx !== -1) {
        maxOutDay = weekdaysNames[maxOutIdx];
        document.getElementById('dining-out-caption').innerHTML = `<i class="fa-solid fa-circle-info text-rose"></i> You dine out most frequently on <strong>${maxOutDay}s</strong> (${maxOutValue} times). Consider cooking to save money!`;
    } else {
        document.getElementById('dining-out-caption').innerHTML = `<i class="fa-solid fa-circle-info text-rose"></i> No out-meals recorded yet! Outstanding dining-at-home discipline.`;
    }
    
    // Render Chart 2: Dishes Cleaned Frequency
    const maxWashValue = Math.max(...washCounts);
    const washChartData = weekdaysNames.map((name, idx) => ({
        label: name.substring(0, 3),
        value: washCounts[idx],
        highlight: washCounts[idx] === maxWashValue && maxWashValue > 0
    }));
    renderBarChartSVG('chart-dishes-cleaned', washChartData, { barColor: 'url(#grad-emerald)', glowClass: 'glow-emerald' });
    
    // Determine caption for Dishes Cleaned
    let maxWashDay = "None";
    let maxWashIdx = washCounts.indexOf(maxWashValue);
    if (maxWashValue > 0 && maxWashIdx !== -1) {
        maxWashDay = weekdaysNames[maxWashIdx];
        document.getElementById('dishes-cleaned-caption').innerHTML = `<i class="fa-solid fa-wand-magic-sparkles text-emerald"></i> You are most active washing dishes on <strong>${maxWashDay}s</strong> (${maxWashValue} times). Keep up the great habits!`;
    } else {
        document.getElementById('dishes-cleaned-caption').innerHTML = `<i class="fa-solid fa-circle-info"></i> No cleaned-dishes recorded yet. Your kitchen is waiting for you!`;
    }
    
    // Render Chart 3: Lunch vs Dinner Habits (Grouped Bar Chart)
    renderGroupedChartSVG('chart-meal-comparison', weekdaysNames.map((n, idx) => ({
        label: n.substring(0, 3),
        val1: homeLunchCounts[idx], // Lunch
        val2: homeDinnerCounts[idx] // Dinner
    })));
    
    // Caption for Lunch vs Dinner comparison
    const totalLunches = homeLunchCounts.reduce((a,b)=>a+b, 0);
    const totalDinners = homeDinnerCounts.reduce((a,b)=>a+b, 0);
    if (totalLunches + totalDinners > 0) {
        const preferredMeal = totalLunches > totalDinners ? "Lunch" : (totalDinners > totalLunches ? "Dinner" : "both Lunch & Dinner equally");
        document.getElementById('meal-comparison-caption').innerHTML = `<i class="fa-solid fa-circle-info text-blue"></i> All-Time Home Meals: Lunch (<strong>${totalLunches}</strong>), Dinner (<strong>${totalDinners}</strong>). You cook at home more for <strong>${preferredMeal}</strong>.`;
    } else {
        document.getElementById('meal-comparison-caption').innerHTML = `<i class="fa-solid fa-circle-info text-blue"></i> No home meals recorded yet to generate comparison statistics.`;
    }
    
    // Render Chart 4: Cleanliness Consistency Rate per Weekday (%)
    const consistencyRates = weekdaysNames.map((name, idx) => {
        const homeMeals = homeMealsByDay[idx];
        const washed = washCounts[idx];
        const rate = homeMeals > 0 ? Math.round((washed / homeMeals) * 100) : 0;
        return {
            label: name.substring(0, 3),
            value: rate,
            highlight: rate >= 80 && homeMeals > 0
        };
    });
    renderBarChartSVG('chart-cleaning-rate', consistencyRates, { barColor: 'url(#grad-accent)', glowClass: 'glow-accent', suffix: '%' });
    
    // Caption for Cleanliness Consistency Rate
    const highestRateValue = Math.max(...consistencyRates.map(c => c.value));
    const highestRateIdx = consistencyRates.findIndex(c => c.value === highestRateValue);
    if (highestRateValue > 0 && highestRateIdx !== -1) {
        const topConsistencyDay = weekdaysNames[highestRateIdx];
        document.getElementById('cleaning-rate-caption').innerHTML = `<i class="fa-solid fa-award text-amber"></i> Most disciplined washing dishes on <strong>${topConsistencyDay}s</strong> with a clean rate of <strong>${highestRateValue}%</strong>!`;
    } else {
        document.getElementById('cleaning-rate-caption').innerHTML = `<i class="fa-solid fa-circle-info text-amber"></i> Wash dishes on home cooked meals to compute your weekday compliance rate.`;
    }
}

function renderBarChartSVG(containerId, data, options = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const width = 500;
    const height = 220;
    const paddingLeft = 40;
    const paddingRight = 20;
    const paddingTop = 20;
    const paddingBottom = 30;
    
    const chartWidth = width - paddingLeft - paddingRight;
    const chartHeight = height - paddingTop - paddingBottom;
    
    const suffix = options.suffix || '';
    const maxVal = Math.max(...data.map(d => d.value), 1);
    
    // Generate grid lines
    let gridHtml = '';
    const ticks = 4;
    for (let i = 0; i <= ticks; i++) {
        const y = paddingTop + chartHeight - (i / ticks) * chartHeight;
        const val = Math.round((i / ticks) * maxVal);
        gridHtml += `
            <line x1="${paddingLeft}" y1="${y}" x2="${width - paddingRight}" y2="${y}" stroke="rgba(255,255,255,0.06)" stroke-dasharray="4,4" />
            <text x="${paddingLeft - 8}" y="${y + 4}" fill="var(--text-muted)" font-size="10" font-weight="600" text-anchor="end">${val}${suffix}</text>
        `;
    }
    
    // Generate bars
    let barsHtml = '';
    const barSpacing = chartWidth / data.length;
    const barWidth = barSpacing * 0.55;
    
    data.forEach((d, idx) => {
        const x = paddingLeft + idx * barSpacing + (barSpacing - barWidth) / 2;
        const barValHeight = (d.value / maxVal) * chartHeight;
        const y = paddingTop + chartHeight - barValHeight;
        
        const barColor = d.highlight ? 'url(#grad-accent)' : (options.barColor || 'url(#grad-primary)');
        const glowClass = d.highlight ? 'glow-accent' : (options.glowClass || 'glow-primary');
        
        barsHtml += `
            <g class="chart-bar-group">
                <rect x="${x}" y="${y}" width="${barWidth}" height="${barValHeight}" rx="4" fill="${barColor}" class="${glowClass}">
                    <animate attributeName="height" from="0" to="${barValHeight}" dur="0.8s" cubic-bezier="0.4, 0, 0.2, 1" fill="freeze" />
                    <animate attributeName="y" from="${paddingTop + chartHeight}" to="${y}" dur="0.8s" cubic-bezier="0.4, 0, 0.2, 1" fill="freeze" />
                </rect>
                <text x="${x + barWidth / 2}" y="${paddingTop + chartHeight + 18}" fill="var(--text-secondary)" font-size="11" font-weight="700" text-anchor="middle">${d.label}</text>
                <text x="${x + barWidth / 2}" y="${y - 6}" fill="var(--text-primary)" font-size="10" font-weight="800" text-anchor="middle" class="bar-value-text" opacity="0">${d.value}${suffix}</text>
            </g>
        `;
    });
    
    container.innerHTML = `
        <svg width="100%" height="100%" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
            <defs>
                <linearGradient id="grad-primary" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stop-color="var(--color-primary)" />
                    <stop offset="100%" stop-color="var(--color-blue)" />
                </linearGradient>
                <linearGradient id="grad-accent" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stop-color="var(--color-accent)" />
                    <stop offset="100%" stop-color="var(--color-rose)" />
                </linearGradient>
                <linearGradient id="grad-emerald" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stop-color="var(--color-emerald)" />
                    <stop offset="100%" stop-color="#059669" />
                </linearGradient>
                <linearGradient id="grad-rose" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stop-color="var(--color-rose)" />
                    <stop offset="100%" stop-color="#be123c" />
                </linearGradient>
            </defs>
            ${gridHtml}
            ${barsHtml}
        </svg>
    `;
}

function renderGroupedChartSVG(containerId, data) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const width = 500;
    const height = 220;
    const paddingLeft = 40;
    const paddingRight = 20;
    const paddingTop = 20;
    const paddingBottom = 30;
    
    const chartWidth = width - paddingLeft - paddingRight;
    const chartHeight = height - paddingTop - paddingBottom;
    
    const maxVal = Math.max(...data.map(d => Math.max(d.val1, d.val2)), 1);
    
    // Generate grid lines
    let gridHtml = '';
    const ticks = 4;
    for (let i = 0; i <= ticks; i++) {
        const y = paddingTop + chartHeight - (i / ticks) * chartHeight;
        const val = Math.round((i / ticks) * maxVal);
        gridHtml += `
            <line x1="${paddingLeft}" y1="${y}" x2="${width - paddingRight}" y2="${y}" stroke="rgba(255,255,255,0.06)" stroke-dasharray="4,4" />
            <text x="${paddingLeft - 8}" y="${y + 4}" fill="var(--text-muted)" font-size="10" font-weight="600" text-anchor="end">${val}</text>
        `;
    }
    
    // Generate grouped bars
    let barsHtml = '';
    const barSpacing = chartWidth / data.length;
    const totalGroupWidth = barSpacing * 0.65;
    const singleBarWidth = totalGroupWidth / 2 - 2;
    
    data.forEach((d, idx) => {
        const groupX = paddingLeft + idx * barSpacing + (barSpacing - totalGroupWidth) / 2;
        
        const x1 = groupX;
        const h1 = (d.val1 / maxVal) * chartHeight;
        const y1 = paddingTop + chartHeight - h1;
        
        const x2 = groupX + singleBarWidth + 4;
        const h2 = (d.val2 / maxVal) * chartHeight;
        const y2 = paddingTop + chartHeight - h2;
        
        barsHtml += `
            <g class="chart-bar-group">
                <!-- Lunch Bar (Blue) -->
                <rect x="${x1}" y="${y1}" width="${singleBarWidth}" height="${h1}" rx="3" fill="url(#grad-primary)" class="glow-blue">
                    <animate attributeName="height" from="0" to="${h1}" dur="0.8s" cubic-bezier="0.4, 0, 0.2, 1" fill="freeze" />
                    <animate attributeName="y" from="${paddingTop + chartHeight}" to="${y1}" dur="0.8s" cubic-bezier="0.4, 0, 0.2, 1" fill="freeze" />
                </rect>
                <text x="${x1 + singleBarWidth / 2}" y="${y1 - 6}" fill="var(--text-primary)" font-size="9" font-weight="800" text-anchor="middle" class="bar-value-text" opacity="0">${d.val1}</text>
                
                <!-- Dinner Bar (Indigo) -->
                <rect x="${x2}" y="${y2}" width="${singleBarWidth}" height="${h2}" rx="3" fill="url(#grad-accent)" class="glow-primary">
                    <animate attributeName="height" from="0" to="${h2}" dur="0.8s" cubic-bezier="0.4, 0, 0.2, 1" fill="freeze" />
                    <animate attributeName="y" from="${paddingTop + chartHeight}" to="${y2}" dur="0.8s" cubic-bezier="0.4, 0, 0.2, 1" fill="freeze" />
                </rect>
                <text x="${x2 + singleBarWidth / 2}" y="${y2 - 6}" fill="var(--text-primary)" font-size="9" font-weight="800" text-anchor="middle" class="bar-value-text" opacity="0">${d.val2}</text>
                
                <text x="${groupX + totalGroupWidth / 2}" y="${paddingTop + chartHeight + 18}" fill="var(--text-secondary)" font-size="11" font-weight="700" text-anchor="middle">${d.label}</text>
            </g>
        `;
    });
    
    container.innerHTML = `
        <svg width="100%" height="100%" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
            <defs>
                <linearGradient id="grad-primary" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stop-color="var(--color-blue)" />
                    <stop offset="100%" stop-color="#1d4ed8" />
                </linearGradient>
                <linearGradient id="grad-accent" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stop-color="var(--color-primary)" />
                    <stop offset="100%" stop-color="#4f46e5" />
                </linearGradient>
            </defs>
            ${gridHtml}
            ${barsHtml}
        </svg>
    `;
}
