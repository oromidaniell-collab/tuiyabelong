// Main JavaScript for Rental Management System Tenant Portal
// This file handles all frontend logic, including authentication, data fetching, view management, and user interactions.
let currentUser = null;
let allNotifications = [];
let currentFilter = 'all';

// Global notification handler
function showStatus(message, type = 'error', elementId = 'status-message') {
    const el = document.getElementById(elementId);
    if (!el) return;
    
    el.textContent = message;
    el.className = `status-message ${type}`;
    el.style.display = 'block';
    
    // Auto-scroll to message if on mobile
    if (window.innerWidth < 768) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // Auto-hide after 10 seconds if it's success
    if (type === 'success') {
        setTimeout(() => {
            el.style.display = 'none';
        }, 10000);
    }
}

// Theme Management
function initTheme() {
    const savedTheme = localStorage.getItem('rms-theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('rms-theme', newTheme);
    updateThemeIcon(newTheme);
    updateSettingsThemeIcon();
}

function updateThemeIcon(theme) {
    const icon = document.querySelector('.theme-toggle i');
    if (icon) {
        icon.className = theme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
    }
}

// Configuration
const API_BASE_URL = window.location.origin;

// Utility function for safe API calls with error handling
async function apiCall(url, options = {}) {
    const token = localStorage.getItem('rms-token');
    const headers = {
        ...options.headers,
        'Authorization': `Bearer ${token}`
    };
    
    try {
        const fullUrl = url.startsWith('http') ? url : `${API_BASE_URL}${url}`;
        const response = await fetch(fullUrl, {
            ...options,
            headers
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: `HTTP ${response.status}` }));
            throw new Error(errorData.detail || `API Error: ${response.status}`);
        }
        
        return await response.json();
    } catch (err) {
        console.error(`API call failed for ${url}:`, err);
        throw err;
    }
}

// ── Inactivity Timeout (30 min) ───────────────────────────────
(function initSessionTimeout() {
    const TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
    let timer = null;

    function logout() {
        localStorage.removeItem('rms-token');
        localStorage.removeItem('rms-user');
        window.location.href = 'landing.html';
    }

    function resetTimer() {
        clearTimeout(timer);
        timer = setTimeout(logout, TIMEOUT_MS);
    }

    ['click', 'mousemove', 'keydown', 'scroll', 'touchstart'].forEach(evt => {
        document.addEventListener(evt, resetTimer, { passive: true });
    });

    resetTimer();
})();

// Auth Logic
// Check for developer mode (bypass CAPTCHA)
const isDevMode = new URLSearchParams(window.location.search).has('dev');

let captchaAnswer = 0;

function generateCaptcha() {
    const q = document.getElementById('captcha-q');
    if (!q) {
        console.warn('CAPTCHA element not found');
        return;
    }

    // Only generate if the element is visible (login screen is shown)
    const loginScreen = document.getElementById('login-screen');
    if (loginScreen && loginScreen.style.display === 'none') {
        return; // Don't generate if login screen is hidden
    }

    if (isDevMode) {
        captchaAnswer = 0;
        q.textContent = 'Dev Mode: Enter 0';
        console.log('CAPTCHA bypassed for development');
        const input = document.getElementById('captcha-ans');
        if (input) input.value = '0';
        return;
    }

    const n1 = Math.floor(Math.random() * 10);
    const n2 = Math.floor(Math.random() * 10);
    captchaAnswer = n1 + n2;
    q.textContent = `Verify: ${n1} + ${n2} = ?`;
    console.log('CAPTCHA generated:', n1 + ' + ' + n2 + ' = ' + captchaAnswer);
    const input = document.getElementById('captcha-ans');
    if (input) input.value = '';
}

// Registration CAPTCHA is disabled - kept for compatibility
function generateRegCaptcha() {
    console.log('Registration CAPTCHA is disabled');
}

