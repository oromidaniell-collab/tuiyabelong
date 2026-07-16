
const API_BASE_URL = (() => {
    const hostname = window.location.hostname;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
    
    if (isLocalhost) {
        return `http://${hostname}:8001`;
    } else {
        return window.location.origin;
    }
})();

let revenueChart = null;

    
async function initLandlordApp() {
    const token = localStorage.getItem('rms-landlord-token');
    if (!token) {
        window.location.href = 'landing.html';
        return;
    }

    await loadDashboardData();
    await loadTenants();
    await loadPayments();
    await loadMaintenanceRequests();
}

async function loadDashboardData() {
    const token = localStorage.getItem('rms-landlord-token');
    
    try {
        const metricsRes = await fetch(`${API_BASE_URL}/api/v1/admin/metrics`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const metrics = await metricsRes.json();
        
        document.getElementById('total-properties').textContent = metrics.total_properties || 0;
        document.getElementById('total-tenants').textContent = metrics.total_tenants || 0;
        document.getElementById('monthly-revenue').textContent = `Ksh ${(metrics.total_revenue || 0).toLocaleString()}`;
        document.getElementById('overdue-amount').textContent = `Ksh ${(metrics.overdue_amount || 0).toLocaleString()}`;
        
        // Load recent payments for the dashboard
        // This will show the 5 most recent payments on the dashboard
        const paymentsRes = await fetch(`${API_BASE_URL}/api/v1/payments/recent`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const payments = await paymentsRes.json();
        
        const tableBody = document.getElementById('recent-payments-table');
        if (payments && payments.length > 0) {
            tableBody.innerHTML = payments.slice(0, 5).map(p => `
                <tr>
                    <td>${p.tenant_name || 'N/A'}</td>
                    <td>${p.property_name || 'N/A'}</td>
                    <td>Ksh ${p.amount.toLocaleString()}</td>
                    <td>${new Date(p.payment_date).toLocaleDateString()}</td>
                    <td><span class="status-badge status-${p.status}">${p.status}</span></td>
                </tr>
            `).join('');
        }
        
        // Initialize chart
        initRevenueChart();
        
    } catch (err) {
        console.error('Error loading dashboard:', err);
    }
}

function initRevenueChart() {
    const ctx = document.getElementById('revenue-chart')?.getContext('2d');
    if (!ctx) return;
    
    if (revenueChart) revenueChart.destroy();
    
    revenueChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
            datasets: [{
                label: 'Revenue (KES)',
                data: [0, 0, 0, 0, 0, 0],
                borderColor: '#4f46e5',
                backgroundColor: 'rgba(79, 70, 229, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: { position: 'bottom' }
            }
        }
    });
}



