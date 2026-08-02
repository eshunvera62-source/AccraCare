/**
 * admin.js
 * Powers the hospital staff portal (admin.html) specifically.
 */

import { fetchSlots, createSlot, fetchBookings, updateSlotStatus } from './api.js';

let allSlots = [];
let allBookings = [];
let activeStaffUser = null;

document.addEventListener('DOMContentLoaded', () => {
  initAdminPage();
});

function initAdminPage() {
  setupAuthFormListeners();

  // In-memory only, by design: staff must sign in again on every page load/
  // refresh. No sessionStorage/localStorage is used anywhere in this project.
  showLoginFormView();
}

function setupAuthFormListeners() {
  const loginForm = document.getElementById('staff-login-form');
  const errorAlert = document.getElementById('login-error-alert');
  const signOutBtn = document.getElementById('staff-sign-out-btn');
  const demoButtons = document.querySelectorAll('.demo-login-preset');

  // Handle Demo Preset Click
  demoButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const emailInput = document.getElementById('staff-email-input');
      const facilitySelect = document.getElementById('staff-facility-select');
      const passwordInput = document.getElementById('staff-password-input');

      if (emailInput) emailInput.value = btn.dataset.email || '';
      if (facilitySelect) facilitySelect.value = btn.dataset.facility || '';
      if (passwordInput) passwordInput.value = 'accramed2026';

      // Auto trigger submit
      if (loginForm) {
        loginForm.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      }
    });
  });

  // Handle Staff Login Submit
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (errorAlert) errorAlert.style.display = 'none';

      const facility = document.getElementById('staff-facility-select').value;
      const email = document.getElementById('staff-email-input').value.trim();
      const password = document.getElementById('staff-password-input').value.trim();

      if (!email || !password) {
        if (errorAlert) {
          errorAlert.textContent = 'Please enter both staff email/ID and account password.';
          errorAlert.style.display = 'block';
        }
        return;
      }

      if (password.length < 4) {
        if (errorAlert) {
          errorAlert.textContent = 'Invalid staff password length.';
          errorAlert.style.display = 'block';
        }
        return;
      }

      // Successful staff login simulation — kept in memory only, on purpose.
      const staffUser = {
        email: email,
        facility: facility,
        name: email.split('@')[0].replace('.', ' ').toUpperCase(),
        role: 'Hospital Operations Officer',
        loggedInAt: new Date().toISOString()
      };

      activeStaffUser = staffUser;

      await showAuthenticatedAdminView(staffUser);
    });
  }

  // Handle Sign Out
  if (signOutBtn) {
    signOutBtn.addEventListener('click', () => {
      activeStaffUser = null;
      showLoginFormView();
    });
  }
}

function showLoginFormView() {
  const authContainer = document.getElementById('staff-auth-container');
  const adminContent = document.getElementById('admin-content-section');
  const userBadge = document.getElementById('staff-user-badge');

  if (authContainer) authContainer.style.display = 'block';
  if (adminContent) adminContent.style.display = 'none';
  if (userBadge) userBadge.style.display = 'none';
}

async function showAuthenticatedAdminView(user) {
  const authContainer = document.getElementById('staff-auth-container');
  const adminContent = document.getElementById('admin-content-section');
  const userBadge = document.getElementById('staff-user-badge');
  const userNameEl = document.getElementById('staff-user-name');
  const userFacilityEl = document.getElementById('staff-user-facility');

  if (userNameEl) userNameEl.textContent = user.name || user.email;
  if (userFacilityEl) userFacilityEl.textContent = user.facility;

  if (authContainer) authContainer.style.display = 'none';
  if (adminContent) adminContent.style.display = 'block';
  if (userBadge) userBadge.style.display = 'flex';

  await loadAdminData();
  setupCreateSlotForm();
  setupBookingsFilter();
}

async function loadAdminData() {
  allSlots = await fetchSlots();
  allBookings = await fetchBookings();

  renderSlotsOverviewTable();
  renderBookingsTable('all');
  populateSlotFilterDropdown();
}

