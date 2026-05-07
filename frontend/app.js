// Main JavaScript for Rental Management System Tenant Portal
// This file handles all frontend logic, including authentication, data fetching, view management, and user interactions.
let currentUser = null;
let allNotifications = [];
let currentFilter = 'all';

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
            alert('Login failed. Please check your credentials and try again.');
        }
    } catch (err) {
        console.error('Login error:', err);
        alert('Login failed. Please check your connection and try again.');
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
}


// Premium Particles for Auth Pages
function initAuthParticles() {
    const containers = document.querySelectorAll('.auth-particles');
    containers.forEach(container => {
        container.innerHTML = '';
        for (let i = 0; i < 20; i++) {
            const p = document.createElement('div');
            p.className = 'particle';
            const size = Math.random() * 5 + 2;
            p.style.width = `${size}px`;
            p.style.height = `${size}px`;
            p.style.left = `${Math.random() * 100}%`;
            p.style.animationDuration = `${Math.random() * 10 + 10}s`;
            p.style.animationDelay = `${Math.random() * 5}s`;
            container.appendChild(p);
        }
    });
}

// Call particles on load
document.addEventListener('DOMContentLoaded', () => {
    initAuthParticles();
    initTheme();
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
            // Show success panel instead of just an alert
            const formPanel = document.getElementById('form-panel');
            const successPanel = document.getElementById('success-panel');
            if (formPanel && successPanel) {
                formPanel.style.display = 'none';
                successPanel.style.display = 'block';
            } else {
                alert('Registration successful! Please log in.');
                window.location.href = 'index.html';
            }
        } else {
            let errorMsg = `Server Error (${response.status})`;
            try {
                const errorData = await response.json();
                errorMsg = errorData.detail || errorMsg;
            } catch (jsonErr) {
                const text = await response.text();
                errorMsg = text.substring(0, 100) || errorMsg;
            }
            alert('Registration failed: ' + errorMsg);
        }
    } catch (err) {
        console.error('Registration error:', err);
        alert(`Registration Error: ${err.message}`);
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
        // Generate CAPTCHA immediately when login screen is shown
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
    const views = ['home', 'property', 'payments', 'maintenance', 'notifications', 'documents', 'feedback', 'settings', 'room-assignment-view'];
    
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

// Payment Methods
function payViaMpesa() {
    alert('M-Pesa Payment\n\nPaybill: 123456\nAccount: Your phone number\nAmount: Monthly rent amount\n\nWe will confirm your payment within 24 hours.');
}

function payViaCard() {
    alert('Card payment integration - Coming soon!');
}

function showQRCode() {
    alert('Scan QR code at the rental office to make payment.');
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
function uploadProfileImage(event) {
    const file = event.target.files[0];
    if (file) {
        if (file.size > 2 * 1024 * 1024) {
            alert('File size must be less than 2MB');
            return;
        }
        
        if (!file.type.startsWith('image/')) {
            alert('Please upload an image file');
            return;
        }

        const reader = new FileReader();
        reader.onload = function(e) {
            const avatar = document.getElementById('profile-avatar');
            if (avatar) {
                avatar.src = e.target.result;
                localStorage.setItem('rms-profile-image', e.target.result);
            }
        };
        reader.readAsDataURL(file);
    }
}

function loadProfileImage() {
    const savedImage = localStorage.getItem('rms-profile-image');
    if (savedImage) {
        const avatar = document.getElementById('profile-avatar');
        if (avatar) avatar.src = savedImage;
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