async function loadTenants() {
    const token = localStorage.getItem('rms-landlord-token');
    const tbody = document.getElementById('tenants-table-body');
    
    try {
        const res = await fetch(`${API_BASE_URL}/api/v1/admin/tenants`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const tenants = await res.json();
        
        if (!tenants || tenants.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">No tenants found.</td></tr>';
            return;
        }
        
        tbody.innerHTML = tenants.map(tenant => `
            <tr>
                <td>${escapeHtml(tenant.name)}</td>
                <td>${escapeHtml(tenant.property_name || 'N/A')}</td>
                <td>${tenant.phone || 'N/A'}</td>
                <td>Ksh ${(tenant.monthly_rent || 0).toLocaleString()}</td>
                <td><span class="status-badge status-${tenant.status}">${tenant.status}</span></td>
                <td>
                    <button onclick="viewTenantDetails(${tenant.id})" class="icon-btn" title="View Details"><i class="fas fa-eye"></i></button>
                    <button onclick="sendMessageToTenant(${tenant.id})" class="icon-btn" title="Send Message"><i class="fas fa-envelope"></i></button>
                </td>
            </tr>
        `).join('');
    } catch (err) {
        console.error('Error loading tenants:', err);
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">Error loading tenants.</td></tr>';
    }
}

async function deleteTenantAccount(userId, name) {
    if (!confirm(`Are you absolutely sure you want to delete the account for ${name}?\n\nThis will permanently remove their access and tenant records.`)) {
        return;
    }

    const token = localStorage.getItem('rms-landlord-token');
    try {
        const res = await fetch(`${API_BASE_URL}/api/v1/admin/tenants/${userId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.ok) {
            alert('Tenant account deleted successfully.');
            // Refresh both the list and the dashboard metrics
            loadTenants();
            loadDashboardData();
        } else {
            const data = await res.json();
            alert('Failed to delete account: ' + (data.detail || 'Unknown error'));
        }
    } catch (err) {
        console.error('Delete error:', err);
        alert('Error connecting to server. Please try again.');
    }
}

async function loadPayments() {
    const token = localStorage.getItem('rms-landlord-token');
    const tbody = document.getElementById('all-payments-table');
    
    try {
        const res = await fetch(`${API_BASE_URL}/api/v1/payments/all`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const payments = await res.json();
        
        if (!payments || payments.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center">No payments found.</td></tr>';
            return;
        }
        
        tbody.innerHTML = payments.map(payment => `
            <tr>
                <td>${escapeHtml(payment.tenant_name)}</td>
                <td>Ksh ${payment.amount.toLocaleString()}</td>
                <td>${new Date(payment.payment_date).toLocaleDateString()}</td>
                <td>${payment.payment_method || 'M-Pesa'}</td>
                <td><span class="status-badge status-${payment.status}">${payment.status}</span></td>
            </tr>
        `).join('');
    } catch (err) {
        console.error('Error loading payments:', err);
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">Error loading payments.</td></tr>';
    }
}

async function loadMaintenanceRequests() {
    const token = localStorage.getItem('rms-landlord-token');
    const container = document.getElementById('maintenance-requests-list');
    
    try {
        const res = await fetch(`${API_BASE_URL}/api/v1/maintenance/all`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const requests = await res.json();
        
        if (!requests || requests.length === 0) {
            container.innerHTML = '<div class="card">No maintenance requests.</div>';
            return;
        }
        
        container.innerHTML = requests.map(req => `
            <div class="card" style="margin-bottom: 1rem;">
                <div style="display: flex; justify-content: space-between;">
                    <h4>${escapeHtml(req.type)} - Unit ${req.unit_number}</h4>
                    <select onchange="updateRequestStatus(${req.id}, this.value)" class="status-select">
                        <option value="pending" ${req.status === 'pending' ? 'selected' : ''}>Pending</option>
                        <option value="in_progress" ${req.status === 'in_progress' ? 'selected' : ''}>In Progress</option>
                        <option value="completed" ${req.status === 'completed' ? 'selected' : ''}>Completed</option>
                    </select>
                </div>
                <p><strong>From:</strong> ${escapeHtml(req.tenant_name)}</p>
                <p>${escapeHtml(req.description)}</p>
                <small>Submitted: ${new Date(req.created_at).toLocaleString()}</small>
            </div>
        `).join('');
    } catch (err) {
        console.error('Error loading maintenance:', err);
        container.innerHTML = '<div class="card">Error loading maintenance requests.</div>';
    }
}

function showLandlordView(viewId) {
    const views = ['dashboard', 'properties', 'tenants', 'payments', 'maintenance', 'utilities', 'reports', 'messages'];
    
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
    
    document.getElementById('view-title').textContent = viewId.charAt(0).toUpperCase() + viewId.slice(1);
    
    // Refresh data
    if (viewId === 'dashboard') loadDashboardData();
    if (viewId === 'tenants') loadTenants();
    if (viewId === 'payments') loadPayments();
    if (viewId === 'maintenance') loadMaintenanceRequests();
    if (viewId === 'utilities') { setDefaultBillingMonth(); loadUtilityCharges(); loadUtilityProfitSummary(); }
    if (viewId === 'messages') loadFeedback();
}



function editProperty(id) {
    alert(`Edit property ${id} - Coming soon!`);
}

function viewPropertyDetails(id) {
    alert(`View property ${id} details - Coming soon!`);
}

function viewTenantDetails(id) {
    const token = localStorage.getItem('rms-landlord-token');
    
    (async () => {
        try {
            const res = await fetch(`${API_BASE_URL}/api/v1/admin/tenants/${id}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const tenant = await res.json();

            if (res.ok) {
                // Display tenant details in a formatted popup
                const details = `
TENANT DETAILS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Name: ${tenant.name}
Email: ${tenant.email}
Phone: ${tenant.phone}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Property: ${tenant.property_name}
Unit: ${tenant.unit_number}
Monthly Rent: Ksh ${(tenant.monthly_rent || 0).toLocaleString()}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Status: ${tenant.status}
Arrears: Ksh ${(tenant.arrears || 0).toLocaleString()}
Last Payment: ${tenant.last_payment_date ? new Date(tenant.last_payment_date).toLocaleDateString() : 'N/A'}
`;
                alert(details);
            } else {
                alert(`Error: ${tenant.detail || 'Failed to load tenant details'}`);
            }
        } catch (err) {
            console.error('Error:', err);
            alert('Error loading tenant details. Please try again.');
        }
    })();
}