function setupCreateSlotForm() {
  const form = document.getElementById('create-slot-form');
  const alertEl = document.getElementById('create-slot-alert');

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (alertEl) alertEl.style.display = 'none';

    const hospitalName = document.getElementById('slot-hospital-name').value;
    const area = document.getElementById('slot-area').value;
    const department = document.getElementById('slot-department').value;
    const doctorName = document.getElementById('slot-doctor-name').value.trim();
    const doctorTitle = document.getElementById('slot-doctor-title').value.trim();
    const dateTime = document.getElementById('slot-datetime').value;
    const totalSeats = document.getElementById('slot-seats').value;
    const fee = document.getElementById('slot-fee').value.trim();

    if (!doctorName || !dateTime) {
      if (alertEl) {
        alertEl.className = 'alert-box alert-error';
        alertEl.textContent = 'Doctor Name and Date/Time are required.';
        alertEl.style.display = 'block';
      }
      return;
    }

    try {
      await createSlot({
        hospitalName,
        area,
        department,
        doctorName,
        doctorTitle,
        dateTime,
        totalSeats: Number(totalSeats),
        consultationFee: fee || 'GHS 150'
      });

      if (alertEl) {
        alertEl.className = 'alert-box alert-success';
        alertEl.textContent = 'New appointment slot published successfully to Accra catalog!';
        alertEl.style.display = 'block';
      }

      form.reset();
      await loadAdminData();
    } catch (err) {
      if (alertEl) {
        alertEl.className = 'alert-box alert-error';
        alertEl.textContent = 'Error creating appointment slot.';
        alertEl.style.display = 'block';
      }
    }
  });
}

function renderSlotsOverviewTable() {
  const container = document.getElementById('slots-capacity-grid');
  if (!container) return;

  container.innerHTML = allSlots.map((slot) => `
    <div style="background: var(--bg-surface); border: 1px solid var(--border-light); padding: 0.85rem; border-radius: 6px; display: flex; align-items: center; justify-content: space-between; font-size: 0.8rem;">
      <div>
        <div style="font-weight: 700; color: var(--text-main); font-family: var(--font-serif);">${escapeHtml(slot.hospitalName)}</div>
        <div style="color: var(--text-muted); font-size: 0.75rem;">${escapeHtml(slot.doctorName)} • ${escapeHtml(slot.department)}</div>
        <div style="color: var(--text-soft); font-size: 0.75rem; margin-top: 0.15rem;">Seats: ${slot.availableSeats} / ${slot.totalSeats}</div>
      </div>
      <button 
        class="btn ${slot.status === 'available' ? 'btn-outline' : 'btn-primary'}" 
        style="padding: 0.3rem 0.65rem; font-size: 0.75rem; border-radius: 4px;"
        data-toggle-slot-id="${slot.id}"
        data-current-status="${slot.status}"
      >
        ${slot.status === 'available' ? 'Mark Full' : 'Mark Available'}
      </button>
    </div>
  `).join('');

  container.querySelectorAll('[data-toggle-slot-id]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const slotId = btn.dataset.toggleSlotId;
      const curStatus = btn.dataset.currentStatus;
      const nextStatus = curStatus === 'available' ? 'full' : 'available';
      await updateSlotStatus(slotId, nextStatus);
      await loadAdminData();
    });
  });
}

function populateSlotFilterDropdown() {
  const select = document.getElementById('admin-slot-filter');
  if (!select) return;

  select.innerHTML = `<option value="all">All Hospital Slots (${allSlots.length})</option>` +
    allSlots.map((s) => `<option value="${s.id}">${escapeHtml(s.hospitalName)} - ${escapeHtml(s.doctorName)} (${escapeHtml(s.department)})</option>`).join('');
}

function setupBookingsFilter() {
  const select = document.getElementById('admin-slot-filter');
  if (select) {
    select.addEventListener('change', (e) => {
      renderBookingsTable(e.target.value);
    });
  }
}

function renderBookingsTable(filterSlotId) {
  const tbody = document.getElementById('bookings-table-body');
  if (!tbody) return;

  const filtered = filterSlotId === 'all'
    ? allBookings
    : allBookings.filter((b) => b.slotId === filterSlotId);

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colSpan="6" style="text-align: center; color: var(--text-soft); padding: 2rem;">
          No patient bookings recorded for this slot selection.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map((b) => {
    const slot = allSlots.find((s) => s.id === b.slotId);
    const dateStr = new Date(b.bookedAt).toLocaleString('en-GB', {
      dateStyle: 'short',
      timeStyle: 'short'
    });

    return `
      <tr>
        <td style="font-family: monospace; font-weight: 700; color: var(--accent-primary);">${escapeHtml(b.confirmationCode)}</td>
        <td style="font-weight: 600; color: var(--text-main);">${escapeHtml(b.patientName)}</td>
        <td>
          <div>${escapeHtml(b.patientPhone)}</div>
          <div style="font-size: 0.75rem; color: var(--text-soft);">${escapeHtml(b.patientEmail || '-')}</div>
        </td>
        <td>
          <div style="font-weight: 500;">${escapeHtml(slot ? slot.hospitalName : 'Accra Hospital')}</div>
          <div style="font-size: 0.75rem; color: var(--text-soft);">${escapeHtml(slot ? slot.doctorName : '')}</div>
        </td>
        <td style="font-size: 0.75rem; color: var(--text-muted);">${dateStr}</td>
        <td><span class="badge badge-available">Confirmed</span></td>
      </tr>
    `;
  }).join('');
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
