/**
 * slots.js
 * ---------------------------------------------------------------------------
 * Renders and filters the Accra Hospital appointment slot catalog cards.
 *
 * SECURITY NOTES:
 * - All user/API-derived values rendered into HTML are passed through
 *   `escapeHtml()` to prevent XSS injection.
 * - Slot IDs are validated before being used in DOM queries.
 * ---------------------------------------------------------------------------
 */

import { fetchSlots } from './api.js';

let cachedSlots = [];
let currentFilters = {
  searchQuery: '',
  hospital: 'all',
  department: 'all',
  status: 'all',
};

/**
 * Initializes slot listing, populates filter dropdowns, and renders cards.
 *
 * @param {HTMLElement} containerEl - The slots grid container element.
 * @param {Function} onSelectBookCallback - Called when a patient clicks "Book Slot".
 */
export async function initSlotCatalog(containerEl, onSelectBookCallback) {
  if (!containerEl) return;

  try {
    cachedSlots = await fetchSlots();
  } catch (error) {
    renderLoadError(containerEl, error);
    return;
  }
  populateFilterOptions(cachedSlots);
  renderSlots(containerEl, onSelectBookCallback);

  // Setup search input listener
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      currentFilters.searchQuery = e.target.value.toLowerCase().trim();
      renderSlots(containerEl, onSelectBookCallback);
    });
  }

  // Setup hospital dropdown listener
  const hospitalSelect = document.getElementById('hospital-select');
  if (hospitalSelect) {
    hospitalSelect.addEventListener('change', (e) => {
      currentFilters.hospital = e.target.value;
      renderSlots(containerEl, onSelectBookCallback);
    });
  }

  // Setup department dropdown listener
  const deptSelect = document.getElementById('dept-select');
  if (deptSelect) {
    deptSelect.addEventListener('change', (e) => {
      currentFilters.department = e.target.value;
      renderSlots(containerEl, onSelectBookCallback);
    });
  }

  // Setup status filter buttons
  const filterBtns = document.querySelectorAll('[data-status-filter]');
  filterBtns.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      filterBtns.forEach((b) => b.classList.remove('active', 'btn-primary'));
      filterBtns.forEach((b) => b.classList.add('btn-outline'));

      btn.classList.remove('btn-outline');
      btn.classList.add('active', 'btn-primary');

      currentFilters.status = btn.dataset.statusFilter;
      renderSlots(containerEl, onSelectBookCallback);
    });
  });
}

/**
 * Re-fetches slots and updates the view (e.g., after booking or admin update).
 *
 * @param {HTMLElement} containerEl - The slots grid container element.
 * @param {Function} onSelectBookCallback - Called when a patient clicks "Book Slot".
 */
export async function refreshSlotCatalog(containerEl, onSelectBookCallback) {
  try {
    cachedSlots = await fetchSlots();
  } catch (error) {
    renderLoadError(containerEl, error);
    return;
  }
  renderSlots(containerEl, onSelectBookCallback);
}

/**
 * Renders a useful failure state instead of incorrectly presenting an API
 * outage as an empty search result.
 *
 * @param {HTMLElement} containerEl - The slots grid container element.
 * @param {Error} error - Slot loading error.
 */
function renderLoadError(containerEl, error) {
  containerEl.innerHTML = `
    <div style="grid-column: 1 / -1; padding: 3rem; text-align: center; background: #FFFFFF; border: 1px solid var(--border-light); border-radius: 8px;">
      <h3 style="font-family: var(--font-serif); margin-bottom: 0.5rem; color: var(--text-main);">Appointment slots are temporarily unavailable</h3>
      <p style="font-size: 0.85rem; color: var(--text-soft);">${escapeHtml(error.message)}</p>
      <button class="btn btn-outline" type="button" style="margin-top: 1rem;" data-retry-slots>Try again</button>
    </div>
  `;
  containerEl.querySelector('[data-retry-slots]')?.addEventListener('click', () => {
    window.location.reload();
  });
}

/**
 * Populates unique hospitals and departments in the filter `<select>` elements.
 *
 * @param {Array} slots - List of slot objects.
 */
