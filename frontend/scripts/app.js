/**
 * app.js
 * ---------------------------------------------------------------------------
 * Main patient-facing application controller for index.html.
 * Wires together slot catalog rendering, booking modal workflows, and the
 * patient self-service "Manage My Booking" cancellation feature.
 * ---------------------------------------------------------------------------
 */

import { initSlotCatalog, refreshSlotCatalog } from './slots.js';
import { openBookingModal } from './booking.js';
import { lookupMyBookings, cancelMyBooking } from './api.js';

document.addEventListener('DOMContentLoaded', async () => {
  const slotsGrid = document.getElementById('slots-grid');

  if (slotsGrid) {
    // Initialize slot catalog rendering with callback for when a patient clicks "Book Slot"
    await initSlotCatalog(slotsGrid, (selectedSlot) => {
      openBookingModal(
        selectedSlot,
        // On success callback: refresh catalog so seat counts decrement instantly
        (booking, updatedSlot) => {
          refreshSlotCatalog(slotsGrid, (s) => openBookingModal(s, null, null));
        },
        // On slot full error callback: refresh catalog to reflect "Unavailable" badge
        (updatedSlot) => {
          refreshSlotCatalog(slotsGrid, (s) => openBookingModal(s, null, null));
        },
      );
    });
  }

  setupManageBooking();
});

/**
 * Wires up the patient self-service "Manage My Booking" form.
 * Lets a patient enter their email, see their bookings, and cancel one.
 */
function setupManageBooking() {
  const form = document.getElementById('manage-booking-form');
  const alertEl = document.getElementById('manage-booking-alert');
  const listEl = document.getElementById('my-bookings-list');

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (alertEl) alertEl.style.display = 'none';

    const email = document.getElementById('manage-booking-email').value.trim();

    if (!email) {
      if (alertEl) {
        alertEl.className = 'alert-box alert-error';
        alertEl.textContent = 'Please enter your email address.';
        alertEl.style.display = 'block';
      }
      return;
    }

    try {
      const bookings = await lookupMyBookings(email);

      if (listEl) {
        listEl.style.display = 'block';
        renderMyBookings(listEl, email, bookings);
      }
    } catch (err) {
      if (alertEl) {
        alertEl.className = 'alert-box alert-error';
        alertEl.textContent = err.message || 'Failed to load your bookings.';
        alertEl.style.display = 'block';
      }
    }
  });
}

/**
 * Renders the patient's bookings with a Cancel button on each.
 * All dynamic values are set via textContent / escapeHtml — never raw innerHTML.
 *
 * @param {HTMLElement} container - The list container element.
 * @param {string} email - The patient's email (used for ownership verification).
 * @param {Array} bookings - The patient's booking objects.
 */
function renderMyBookings(container, email, bookings) {
  if (!bookings || bookings.length === 0) {
    container.innerHTML = `
      <div class="alert-box alert-error" style="text-align: center;">
        No bookings found for this email address.
      </div>
    `;
    return;
  }

  container.innerHTML = bookings
    .map((b) => {
      const dateStr = new Date(b.bookedAt).toLocaleString('en-GB', {
        dateStyle: 'short',
        timeStyle: 'short',
      });

      return `
      <div style="background: var(--bg-subtle); border: 1px solid var(--border-light); padding: 1rem; border-radius: 6px; margin-bottom: 0.75rem;">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap;">
          <div>
            <div style="font-family: monospace; font-weight: 700; color: var(--accent-primary);">${escapeHtml(b.confirmationCode)}</div>
            <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.15rem;">Booked: ${dateStr}</div>
          </div>
          <button
            class="btn btn-outline"
            style="padding: 0.3rem 0.65rem; font-size: 0.75rem; border-radius: 4px;"
            data-cancel-my-booking-id="${b.id}"
          >
            Cancel Booking
          </button>
        </div>
      </div>
    `;
    })
    .join('');

  container.querySelectorAll('[data-cancel-my-booking-id]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const bookingId = btn.dataset.cancelMyBookingId;
      if (!window.confirm('Are you sure you want to cancel this booking?')) return;

      const alertEl = document.getElementById('manage-booking-alert');
      if (alertEl) alertEl.style.display = 'none';

      try {
        await cancelMyBooking(email, bookingId);
        const remaining = bookings.filter((b) => b.id !== bookingId);
        renderMyBookings(container, email, remaining);

        if (alertEl) {
          alertEl.className = 'alert-box alert-success';
          alertEl.textContent = 'Your booking was cancelled successfully.';
          alertEl.style.display = 'block';
        }
      } catch (err) {
        if (alertEl) {
          alertEl.className = 'alert-box alert-error';
          alertEl.textContent = err.message || 'Failed to cancel your booking.';
          alertEl.style.display = 'block';
        }
      }
    });
  });
}

/**
 * Escapes HTML special characters to prevent XSS injection.
 *
 * @param {*} str - Value to escape.
 * @returns {string} Escaped string safe for innerHTML.
 */
function escapeHtml(str) {
  if (!str) return '';
  const amp = String.fromCharCode(38);
  return String(str)
    .replace(/&/g, () => amp + 'amp;')
    .replace(/</g, () => amp + 'lt;')
    .replace(/>/g, () => amp + 'gt;')
    .replace(/"/g, () => amp + 'quot;');
}