async function handleLogin(event) {
    event.preventDefault();
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-pass').value;

    const submitBtn = event.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Logging in...';

    try {
        const formData = new FormData();
        formData.append('username', email);
        formData.append('password', pass);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const response = await fetch(`${API_BASE_URL}/api/v1/auth/login`, {
            method: 'POST',
            body: formData,
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response.ok) {
            const data = await response.json();
            localStorage.setItem('rms-token', data.access_token);
            
            try {
                const userRes = await fetch(`${API_BASE_URL}/api/v1/auth/me`, {
                    headers: { 'Authorization': `Bearer ${data.access_token}` }
                });
                if (userRes.ok) {
                    const userData = await userRes.json();
                    switch (userData.role) {
                        case 'admin':
                        case 'property_manager':
                            window.location.href = 'admin.html';
                            break;
                        case 'landlord':
                            window.location.href = 'landlord.html';
                            break;
                        case 'tenant':
                        default:
                            window.location.href = 'index.html';
                            break;
                    }
                } else {
                    window.location.href = 'index.html';
                }
            } catch (err) {
                console.error('Error fetching user info after login:', err);
                window.location.href = 'index.html';
            }
        } else {
            showStatus('Login failed. Please check your credentials and try again.', 'error', 'login-status');
        }
    } catch (err) {
        console.error('Login error:', err);
        showStatus('Connection error. Please check your internet and try again.', 'error', 'login-status');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
}


// Initialize word rotator on login page
function initWordRotator() {
    const rotator = document.querySelector('.auth-word-rotator');
    if (!rotator) return;
    
    const words = rotator.querySelectorAll('.word');
    if (words.length === 0) return;
    
    let currentIndex = 0;
    
    // Show first word
    words[0].classList.add('active');
    
    // Rotate words every 3 seconds
    setInterval(() => {
        words[currentIndex].classList.remove('active');
        currentIndex = (currentIndex + 1) % words.length;
        words[currentIndex].classList.add('active');
    }, 3000);
}

// Initialize theme
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initWordRotator();
    checkAuth();
});

