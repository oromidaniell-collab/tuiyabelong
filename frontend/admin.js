// Role Management
let currentRole = 'owner';

function switchRole(role) {
    currentRole = role;
    const title = document.getElementById('view-title');
    title.textContent = role === 'owner' ? 'Owner Dashboard' : 'Caretaker Dashboard';

    localStorage.setItem('rms-admin-role', role);
    console.log(`Switched to ${role} view`);
    fetchAdminStats();
    fetchAINarrative();
    if (document.getElementById('users').classList.contains('active')) fetchTenants();
}

// API Base URL configuration for admin backend access
const ADMIN_API_BASE_URL = (() => {
    const hostname = window.location.hostname;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
    
    if (isLocalhost) {
        // In local development, use port 8002 for admin backend
        return `http://${hostname}:8002`;
    } else {
        // In production, use same origin
        return window.location.origin;
    }
})();

async function fetchAdminStats() {
    try {
        const token = localStorage.getItem('rms-admin-token');
        const response = await fetch(`${ADMIN_API_BASE_URL}/api/v1/admin/stats`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();

        document.getElementById('net-profit').textContent = data.net_profit;
        document.getElementById('kra-tax').textContent = data.total_tax;

    } catch (error) {
        console.error('Error fetching admin stats:', error);
    }
}

function showAdminView(viewId, event) {
    if (event && typeof event.preventDefault === 'function') {
        event.preventDefault();
    }

    document.querySelectorAll('.content-view').forEach(v => v.classList.remove('active'));
    const view = document.getElementById(viewId);
    if (view) view.classList.add('active');

    document.querySelectorAll('nav a').forEach(a => a.classList.remove('active'));
    const activeLink = Array.from(document.querySelectorAll('nav a')).find(a => a.getAttribute('onclick')?.includes(viewId));
    if (activeLink) activeLink.classList.add('active');

    if (viewId === 'users') fetchTenants();
}

async function fetchTenants() {
    try {
        const token = localStorage.getItem('rms-admin-token');
        const response = await fetch(`${ADMIN_API_BASE_URL}/api/v1/tenants/`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const tenants = await response.json();

        const body = document.getElementById('tenant-list-body');
        body.innerHTML = tenants.length ? '' : '<tr><td colspan="4" style="padding:2rem; text-align:center;">No tenants found.</td></tr>';

        tenants.forEach(t => {
            const statusClass = t.status === 'active' ? 'success' : 'danger';
            body.innerHTML += `
                <tr style="border-bottom: 1px solid var(--border);">
                    <td style="padding:1rem;">${t.first_name} ${t.last_name}</td>
                    <td style="padding:1rem;">${t.unit_id || 'Unassigned'}</td>
                    <td style="padding:1rem;">${t.phone || 'N/A'}</td>
                    <td style="padding:1rem;"><span style="color: var(--${statusClass})">${t.status}</span></td>
                </tr>
            `;
        });
    } catch (error) {
        console.error('Error fetching tenants:', error);
    }
}

async function fetchAINarrative() {
    const aiPanel = document.getElementById('ai-insights');
    const aiText = document.getElementById('ai-narrative');
    if (!aiPanel || !aiText) return;

    try {
        const token = localStorage.getItem('rms-admin-token');
        const res = await fetch(`${ADMIN_API_BASE_URL}/api/v1/reports/ai-narrative`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.ok) {
            const data = await res.json();
            aiText.textContent = data.narrative;
            aiPanel.style.display = 'block';
        }
    } catch (error) {
        console.error('Error fetching AI narrative:', error);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Check authentication
    const token = localStorage.getItem('rms-admin-token');
    if (!token) {
        window.location.href = 'admin-login.html';
        return;
    }
    
    fetchAdminStats();
    fetchAINarrative();
    const savedRole = localStorage.getItem('rms-admin-role') || 'owner';
    const select = document.querySelector('.role-selector select');
    if (select) {
        select.value = savedRole;
        switchRole(savedRole);
    }
});
