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
    
    const existingData = userResponses[selectedDate];
    
    if (selectedDate === todayStr) {
        const hour = getActiveHour();
        
        if (hour < 12) {
            // Before 12 PM: No questions, show dashboard
            showScreen('dashboard-screen');
            updateDashboard();
        } else if (hour >= 12 && hour < 20) {
            // 12 PM to 8 PM: Lunch completed?
            const lunchCompleted = existingData && existingData.lunch && existingData.lunch.home !== null;
            if (lunchCompleted) {
                showScreen('dashboard-screen');
                updateDashboard();
            } else {
                startQuestionnaireFlow();
            }
        } else {
            // After 8 PM: Both completed?
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
    } else {
        // Historical date: show dashboard if anything recorded, else open questionnaire
        if (existingData) {
            showScreen('dashboard-screen');
            updateDashboard();
        } else {
            startQuestionnaireFlow();
        }
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
    const todayStr = formatDateString(new Date());
    
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
    
    // If it's today and NOT a forced edit, we apply dynamic time-gated branching and previous log checks
    if (selectedDate === todayStr && !forceEdit) {
        const hour = getActiveHour();
        
        if (hour < 12) {
            // Before 12 PM: No questions triggered
            showScreen('dashboard-screen');
            updateDashboard();
            return;
        }
        
        // If lunch is already logged, but we need to prompt dinner
        if (existingData && existingData.lunch && existingData.lunch.home !== null) {
            if (hour >= 20) {
                // Prompt dinner only
                startStep = WIZARD_STEPS.DINNER_HOME;
            } else {
                // 12 PM to 8 PM: Lunch already logged, nothing more to fill yet!
                showScreen('dashboard-screen');
                updateDashboard();
                return;
            }
        }
    }
    
    wizardState.stepHistory = [startStep];
    
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
    
    const isToday = selectedDate === formatDateString(new Date());
    const hour = getActiveHour();
    
    if (questionKey === 'lunchHome') {
        wizardState.answers.lunch.home = answerValue;
        if (answerValue === true) {
            nextStep = WIZARD_STEPS.LUNCH_WASH;
        } else {
            // Skips dishwashing if didn't eat at home
            wizardState.answers.lunch.washed = false;
            
            // Time gate check: if it is today and before 8 PM, complete right after lunch
            if (isToday && hour < 20) {
                saveAndCompleteQuestionnaire();
                return;
            } else {
                nextStep = WIZARD_STEPS.DINNER_HOME;
            }
        }
    } 
    else if (questionKey === 'lunchWash') {
        wizardState.answers.lunch.washed = answerValue;
        
        // Time gate check: if it is today and before 8 PM, complete right after lunch
        if (isToday && hour < 20) {
            saveAndCompleteQuestionnaire();
            return;
        } else {
            nextStep = WIZARD_STEPS.DINNER_HOME;
        }
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
    const totalDays = Object.keys(userResponses).length;
    
    let totalMealsRecorded = 0;
    let homeMealsCount = 0;
    let dishesWashedCount = 0;
    
    // Iterate through logged days to calculate statistics
    Object.keys(userResponses).forEach(dateKey => {
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
    
    // Generate dates for the last 7 calendar days ending on the selectedDate
    const dateArray = [];
    const parts = selectedDate.split('-');
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    const baseDate = new Date(year, month, day);
    
    for (let i = 6; i >= 0; i--) {
        const loopDate = new Date(baseDate);
        loopDate.setDate(baseDate.getDate() - i);
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
                    new Notification("ChoreFlow Reminder 🧼", {
                        body: "It is 9:00 PM! Don't forget to track your home meals and dishes today.",
                        icon: "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/svgs/solid/soap.svg"
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