async function handleRegistration(event) {
    event.preventDefault();
    const firstName = document.getElementById('reg-first').value;
    const lastName = document.getElementById('reg-last').value;
    const email = document.getElementById('reg-email').value;
    const phone = document.getElementById('reg-phone').value;
    const password = document.getElementById('reg-pass').value;
    const termsAccepted = document.getElementById('reg-tos').checked;

    // Validate terms acceptance
    if (!termsAccepted) {
        alert('You must accept the Terms of Service to create an account.');
        return;
    }

    const submitBtn = event.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating Account...';

    try {
        const userData = {
            email: email,
            phone: phone,
            password: password,
            first_name: firstName,
            last_name: lastName,
            role: 'tenant', // Default role
            terms_accepted: termsAccepted
            // Room and Rent removed - to be assigned by landlord
        };

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);

        const response = await fetch(`${API_BASE_URL}/api/v1/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userData),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (response.ok) {
            const data = await response.json();
            const formPanel = document.getElementById('form-panel');
            const successPanel = document.getElementById('success-panel');
            if (formPanel && successPanel) {
                formPanel.style.display = 'none';
                successPanel.style.display = 'block';
            } else {
                showStatus('Registration successful! Please log in.', 'success');
                setTimeout(() => { window.location.href = 'index.html'; }, 2000);
            }
        } else {
            let userMsg = 'Registration failed. Please check your details and try again.';
            try {
                const errorData = await response.json();
                if (errorData.detail) userMsg = errorData.detail;
            } catch (e) {}
            showStatus(userMsg, 'error');
        }
    } catch (err) {
        console.error('Registration error:', err);
        showStatus('Connection error. Please check your internet and try again.', 'error');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
}

function logout() {
    localStorage.removeItem('rms-token');
    window.location.href = 'index.html';
}

function checkAuth() {
    const token = localStorage.getItem('rms-token');
    const authCheck = document.getElementById('auth-check');
    const loginScreen = document.getElementById('login-screen');

    if (!authCheck && !loginScreen) return;

    if (token) {
        if (authCheck) authCheck.style.display = 'block';
        if (loginScreen) loginScreen.style.display = 'none';
        initApp();
    } else {
        if (authCheck) authCheck.style.display = 'none';
        if (loginScreen) loginScreen.style.display = 'block';
        generateCaptcha();
        const emailInput = document.getElementById('login-email');
        if (emailInput) emailInput.focus();
    }
}

// Initialize App
async function initApp() {
    console.log("Initializing Tenant App...");
    const token = localStorage.getItem('rms-token');
    if (!token) return;

    try {
        // Get user info
        const userRes = await fetch(`${API_BASE_URL}/api/v1/auth/me`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (userRes.ok) {
            currentUser = await userRes.json();
            document.querySelectorAll('.user-first-name').forEach(el => el.textContent = currentUser.first_name);
            document.getElementById('user-display').innerHTML = `<i class="fas fa-user"></i> ${currentUser.first_name} ${currentUser.last_name}`;
            document.getElementById('welcome-message').textContent = `Welcome back, ${currentUser.first_name}!`;
            document.getElementById('profile-name').textContent = `${currentUser.first_name} ${currentUser.last_name}`;
            document.getElementById('profile-email').textContent = currentUser.email;
            document.getElementById('profile-phone').textContent = currentUser.phone || 'Not set';
        }
        
        // Set current date
        document.getElementById('current-date').textContent = new Date().toLocaleDateString('en-US', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        });

        // Room Assignment View bypassed since room is selected at registration
        // Just directly load all data
        await Promise.all([
            loadDashboardData(),
            loadNotifications(),
            loadPaymentHistory(),
            loadMaintenanceRequests(),
            loadDocuments(),
            loadFeedbackHistory()
        ]);
        
        loadProfileImage();
        showView('home');
    } catch (err) {
        console.error('App init error:', err);
    }
}

// Dashboard Data
async function loadDashboardData() {
    try {
        // Load arrears
        try {
            const arrears = await apiCall('/api/v1/arrears/my');
            document.getElementById('tenant-arrears').textContent = `Ksh ${arrears.arrears.toLocaleString()}`;
        } catch (err) {
            console.warn('Could not load arrears:', err.message);
        }
        
        // Load monthly rent
        try {
            const properties = await apiCall('/api/v1/properties/my');
            if (properties && properties.length > 0) {
                document.getElementById('monthly-rent').textContent = `Ksh ${properties[0].monthly_rent?.toLocaleString() || '0'}`;
            }
        } catch (err) {
            console.warn('Could not load properties:', err.message);
        }
        
        // Set next due date (5th of next month)
        const today = new Date();
        const nextDue = new Date(today.getFullYear(), today.getMonth() + 1, 5);
        document.getElementById('next-due').textContent = nextDue.toLocaleDateString();
        
    } catch (err) {
        console.error('Error loading dashboard:', err);
    }
}

// View Management
function showView(viewId) {
    const views = ['home', 'property', 'payments', 'maintenance', 'notifications', 'documents', 'feedback', 'messages', 'settings', 'room-assignment-view'];
    
    views.forEach(id => {
        const view = document.getElementById(id);
        if (view) {
            view.classList.remove('active');
            view.style.display = 'none';
        }
    });
    
    const selectedView = document.getElementById(viewId);
    if (selectedView) {
        selectedView.classList.add('active');
        selectedView.style.display = 'block';
    }

    // Update navigation
    document.querySelectorAll('nav a').forEach(link => {
        link.classList.remove('active');
    });
    
    const activeLink = Array.from(document.querySelectorAll('nav a')).find(link => 
        link.getAttribute('onclick') && link.getAttribute('onclick').includes(viewId)
    );
    if (activeLink) activeLink.classList.add('active');

    // Refresh data based on view
    if (viewId === 'notifications') loadNotifications();
    if (viewId === 'payments') loadPaymentHistory();
    if (viewId === 'maintenance') loadMaintenanceRequests();
    if (viewId === 'documents') loadDocuments();
    if (viewId === 'feedback') loadFeedbackHistory();
    if (viewId === 'messages') loadMessages();
}

// Notifications
async function loadNotifications() {
    const list = document.getElementById('notification-list');
    
    try {
        allNotifications = await apiCall('/api/v1/notifications/');
        
        updateNotificationBadge();
        renderNotifications(currentFilter);
    } catch (err) {
        console.error('Error loading notifications:', err);
        if (list) list.innerHTML = '<div class="card">Error loading notifications: ' + err.message + '</div>';
    }
}

function renderNotifications(filter) {
    const list = document.getElementById('notification-list');
    if (!list) return;
    
    let filtered = allNotifications;
    if (filter === 'unread') {
        filtered = allNotifications.filter(n => !n.is_read);
    }
    
    if (filtered.length === 0) {
        list.innerHTML = '<div class="card">No notifications found.</div>';
        return;
    }
    
    list.innerHTML = filtered.map(notif => `
        <div class="notification-item ${!notif.is_read ? 'unread' : ''}" onclick="markNotificationRead(${notif.id})">
            <div class="notification-content">
                <h4>${escapeHtml(notif.title)}</h4>
                <p>${escapeHtml(notif.message)}</p>
                <div class="notification-time">${new Date(notif.created_at).toLocaleString()}</div>
            </div>
            ${!notif.is_read ? '<i class="fas fa-circle" style="color: var(--accent); font-size: 0.75rem;"></i>' : ''}
        </div>
    `).join('');
}

function filterNotifications(filter) {
    currentFilter = filter;
    renderNotifications(filter);
    
    // Update active filter button
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.textContent.toLowerCase().includes(filter)) {
            btn.classList.add('active');
        }
    });
}

async function markNotificationRead(id) {
    const token = localStorage.getItem('rms-token');
    try {
        await fetch(`${API_BASE_URL}/api/v1/notifications/${id}/read`, {
            method: 'PUT',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        await loadNotifications();
    } catch (err) {
        console.error('Error marking notification read:', err);
    }
}

async function markAllRead() {
    const token = localStorage.getItem('rms-token');
    try {
        for (const notif of allNotifications.filter(n => !n.is_read)) {
            await fetch(`${API_BASE_URL}/api/v1/notifications/${notif.id}/read`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}` }
            });
        }
        await loadNotifications();
    } catch (err) {
        console.error('Error marking all read:', err);
    }
}