function sendMessageToTenant(id) {
    const tenantName = prompt('Tenant name (optional):', '');
    const subject = prompt('Subject:', `Hello ${tenantName || 'Tenant'}`);
    if (subject === null) return;
    const body = prompt('Message:', '');
    if (body === null) return;

    const token = localStorage.getItem('rms-landlord-token');
    if (!token) {
        alert('Not authenticated. Please login again.');
        return;
    }

    fetch(`${API_BASE_URL}/api/v1/messages/`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            recipient_id: id,
            subject: subject.trim(),
            body: body.trim()
        })
    })
        .then(async (res) => {
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                throw new Error(data.detail || 'Failed to send message');
            }
            alert('Message sent successfully!');
        })
        .catch((err) => {
            console.error('Send message error:', err);
            alert(err.message || 'Failed to send message');
        });
}


async function updateRequestStatus(requestId, status) {
    const token = localStorage.getItem('rms-landlord-token');
    try {
        await fetch(`${API_BASE_URL}/api/v1/maintenance/${requestId}/status`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status })
        });
        alert('Status updated successfully!');
        loadMaintenanceRequests();
    } catch (err) {
        console.error('Error updating status:', err);
        alert('Failed to update status.');
    }
}



function logout() {
    localStorage.removeItem('rms-landlord-token');
    localStorage.removeItem('rms-landlord-role');
    window.location.href = 'landlord-login.html';
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('rms-theme', newTheme);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ═══════════════════════════════════════════════════════════
// UTILITIES MANAGEMENT
// ═══════════════════════════════════════════════════════════


// Set default billing month to current month
function setDefaultBillingMonth() {
    const now = new Date();
    const monthStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    const fields = ['water-month', 'wifi-month'];
    fields.forEach(id => {
        const el = document.getElementById(id);
        if (el && !el.value) el.value = monthStr;
    });
}

// Submit a utility charge (water or wifi)
async function submitUtilityCharge(event, utilityType) {
    event.preventDefault();
    const token = localStorage.getItem('rms-landlord-token');
    const amount = parseFloat(document.getElementById(`${utilityType}-amount`).value);
    const billingMonth = document.getElementById(`${utilityType}-month`).value;
    const notes = document.getElementById(`${utilityType}-notes`).value;

    const payload = {
        utility_type: utilityType,
        amount: amount,
        billing_month: billingMonth,
        notes: notes || null
    };

    if (utilityType === 'water') {
        const unitsEl = document.getElementById('water-units');
        if (unitsEl) {
            payload.units_consumed = parseFloat(unitsEl.value);
        }
    }

    try {
        const res = await fetch(`${API_BASE_URL}/api/v1/utilities/`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
        
        const data = await res.json();
        if (res.ok) {
            showToast(data.message || `${utilityType} charge added!`, 'success');
            document.getElementById(`${utilityType}-charge-form`).reset();
            setDefaultBillingMonth();
            loadUtilityCharges();
            loadUtilityProfitSummary();
        } else {
            showToast(data.detail || `Error ${res.status}: Failed to add charge`, 'error');
        }
    } catch (err) {
        console.error('Error adding utility charge:', err);
        showToast('Network error — ' + (err.message || 'Please try again.'), 'error');
    }
}

// Load utility charges list
async function loadUtilityCharges() {
    const token = localStorage.getItem('rms-landlord-token');
    const tbody = document.getElementById('utility-charges-table');
    if (!tbody) return;

    const typeFilter = document.getElementById('filter-utility-type')?.value || '';
    const monthFilter = document.getElementById('filter-utility-month')?.value || '';
    
    let url = `${API_BASE_URL}/api/v1/utilities/?`;
    if (typeFilter) url += `utility_type=${typeFilter}&`;
    if (monthFilter) url += `billing_month=${monthFilter}&`;
    
    try {
        const res = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const charges = await res.json();
        
        if (!charges || !Array.isArray(charges) || charges.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:2rem; color:var(--text-muted);">No utility charges found. Add your first charge above.</td></tr>';
            return;
        }
        
        tbody.innerHTML = charges.map(c => {
            const typeBadge = c.utility_type === 'water'
                ? '<span class="utility-type-badge water">Water</span>'
                : '<span class="utility-type-badge wifi">Wifi</span>';
            const statusClass = c.status === 'paid' ? 'status-paid' : 'status-pending';
            
            return `
                <tr>
                    <td>${typeBadge}</td>
                    <td>${c.units_consumed != null ? c.units_consumed : '—'}</td>
                    <td><strong>Ksh ${c.amount.toLocaleString()}</strong></td>
                    <td>${c.billing_month}</td>
                    <td><span class="status-badge ${statusClass}">${c.status}</span></td>
                    <td>
                        <div style="display:flex; gap:0.25rem;">
                            <button onclick="deleteUtilityCharge(${c.id})" class="icon-btn" title="Delete">
                                <i class="fas fa-trash" style="color:var(--danger)"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        console.error('Error loading utility charges:', err);
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:2rem;">Error loading charges.</td></tr>';
    }
}

// Toggle utility charge status between paid/pending
async function toggleUtilityStatus(chargeId, currentStatus) {
    const token = localStorage.getItem('rms-landlord-token');
    const newStatus = currentStatus === 'pending' ? 'paid' : 'pending';
    
    try {
        const res = await fetch(`${API_BASE_URL}/api/v1/utilities/${chargeId}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status: newStatus })
        });
        
        if (res.ok) {
            showToast(`Charge marked as ${newStatus}`, 'success');
            loadUtilityCharges();
            loadUtilityProfitSummary();
        } else {
            showToast('Failed to update status', 'error');
        }
    } catch (err) {
        showToast('Network error', 'error');
    }
}

