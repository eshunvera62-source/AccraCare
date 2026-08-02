/**
 * booking.js
 * Manages the appointment booking modal, form validation, success receipts, and race-condition handling.
 */

import { bookSlot } from './api.js';

let activeSlot = null;
let onSuccessCallback = null;
let onSlotFullCallback = null;

/**
 * Opens the booking modal overlay for a specific slot.
 */
export function openBookingModal(slot, onSuccess, onSlotFull) {
  activeSlot = slot;
  onSuccessCallback = onSuccess;
  onSlotFullCallback = onSlotFull;

  const overlay = document.getElementById('booking-modal-overlay');
  if (!overlay) return;

  renderModalForm();
  overlay.classList.add('active');
}

/**
 * Closes the booking modal overlay.
 */
export function closeBookingModal() {
  const overlay = document.getElementById('booking-modal-overlay');
  if (overlay) {
    overlay.classList.remove('active');
  }
  activeSlot = null;
}

/**
 * Renders the initial booking form inside the modal container.
 */
function renderModalForm() {
  const container = document.getElementById('modal-card-content');
  if (!container || !activeSlot) return;

  const formattedDate = new Date(activeSlot.dateTime).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });

  const formattedTime = new Date(activeSlot.dateTime).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });

  container.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.25rem;">
      <h2 style="font-family: var(--font-serif); font-size: 1.35rem;">Book Appointment</h2>
      <button id="close-modal-btn" style="background: none; border: none; font-size: 1.25rem; color: var(--text-soft); cursor: pointer; padding: 0.2rem 0.5rem;">&times;</button>
    </div>

    <div style="background-color: var(--bg-subtle); padding: 0.85rem; border-radius: 6px; border: 1px solid var(--border-light); margin-bottom: 1.25rem; font-size: 0.85rem;">
      <div style="font-weight: 700; color: var(--text-main); font-family: var(--font-serif);">${escapeHtml(activeSlot.hospitalName)}</div>
      <div style="color: var(--text-muted); font-size: 0.8rem; margin-top: 0.15rem;">${escapeHtml(activeSlot.doctorName)} • ${escapeHtml(activeSlot.department)}</div>
      <div style="color: var(--accent-primary); font-weight: 600; margin-top: 0.25rem;">${formattedDate} at ${formattedTime}</div>
    </div>

    <form id="booking-form">
      <div class="form-group">
        <label for="patient-name">Full Patient Name *</label>
        <input type="text" id="patient-name" class="form-control" placeholder="e.g. Kwame Mensah" required />
        <div id="name-error" class="form-error" style="display:none;"></div>
      </div>

      <div class="form-group">
        <label for="patient-phone">Phone Number (for SMS confirmation) *</label>
        <input type="tel" id="patient-phone" class="form-control" placeholder="e.g. 024 412 3456 or +233 24 412 3456" required />
        <div class="form-hint">Ghana format hint: 024, 020, 055, or +233 24 XXX XXXX</div>
        <div id="phone-error" class="form-error" style="display:none;"></div>
      </div>

      <div class="form-group">
        <label for="patient-email">Email Address (Optional)</label>
        <input type="email" id="patient-email" class="form-control" placeholder="e.g. kwame.mensah@example.com" />
      </div>

      <div style="margin-bottom: 1.25rem; padding: 0.65rem; background: var(--bg-subtle); border-radius: 6px; font-size: 0.75rem; color: var(--text-muted);">
        <label style="display: flex; align-items: flex-start; gap: 0.5rem; cursor: pointer;">
          <input type="checkbox" id="simulate-full-chk" style="margin-top: 0.15rem;" />
          <span><strong>System Concurrency Test:</strong> Simulate "Slot just became full" capacity error on submit.</span>
        </label>
      </div>

      <div style="display: flex; gap: 0.75rem; margin-top: 1.5rem;">
        <button type="button" id="cancel-booking-btn" class="btn btn-outline" style="flex: 1; border-radius: 8px;">Cancel</button>
        <button type="submit" id="submit-booking-btn" class="btn btn-primary" style="flex: 2; border-radius: 8px;">Confirm & Send SMS</button>
      </div>
    </form>
  `;

  // Attach event handlers
  document.getElementById('close-modal-btn')?.addEventListener('click', closeBookingModal);
  document.getElementById('cancel-booking-btn')?.addEventListener('click', closeBookingModal);

  const form = document.getElementById('booking-form');
  if (form) {
    form.addEventListener('submit', handleFormSubmit);
  }
}

/**
 * Handles form submission and calls api.js bookSlot().
 */
async function handleFormSubmit(e) {
  e.preventDefault();

  const nameInput = document.getElementById('patient-name');
  const phoneInput = document.getElementById('patient-phone');
  const emailInput = document.getElementById('patient-email');
  const simulateChk = document.getElementById('simulate-full-chk');

  const nameError = document.getElementById('name-error');
  const phoneError = document.getElementById('phone-error');

  if (nameError) nameError.style.display = 'none';
  if (phoneError) phoneError.style.display = 'none';

  const nameVal = nameInput ? nameInput.value.trim() : '';
  const phoneVal = phoneInput ? phoneInput.value.trim() : '';
  const emailVal = emailInput ? emailInput.value.trim() : '';
  const simulateFull = simulateChk ? simulateChk.checked : false;

  let isValid = true;
  if (!nameVal) {
    if (nameError) {
      nameError.textContent = 'Please enter patient name.';
      nameError.style.display = 'block';
    }
    isValid = false;
  }

  if (!phoneVal) {
    if (phoneError) {
      phoneError.textContent = 'Phone number is required for SMS confirmation.';
      phoneError.style.display = 'block';
    }
    isValid = false;
  } else if (!validateGhanaPhone(phoneVal)) {
    if (phoneError) {
      phoneError.textContent = 'Please enter a valid Ghana phone number (e.g. 024 123 4567 or +233 24 123 4567).';
      phoneError.style.display = 'block';
    }
    isValid = false;
  }

  if (!isValid) return;

  const submitBtn = document.getElementById('submit-booking-btn');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Processing...';
  }

  const res = await bookSlot(
    activeSlot.id,
    { name: nameVal, phone: phoneVal, email: emailVal },
    { simulateSlotFullError: simulateFull }
  );

  if (res.success && res.booking) {
    renderSuccessState(res.booking);
    if (onSuccessCallback) onSuccessCallback(res.booking, res.updatedSlot);
  } else if (res.error === 'SLOT_JUST_FILLED') {
    renderSlotFullErrorState(res.updatedSlot);
    if (onSlotFullCallback) onSlotFullCallback(res.updatedSlot);
  } else {
    if (phoneError) {
      phoneError.textContent = res.error || 'Failed to complete booking. Please try again.';
      phoneError.style.display = 'block';
    }
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Confirm & Send SMS';
    }
  }
}

/**
 * Renders clear success confirmation state with code, SMS message, and iCal calendar file download.
 */
function renderSuccessState(booking) {
  const container = document.getElementById('modal-card-content');
  if (!container) return;

  container.innerHTML = `
    <div style="text-align: center; padding: 0.5rem 0;">
      <div class="alert-box alert-success" style="margin-bottom: 1rem;">
        <strong>Appointment Confirmed!</strong><br />
        Your outpatient booking has been processed successfully.
      </div>

      <div class="confirmation-code-display">
        <div class="code-title">Official Confirmation Code</div>
        <div class="code-value">${escapeHtml(booking.confirmationCode)}</div>
      </div>

      <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1.25rem;">
        A confirmation SMS has been sent to <strong>${escapeHtml(booking.patientPhone)}</strong>.
        Please present this confirmation code upon arrival at <strong>${escapeHtml(activeSlot.hospitalName)}</strong>.
      </p>

      <div style="margin-bottom: 1.25rem;">
        <button id="add-to-calendar-btn" class="btn btn-outline" style="width: 100%; border-radius: 8px; justify-content: center; gap: 0.5rem;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="16" y1="2" x2="16" y2="6"></line>
            <line x1="8" y1="2" x2="8" y2="6"></line>
            <line x1="3" y1="10" x2="21" y2="10"></line>
          </svg>
          Add to Calendar (.ics download)
        </button>
      </div>

      <button id="finish-booking-btn" class="btn btn-primary" style="width: 100%; border-radius: 8px;">
        Done & Return to Catalog
      </button>
    </div>
  `;

  const calendarBtn = document.getElementById('add-to-calendar-btn');
  if (calendarBtn && activeSlot) {
    calendarBtn.addEventListener('click', () => {
      downloadICalendarFile(booking, activeSlot);
    });
  }

  document.getElementById('finish-booking-btn')?.addEventListener('click', closeBookingModal);
}

/**
 * Generates and triggers download of an iCalendar (.ics) event file.
 */
function downloadICalendarFile(booking, slot) {
  const startDate = new Date(slot.dateTime);
  const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // 1 hour duration

  const formatUtcDate = (date) => {
    return date.toISOString().replace(/-|:|\.\d\d\d/g, '');
  };

  const nowStr = formatUtcDate(new Date());
  const dtStart = formatUtcDate(startDate);
  const dtEnd = formatUtcDate(endDate);

  const icsLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//AccraCare//Hospital Outpatient Booking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${booking.confirmationCode}-${Date.now()}@accracare.gh`,
    `DTSTAMP:${nowStr}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:Hospital Appointment: ${slot.hospitalName} (${slot.department})`,
    `DESCRIPTION:Patient: ${booking.patientName}\\nDoctor: ${slot.doctorName} (${slot.doctorTitle || 'Specialist'})\\nConfirmation Code: ${booking.confirmationCode}\\nConsultation Fee: ${slot.consultationFee}`,
    `LOCATION:${slot.hospitalName}, ${slot.area}`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR'
  ];

  const icsContent = icsLines.join('\r\n');
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const downloadUrl = URL.createObjectURL(blob);

  const downloadAnchor = document.createElement('a');
  downloadAnchor.href = downloadUrl;
  downloadAnchor.download = `appointment-${booking.confirmationCode}.ics`;
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  document.body.removeChild(downloadAnchor);
  URL.revokeObjectURL(downloadUrl);
}

/**
 * Renders clear race-condition error state when slot is filled before submit.
 */
function renderSlotFullErrorState(updatedSlot) {
  const container = document.getElementById('modal-card-content');
  if (!container) return;

  container.innerHTML = `
    <div style="text-align: center; padding: 0.5rem 0;">
      <div class="alert-box alert-error" style="margin-bottom: 1rem; text-align: left;">
        <strong>This Slot Just Became Full</strong><br />
        Another patient secured the last seat for <strong>${escapeHtml(activeSlot.hospitalName)}</strong> a moment ago while you were completing the form.
      </div>

      <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1.5rem; text-align: left;">
        The catalog has been automatically updated to reflect this slot as <em>Unavailable</em>. Please pick another available time or medical center in Accra.
      </p>

      <button id="pick-other-slot-btn" class="btn btn-primary" style="width: 100%; border-radius: 8px;">
        Pick Another Available Slot
      </button>
    </div>
  `;

  document.getElementById('pick-other-slot-btn')?.addEventListener('click', closeBookingModal);
}

function validateGhanaPhone(phone) {
  const cleaned = phone.replace(/[\s\-\(\)]/g, '');
  return /^(\+?233|0)[235][0-9]{8}$/.test(cleaned) || cleaned.length >= 9;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