function updateNotificationBadge() {
    const unreadCount = allNotifications.filter(n => !n.is_read).length;
    const badge = document.getElementById('notif-badge');
    if (badge) {
        if (unreadCount > 0) {
            badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
            badge.style.display = 'inline-block';
        } else {
            badge.style.display = 'none';
        }
    }
}

// Payment History
async function loadPaymentHistory() {
    const tbody = document.getElementById('payment-history-list');
    
    try {
        const payments = await apiCall('/api/v1/payments/my');
        
        if (!payments || payments.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center">No payment history found.</td></tr>';
            return;
        }
        
        tbody.innerHTML = payments.map(payment => `
            <tr>
                <td>${new Date(payment.payment_date).toLocaleDateString()}</td>
                <td>Ksh ${payment.amount.toLocaleString()}</td>
                <td>${payment.payment_method || 'M-Pesa'}</td>
                <td><span class="status-badge status-${payment.status}">${payment.status}</span></td>
                <td>${payment.receipt_url ? '<a href="#" onclick="downloadReceipt(' + payment.id + ')">Download</a>' : '-'}</td>
            </tr>
        `).join('');
    } catch (err) {
        console.error('Error loading payments:', err);
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">Error loading payment history: ' + err.message + '</td></tr>';
    }
}

// Maintenance Requests
async function loadMaintenanceRequests() {
    const container = document.getElementById('maintenance-list');
    
    try {
        const requests = await apiCall('/api/v1/maintenance/my');
        
        if (!requests || requests.length === 0) {
            container.innerHTML = '<div class="card">No maintenance requests found.</div>';
            return;
        }
        
        container.innerHTML = requests.map(req => `
            <div class="card" style="margin-bottom: 1rem;">
                <div style="display: flex; justify-content: space-between; align-items: start;">
                    <h4>${escapeHtml(req.type)}</h4>
                    <span class="status-badge status-${req.status}">${req.status}</span>
                </div>
                <p>${escapeHtml(req.description)}</p>
                <small>Submitted: ${new Date(req.created_at).toLocaleDateString()}</small>
            </div>
        `).join('');
    } catch (err) {
        console.error('Error loading maintenance:', err);
        container.innerHTML = '<div class="card">Error loading maintenance requests: ' + err.message + '</div>';
    }
}

function showMaintenanceModal() {
    document.getElementById('maintenance-modal').style.display = 'flex';
}

function closeMaintenanceModal() {
    document.getElementById('maintenance-modal').style.display = 'none';
}