function populateFilterOptions(slots) {
  const hospitalSelect = document.getElementById('hospital-select');
  const deptSelect = document.getElementById('dept-select');

  if (hospitalSelect) {
    const hospitals = Array.from(new Set(slots.map((s) => s.hospitalName)));
    hospitalSelect.innerHTML =
      `<option value="all">All Accra Hospitals</option>` +
      hospitals.map((h) => `<option value="${escapeHtml(h)}">${escapeHtml(h)}</option>`).join('');
  }

  if (deptSelect) {
    const depts = Array.from(new Set(slots.map((s) => s.department)));
    deptSelect.innerHTML =
      `<option value="all">All Departments</option>` +
      depts.map((d) => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('');
  }
}

/**
 * Filters and renders slot cards into the grid container.
 *
 * @param {HTMLElement} containerEl - The slots grid container element.
 * @param {Function} onSelectBookCallback - Called when a patient clicks "Book Slot".
 */
function renderSlots(containerEl, onSelectBookCallback) {
  const filtered = cachedSlots.filter((slot) => {
    const matchesSearch =
      !currentFilters.searchQuery ||
      slot.hospitalName.toLowerCase().includes(currentFilters.searchQuery) ||
      slot.doctorName.toLowerCase().includes(currentFilters.searchQuery) ||
      slot.department.toLowerCase().includes(currentFilters.searchQuery) ||
      slot.area.toLowerCase().includes(currentFilters.searchQuery);

    const matchesHospital =
      currentFilters.hospital === 'all' || slot.hospitalName === currentFilters.hospital;
    const matchesDept =
      currentFilters.department === 'all' || slot.department === currentFilters.department;
    const matchesStatus =
      currentFilters.status === 'all' ||
      (currentFilters.status === 'available' &&
        slot.status === 'available' &&
        slot.availableSeats > 0) ||
      (currentFilters.status === 'full' &&
        (slot.status === 'full' || slot.availableSeats === 0));

    return matchesSearch && matchesHospital && matchesDept && matchesStatus;
  });

  if (filtered.length === 0) {
    containerEl.innerHTML = `
      <div style="grid-column: 1 / -1; padding: 3rem; text-align: center; background: #FFFFFF; border: 1px solid var(--border-light); border-radius: 8px;">
        <h3 style="font-family: var(--font-serif); margin-bottom: 0.5rem; color: var(--text-main);">No matching appointment slots</h3>
        <p style="font-size: 0.85rem; color: var(--text-soft);">Try clearing your search terms or selecting another Accra hospital facility.</p>
      </div>
    `;
    return;
  }

  containerEl.innerHTML = filtered.map((slot) => createSlotCardHtml(slot)).join('');

  // Attach click listeners to book buttons
  containerEl.querySelectorAll('[data-book-slot-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const slotId = btn.dataset.bookSlotId;
      const slot = cachedSlots.find((s) => s.id === slotId);
      if (slot && slot.status === 'available' && slot.availableSeats > 0) {
        onSelectBookCallback(slot);
      }
    });
  });
}

/**
 * Generates HTML for an individual slot card.
 * All dynamic values are escaped to prevent XSS.
 *
 * @param {object} slot - Slot object from the API.
 * @returns {string} HTML string for the slot card.
 */
function createSlotCardHtml(slot) {
  const isAvailable = slot.status === 'available' && slot.availableSeats > 0;

  const formattedDate = new Date(slot.dateTime).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const formattedTime = new Date(slot.dateTime).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  return `
    <article class="slot-card ${isAvailable ? 'available' : 'unavailable'}">
      <div>
        <div class="slot-header">
          <div>
            <h3 class="slot-hospital">${escapeHtml(slot.hospitalName)}</h3>
            <p class="slot-area">${escapeHtml(slot.area)}</p>
          </div>
          <span class="badge ${isAvailable ? 'badge-available' : 'badge-full'}">
            ${isAvailable ? `${slot.availableSeats} Available` : 'Unavailable'}
          </span>
        </div>

        <div style="margin-top: 0.85rem;">
          <span class="badge badge-dept" style="margin-bottom: 0.5rem;">${escapeHtml(slot.department)}</span>
          <div class="slot-meta">
            <span class="doctor-name">${escapeHtml(slot.doctorName)}</span>
            <span style="font-size: 0.75rem; color: var(--text-soft);">${escapeHtml(slot.doctorTitle)}</span>
            <span class="slot-time" style="margin-top: 0.25rem;">${formattedDate} at ${formattedTime}</span>
          </div>
        </div>
      </div>

      <div class="slot-footer">
        <span class="slot-fee">Fee: ${escapeHtml(slot.consultationFee)}</span>
        ${
          isAvailable
            ? `<button class="btn btn-primary" style="padding: 0.4rem 0.9rem; font-size: 0.8rem;" data-book-slot-id="${slot.id}">Book Slot</button>`
            : `<button class="btn btn-disabled" style="padding: 0.4rem 0.9rem; font-size: 0.8rem;" disabled>Slot Full</button>`
        }
      </div>
    </article>
  `;
}

/**
 * Escapes HTML special characters to prevent XSS injection.
 *
 * @param {*} str - Value to escape.
 * @returns {string} Escaped string safe for innerHTML.
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