// Delete a utility charge
async function deleteUtilityCharge(chargeId) {
    if (!confirm('Are you sure you want to delete this charge?')) return;
    const token = localStorage.getItem('rms-landlord-token');
    
    try {
        const res = await fetch(`${API_BASE_URL}/api/v1/utilities/${chargeId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (res.ok) {
            showToast('Charge deleted', 'success');
            loadUtilityCharges();
            loadUtilityProfitSummary();
        } else {
            showToast('Failed to delete charge', 'error');
        }
    } catch (err) {
        showToast('Network error', 'error');
    }
}

// Load profit summary stats
async function loadUtilityProfitSummary() {
    const token = localStorage.getItem('rms-landlord-token');
    
    try {
        const res = await fetch(`${API_BASE_URL}/api/v1/utilities/profit-summary`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        
        document.getElementById('water-expense').textContent = `Ksh ${(data.total_water_expense || 0).toLocaleString()}`;
        document.getElementById('wifi-expense').textContent = `Ksh ${(data.total_wifi_expense || 0).toLocaleString()}`;
        document.getElementById('total-utility-expense').textContent = `Ksh ${(data.total_utility_expense || 0).toLocaleString()}`;
        document.getElementById('pending-utility-count').textContent = data.pending_count || 0;
    } catch (err) {
        console.error('Error loading utility profit summary:', err);
    }
}

// View invoice/statement for a unit and billing month
async function viewUtilityInvoice(unitId, billingMonth) {
    const token = localStorage.getItem('rms-landlord-token');
    
    try {
        const res = await fetch(`${API_BASE_URL}/api/v1/utilities/statement/${unitId}?billing_month=${billingMonth}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const statement = await res.json();
        
        const invoiceHtml = `
            <div class="invoice-document" id="printable-invoice">
                <div class="invoice-header">
                    <div>
                        <h2 style="margin:0; font-size:1.3rem; color:var(--text-main);">UTILITY INVOICE</h2>
                        <p style="color:var(--text-muted); font-size:0.78rem; margin-top:0.25rem;">Rental Management System</p>
                    </div>
                    <div style="text-align:right;">
                        <p style="font-size:0.82rem;"><strong>Billing Period:</strong> ${statement.billing_month}</p>
                        <p style="font-size:0.78rem; color:var(--text-muted);">Generated: ${new Date(statement.generated_at).toLocaleDateString()}</p>
                    </div>
                </div>
                
                <div class="invoice-tenant-info">
                    <div>
                        <p style="font-size:0.78rem; color:var(--text-muted); margin-bottom:0.2rem;">BILLED TO</p>
                        <p style="font-weight:600; font-size:0.92rem;">${escapeHtml(statement.tenant_name)}</p>
                        ${statement.tenant_email ? `<p style="font-size:0.8rem; color:var(--text-muted);">${statement.tenant_email}</p>` : ''}
                        ${statement.tenant_phone ? `<p style="font-size:0.8rem; color:var(--text-muted);">${statement.tenant_phone}</p>` : ''}
                    </div>
                    <div style="text-align:right;">
                        <p style="font-size:0.78rem; color:var(--text-muted); margin-bottom:0.2rem;">PROPERTY</p>
                        <p style="font-weight:600; font-size:0.92rem;">${escapeHtml(statement.property_name)}</p>
                        <p style="font-size:0.8rem; color:var(--text-muted);">Unit ${escapeHtml(statement.unit_number)}</p>
                    </div>
                </div>

                <table class="invoice-table">
                    <thead>
                        <tr>
                            <th>Service</th>
                            <th>Units</th>
                            <th>Amount (Ksh)</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${statement.charges.map(c => `
                            <tr>
                                <td>
                                    ${c.type === 'water' ? '<i class="fas fa-tint" style="color:#0284c7;"></i>' : '<i class="fas fa-wifi" style="color:#16a34a;"></i>'}
                                    ${c.type.charAt(0).toUpperCase() + c.type.slice(1)}
                                    ${c.notes ? `<br><small style="color:var(--text-muted);">${escapeHtml(c.notes)}</small>` : ''}
                                </td>
                                <td>${c.units_consumed != null ? c.units_consumed : '—'}</td>
                                <td style="text-align:right;">${c.amount.toLocaleString()}</td>
                                <td><span class="status-badge status-${c.status}">${c.status}</span></td>
                            </tr>
                        `).join('')}
                    </tbody>
                    <tfoot>
                        <tr class="invoice-total-row">
                            <td colspan="2" style="text-align:right; font-weight:700;">TOTAL</td>
                            <td style="text-align:right; font-weight:700; font-size:1.05rem;">Ksh ${statement.total_amount.toLocaleString()}</td>
                            <td></td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        `;
        
        document.getElementById('invoice-content').innerHTML = invoiceHtml;
        document.getElementById('invoice-modal').style.display = 'flex';
    } catch (err) {
        console.error('Error loading invoice:', err);
        showToast('Failed to load invoice', 'error');
    }
}

function closeInvoiceModal() {
    document.getElementById('invoice-modal').style.display = 'none';
}

function printInvoice() {
    const content = document.getElementById('printable-invoice');
    if (!content) return;
    
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    printWindow.document.write(`
        <html>
        <head>
            <title>Utility Invoice</title>
            <style>
                body { font-family: 'Inter', system-ui, sans-serif; padding: 2rem; color: #1a1a1a; }
                .invoice-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #e2e8f0; padding-bottom: 1rem; margin-bottom: 1.5rem; }
                .invoice-tenant-info { display: flex; justify-content: space-between; background: #f8fafc; padding: 1rem; border-radius: 8px; margin-bottom: 1.5rem; }
                .invoice-table { width: 100%; border-collapse: collapse; }
                .invoice-table th, .invoice-table td { padding: 0.75rem; text-align: left; border-bottom: 1px solid #e2e8f0; font-size: 0.85rem; }
                .invoice-table th { background: #f1f5f9; font-weight: 600; text-transform: uppercase; font-size: 0.72rem; letter-spacing: 0.04em; }
                .invoice-total-row td { border-top: 2px solid #1a1a1a; padding-top: 0.85rem; }
                .status-badge { padding: 0.15rem 0.5rem; border-radius: 12px; font-size: 0.7rem; font-weight: 600; }
                .status-paid { background: #dcfce7; color: #16a34a; }
                .status-pending { background: #fef3c7; color: #d97706; }
                h2 { margin: 0; }
                p { margin: 0.2rem 0; }
                @media print { body { padding: 0; } }
            </style>
        </head>
        <body>${content.innerHTML}</body>
        </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); }, 300);
}

// Simple toast notification
function showToast(message, type = 'info') {
    // Remove existing toasts
    document.querySelectorAll('.rms-toast').forEach(t => t.remove());
    
    const toast = document.createElement('div');
    toast.className = `rms-toast rms-toast-${type}`;
    toast.innerHTML = `
        <i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}"></i>
        <span>${message}</span>
    `;
    document.body.appendChild(toast);
    
    // Trigger animation
    requestAnimationFrame(() => toast.classList.add('show'));
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Broadcast and Messages
async function submitBroadcast(event) {
    event.preventDefault();
    const token = localStorage.getItem('rms-landlord-token');
    if (!token) return;

    const title = document.getElementById('broadcast-title').value;
    const message = document.getElementById('broadcast-message').value;

    try {
        const res = await fetch(`${API_BASE_URL}/api/v1/notifications/`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                title: title,
                message: message,
                notification_type: 'general',
                broadcast: true
            })
        });

        const data = await res.json();
        if (res.ok) {
            showToast('Broadcast sent successfully!', 'success');
            document.getElementById('broadcast-form').reset();
        } else {
            showToast(data.detail || 'Failed to send broadcast.', 'error');
        }
    } catch (err) {
        console.error('Error sending broadcast:', err);
        showToast('Network error. Please try again.', 'error');
    }
}

async function loadFeedback() {
    const token = localStorage.getItem('rms-landlord-token');
    const container = document.getElementById('feedback-list');
    if (!container) return;

    try {
        const res = await fetch(`${API_BASE_URL}/api/v1/interactions/feedback`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!res.ok) throw new Error('Failed to fetch feedback');
        const feedbacks = await res.json();

        if (!feedbacks || feedbacks.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:2rem; color:var(--text-muted);">No feedback received yet.</div>';
            return;
        }

        container.innerHTML = feedbacks.map(f => `
            <div style="padding: 1rem; border-bottom: 1px solid var(--border); border-radius: var(--radius-sm);">
                <div style="display:flex; justify-content:space-between; margin-bottom:0.5rem; align-items:start;">
                    <div>
                        <strong style="display:block; color:var(--text-main);">${escapeHtml(f.subject)}</strong>
                        <small style="color:var(--accent);">From: ${escapeHtml(f.tenant_name)}</small>
                    </div>
                    <small style="color:var(--text-muted);">${new Date(f.created_at).toLocaleDateString()}</small>
                </div>
                <p style="margin:0.5rem 0; color:var(--text-main); font-size:0.95rem;">${escapeHtml(f.message)}</p>
            </div>
        `).join('');
    } catch (err) {
        console.error('Error loading feedback:', err);
        container.innerHTML = '<div style="text-align:center; padding:2rem; color:var(--danger);">Error loading feedback.</div>';
    }
}

async function generateReport() {
    const type = document.getElementById('report-type').value;
    const output = document.getElementById('report-output');
    output.innerHTML = '<div style="text-align:center; padding:2rem;"><i class="fas fa-spinner fa-spin"></i> Generating...</div>';
    
    try {
        const token = localStorage.getItem('rms-landlord-token');
        
        if (type === 'revenue') {
            // Fetch summary metrics
            const res = await fetch(`${API_BASE_URL}/api/v1/admin/metrics`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const metrics = await res.json();
            
            // Fetch utility summary
            const utilRes = await fetch(`${API_BASE_URL}/api/v1/utilities/profit-summary`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const utilSummary = await utilRes.json();
            
            const totalUtilityExpenses = (utilSummary.total_water || 0) + (utilSummary.total_wifi || 0);
            const netProfit = (metrics.total_revenue || 0) - totalUtilityExpenses;
            
            output.innerHTML = `
                <div class="card" style="margin-top:1rem; border-left: 4px solid var(--accent);">
                    <h4>Revenue Report Summary</h4>
                    <table class="data-table" style="margin-top:1rem;">
                        <tr><td>Total Rent Collected</td><td>Ksh ${(metrics.total_revenue || 0).toLocaleString()}</td></tr>
                        <tr><td>Total Water Expenses</td><td>- Ksh ${(utilSummary.total_water || 0).toLocaleString()}</td></tr>
                        <tr><td>Total Wifi Expenses</td><td>- Ksh ${(utilSummary.total_wifi || 0).toLocaleString()}</td></tr>
                        <tr style="font-weight:bold; color:var(--success);">
                            <td>Net Owner Profit</td>
                            <td>Ksh ${netProfit.toLocaleString()}</td>
                        </tr>
                    </table>
                    <div style="margin-top:1rem; font-size:0.8rem; color:var(--text-muted);">
                        Generated on ${new Date().toLocaleString()}
                    </div>
                </div>
            `;
        } else {
            output.innerHTML = `<div class="card" style="margin-top:1rem; color:var(--text-muted);">${type.charAt(0).toUpperCase() + type.slice(1)} report details - Coming soon with historical trends!</div>`;
        }
    } catch (err) {
        console.error('Error generating report:', err);
        output.innerHTML = '<div class="card" style="margin-top:1rem; color:var(--danger);">Failed to generate report data.</div>';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('rms-theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    initLandlordApp();
});