async function createMaintenanceRequest(event) {
    event.preventDefault();
    const token = localStorage.getItem('rms-token');
    
    const requestData = {
        type: document.getElementById('maint-type').value,
        description: document.getElementById('maint-description').value,
        preferred_time: document.getElementById('maint-time').value
    };
    
    try {
        const res = await fetch(`${API_BASE_URL}/api/v1/maintenance`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestData)
        });
        
        if (res.ok) {
            alert('Maintenance request submitted successfully!');
            closeMaintenanceModal();
            document.getElementById('maintenance-form').reset();
            loadMaintenanceRequests();
        } else {
            alert('Failed to submit request. Please try again.');
        }
    } catch (err) {
        console.error('Error creating request:', err);
        alert('Network error. Please try again.');
    }
}

// Documents
async function loadDocuments() {
    const container = document.getElementById('documents-list');
    
    try {
        const documents = await apiCall('/api/v1/documents/my');
        
        if (!documents || documents.length === 0) {
            container.innerHTML = '<div class="card">No documents available.</div>';
            return;
        }
        
        container.innerHTML = documents.map(doc => `
            <div class="card">
                <i class="fas fa-file-pdf" style="font-size: 2rem; color: var(--danger);"></i>
                <h4>${escapeHtml(doc.title)}</h4>
                <small>Uploaded: ${new Date(doc.uploaded_at).toLocaleDateString()}</small>
                <button onclick="downloadDocument(${doc.id})" class="btn-secondary" style="margin-top: 0.5rem;">Download</button>
            </div>
        `).join('');
    } catch (err) {
        console.error('Error loading documents:', err);
        container.innerHTML = '<div class="card">Error loading documents: ' + err.message + '</div>';
    }
}

// Feedback
async function submitFeedback(event) {
    event.preventDefault();
    
    const feedbackData = {
        subject: document.getElementById('fb-subject').value,
        category: document.getElementById('fb-category').value,
        message: document.getElementById('fb-message').value,
        urgency: document.getElementById('fb-urgency').value
    };
    
    try {
        await apiCall('/api/v1/interactions/feedback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(feedbackData)
        });
        
        alert('Feedback submitted successfully!');
        event.target.reset();
        await loadFeedbackHistory();
    } catch (err) {
        console.error('Error submitting feedback:', err);
        alert('Failed to submit feedback: ' + err.message);
    }
}

async function loadFeedbackHistory() {
    const container = document.getElementById('feedback-history-list');
    
    try {
        const feedbacks = await apiCall('/api/v1/interactions/my-feedback');
        
        if (!feedbacks || feedbacks.length === 0) {
            container.innerHTML = '<div class="card">No feedback history.</div>';
            return;
        }
        
        container.innerHTML = feedbacks.map(fb => `
            <div class="card" style="margin-bottom: 0.5rem;">
                <div style="display: flex; justify-content: space-between;">
                    <strong>${escapeHtml(fb.subject)}</strong>
                    <span class="status-badge">${fb.status || 'Pending'}</span>
                </div>
                <p>${escapeHtml(fb.message)}</p>
                <small>${new Date(fb.created_at).toLocaleDateString()}</small>
            </div>
        `).join('');
    } catch (err) {
        console.error('Error loading feedback:', err);
        container.innerHTML = '<div class="card">Error loading feedback: ' + err.message + '</div>';
    }
}

// Messages
async function loadMessages() {
    const container = document.getElementById('message-recipient');
    const inboxContainer = document.getElementById('message-inbox');
    
    try {
        // Load available recipients (admins and landlords)
        const users = await apiCall('/api/v1/users/contacts');
        
        if (users && users.length > 0) {
            container.innerHTML = '<option value="">Select recipient...</option>' + 
                users.map(u => `<option value="${u.id}">${u.first_name} ${u.last_name} (${u.role})</option>`).join('');
        }
        
        // Load inbox messages
        const messages = await apiCall('/api/v1/messages/inbox');
        
        if (!messages || messages.length === 0) {
            inboxContainer.innerHTML = '<div class="card">No messages yet.</div>';
            return;
        }
        
        inboxContainer.innerHTML = `
            <div class="messages-list">
                ${messages.map(msg => `
                    <div class="message-item ${msg.is_read ? '' : 'unread'}" onclick="openMessage(${msg.id})">
                        <div class="message-header">
                            <strong class="sender-name">Admin/Landlord</strong>
                            <span class="message-date">${new Date(msg.created_at).toLocaleDateString()}</span>
                        </div>
                        <div class="message-subject">${escapeHtml(msg.subject)}</div>
                        <div class="message-preview">${escapeHtml(msg.body.substring(0, 80))}...</div>
                        ${!msg.is_read ? '<span class="unread-indicator"></span>' : ''}
                    </div>
                `).join('')}
            </div>
        `;
    } catch (err) {
        console.error('Error loading messages:', err);
        inboxContainer.innerHTML = '<div class="card">Error loading messages: ' + err.message + '</div>';
    }
}

async function handleSendMessage(event) {
    event.preventDefault();
    const token = localStorage.getItem('rms-token');
    
    const msgData = {
        recipient_id: parseInt(document.getElementById('message-recipient').value),
        subject: document.getElementById('message-subject').value,
        body: document.getElementById('message-body').value
    };
    
    if (!msgData.recipient_id) {
        alert('Please select a recipient.');
        return;
    }
    
    try {
        const res = await fetch(`${API_BASE_URL}/api/v1/messages/`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(msgData)
        });
        
        if (res.ok) {
            alert('Message sent successfully!');
            document.getElementById('send-message-form').reset();
            loadMessages();
        } else {
            const data = await res.json();
            alert('Failed to send message: ' + (data.detail || 'Unknown error'));
        }
    } catch (err) {
        console.error('Error sending message:', err);
        alert('Network error. Please try again.');
    }
}

async function openMessage(messageId) {
    const token = localStorage.getItem('rms-token');
    try {
        const res = await fetch(`${API_BASE_URL}/api/v1/messages/${messageId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (res.ok) {
            const msg = await res.json();
            alert(`Subject: ${msg.subject}\n\n${msg.body}`);
            // Mark as read
            await fetch(`${API_BASE_URL}/api/v1/messages/${messageId}/read`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            loadMessages();
        }
    } catch (err) {
        console.error('Error opening message:', err);
    }
}

// Payment Methods
function payViaMpesa() {
    showQRCode();
}

function payViaCard() {
    alert('Card payment integration - Coming soon!');
}

// M-Pesa QR code — EMVCo format for Paybill 400200 / Account 1106694
function buildMpesaQRData(amount) {
    // Helper: TLV tag (tag number, value string)
    function tlv(tag, val) {
        return tag.toString().padStart(2, '0')
             + val.length.toString().padStart(2, '0')
             + val;
    }

    // Tag 00: Payload Format Indicator = "01"
    const tag00 = tlv('00', '01');

    // Tag 01: Point of Initiation Method (12 = dynamic with amount, 11 = static)
    const tag01 = tlv('01', amount ? '12' : '11');

    // Tag 30: Merchant Account Information
    //   Sub 00: M-Pesa GUID
    //   Sub 01: Business / Paybill number
    //   Sub 02: Account number
    const guid    = 'SKMP00000000000000000000000000000000000000000000';
    const bizNo   = '400200';
    const acctNo  = '1106694';
    const mInfo   = tlv('00', guid) + tlv('01', bizNo) + tlv('02', acctNo);
    const tag30   = tlv('30', mInfo);

    // Tag 52: Merchant Category Code
    const tag52 = tlv('52', '0000');

    // Tag 53: Transaction Currency — 682 = KES (ISO 4217)
    const tag53 = tlv('53', '682');

    // Tag 54: Transaction Amount (omit if no amount yet)
    const tag54 = amount ? tlv('54', amount.toString()) : '';

    // Tag 58: Country Code
    const tag58 = tlv('58', 'KE');

    // Tag 59: Merchant Name
    const tag59 = tlv('59', 'TUIYA BELONG');

    // Tag 60: Merchant City
    const tag60 = tlv('60', 'NAIROBI');

    // Tag 61: Postal Code
    const tag61 = tlv('61', '0000');

    // Tag 62: Additional Data (empty)
    const tag62 = tlv('62', '0000');

    // Build string up to CRC placeholder
    const payload = tag00 + tag01 + tag30 + tag52 + tag53 + tag54 + tag58 + tag59 + tag60 + tag61 + tag62;

    // Tag 63: CRC-16 (CCITT-FALSE, poly 0x1021, init 0xFFFF)
    const crcInput = payload + '6304';
    const crc = crc16CCITT(crcInput);
    const crcHex = crc.toString(16).toUpperCase().padStart(4, '0');

    return payload + tlv('63', crcHex);
}

function crc16CCITT(str) {
    let crc = 0xFFFF;
    for (let i = 0; i < str.length; i++) {
        crc ^= str.charCodeAt(i) << 8;
        for (let j = 0; j < 8; j++) {
            if (crc & 0x8000) {
                crc = (crc << 1) ^ 0x1021;
            } else {
                crc <<= 1;
            }
            crc &= 0xFFFF;
        }
    }
    return crc;
}

function refreshQRCode() {
    const container = document.getElementById('qr-code-container');
    if (!container) return;
    const amount = document.getElementById('qr-amount').value;

    container.innerHTML = '';

    if (typeof qrcode === 'undefined') {
        container.innerHTML = '<p style="color:var(--text-muted);font-size:0.8rem;">QR library loading&hellip;</p>';
        return;
    }

    const data = buildMpesaQRData(amount || null);
    const qr = qrcode(0, 'M');
    qr.addData(data);
    qr.make();
    container.innerHTML = qr.createSvgTag(5, 0);
}

function showQRCode() {
    const modal = document.getElementById('qr-modal');
    if (modal) {
        modal.style.display = 'flex';
        refreshQRCode();
    }
}

function closeQRModal() {
    const modal = document.getElementById('qr-modal');
    if (modal) modal.style.display = 'none';
}

async function submitQRPayment() {
    const code = document.getElementById('qr-mpesa-code').value.trim();
    if (code.length < 8) {
        alert('Please enter a valid M-Pesa confirmation code.');
        return;
    }

    const token = localStorage.getItem('rms-token');
    if (!token) { window.location.href = 'register.html'; return; }

    try {
        const res = await fetch(`${API_BASE_URL}/api/v1/payments/verify-mpesa`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ transaction_code: code })
        });

        if (res.ok) {
            alert('Payment recorded successfully! It will be confirmed shortly.');
            document.getElementById('qr-mpesa-code').value = '';
            closeQRModal();
            if (typeof loadPaymentHistory === 'function') loadPaymentHistory();
            if (typeof loadDashboardData === 'function') loadDashboardData();
        } else {
            const err = await res.json().catch(() => ({}));
            alert(err.detail || 'Payment verification failed. Please try again.');
        }
    } catch (err) {
        console.error('QR payment error:', err);
        alert('Network error. Please try again.');
    }
}

async function submitMpesaCode() {
    const code = document.getElementById('mpesa-code').value;
    if (code.length < 8) {
        alert('Please enter a valid M-Pesa transaction code.');
        return;
    }
    
    const token = localStorage.getItem('rms-token');
    try {
        const res = await fetch(`${API_BASE_URL}/api/v1/payments/verify-mpesa`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ transaction_code: code })
        });
        
        if (res.ok) {
            alert('Payment verified successfully!');
            document.getElementById('mpesa-code').value = '';
            loadPaymentHistory();
            loadDashboardData();
        } else {
            alert('Payment verification failed. Please contact admin.');
        }
    } catch (err) {
        console.error('Error verifying payment:', err);
        alert('Network error. Please try again.');
    }
}

// Profile Management
async function uploadProfileImage(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
        alert('File size must be less than 2MB');
        return;
    }
    
    if (!file.type.startsWith('image/')) {
        alert('Please upload an image file');
        return;
    }

    const reader = new FileReader();
    reader.onload = async function(e) {
        const dataUrl = e.target.result;
        
        // Update UI immediately
        const avatar = document.getElementById('profile-avatar');
        if (avatar) avatar.src = dataUrl;
        
        // Save to backend
        try {
            const res = await apiCall('/users/profile-photo', {
                method: 'POST',
                body: JSON.stringify({ photo_data: dataUrl })
            });
            if (res.ok) {
                showToast('Profile photo updated', 'success');
            }
        } catch (err) {
            console.error('Failed to save photo to backend:', err);
        }
    };
    reader.readAsDataURL(file);
}

async function loadProfileImage() {
    try {
        const data = await apiCall('/users/me/photo');
        if (data && data.profile_picture) {
            const avatar = document.getElementById('profile-avatar');
            if (avatar) avatar.src = data.profile_picture;
        }
    } catch (err) {
        console.error('Failed to load profile photo:', err);
    }
}

function editProfile() {
    alert('Profile editing - Coming soon!');
}

function changePassword() {
    alert('Password change - This would open a secure password change form.');
}

function enable2FA() {
    alert('Two-factor authentication setup - Coming soon!');
}

function updateNotificationPref(type, enabled) {
    console.log(`Notification ${type}: ${enabled}`);
    // API call to update preferences
}

function exportMyData() {
    alert('Data export - This would generate a PDF of your rental history.');
}

function requestAccountDeletion() {
    if (confirm('Are you sure you want to request account deletion? This action cannot be undone.')) {
        alert('Account deletion request submitted. Admin will contact you.');
    }
}

// Room Assignment Logic
async function loadAvailableUnits() {
    const select = document.getElementById('available-units-select');
    if (!select) return;
    
    try {
        const units = await apiCall('/api/v1/tenants/available-units');
        if (units.length === 0) {
            select.innerHTML = '<option value="">No vacant rooms available. Please contact admin.</option>';
            return;
        }
        
        select.innerHTML = '<option value="">-- Choose your unit --</option>' + units.map(u => `
            <option value="${u.id}">${u.property_name} - Room ${u.unit_number} (Ksh ${u.monthly_rent.toLocaleString()}/mo)</option>
        `).join('');
    } catch (err) {
        console.error('Error loading available units:', err);
        select.innerHTML = '<option value="">Error loading units. Please refresh.</option>';
    }
}

async function handleRoomAssignment(event) {
    event.preventDefault();
    const unitId = document.getElementById('available-units-select').value;
    const moveIn = document.getElementById('move-in-date').value;
    const notes = document.getElementById('assignment-notes').value;
    
    if (!unitId) {
        alert('Please select a unit.');
        return;
    }
    
    const submitBtn = event.target.querySelector('button');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Assigning Room...';
    
    try {
        await apiCall('/api/v1/tenants/assign-room', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                unit_id: parseInt(unitId),
                move_in_date: moveIn,
                notes: notes
            })
        });
        
        alert('Room assignment successful! Welcome to your new home.');
        // Refresh app to show dashboard
        initApp();
    } catch (err) {
        console.error('Room assignment error:', err);
        alert('Failed to assign room: ' + err.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Confirm Room Assignment';
    }
}

function refreshData() {
    initApp();
}

function checkPasswordStrength() {
    const password = document.getElementById('reg-pass').value;
    const strengthDiv = document.getElementById('password-strength');
    
    if (!password) {
        strengthDiv.textContent = '';
        return;
    }
    
    let strength = 0;
    let feedback = [];
    
    if (password.length >= 8) strength++;
    else feedback.push('8+ characters');
    
    if (/[a-z]/.test(password)) strength++;
    else feedback.push('lowercase');
    
    if (/[A-Z]/.test(password)) strength++;
    else feedback.push('uppercase');
    
    if (/\d/.test(password)) strength++;
    else feedback.push('number');
    
    if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) strength++;
    else feedback.push('special character');
    
    const colors = ['#ff4444', '#ffaa00', '#aaff00', '#00aa00', '#00aa00'];
    const texts = ['Very Weak', 'Weak', 'Fair', 'Good', 'Strong'];
    
    strengthDiv.textContent = `Password strength: ${texts[strength]}`;
    strengthDiv.style.color = colors[strength];
    
    if (strength < 4) {
        strengthDiv.textContent += ` (Missing: ${feedback.join(', ')})`;
    }
}

// Utility Functions
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function updateSettingsThemeIcon() {
    const theme = document.documentElement.getAttribute('data-theme') || 'light';
    const icon = document.getElementById('settings-theme-icon');
    if (icon) {
        icon.className = theme === 'light' ? 'fas fa-moon' : 'fas fa-sun';
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', function() {
    initTheme();
    // Small delay to ensure DOM is fully ready
    setTimeout(() => {
        checkAuth();
    }, 50);
});

window.onerror = function(msg, url, lineNo, columnNo, error) {
    console.error('Global error:', {msg, url, lineNo, error});
    return false;
};