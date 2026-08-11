/**
 * api.js
 * ---------------------------------------------------------------------------
 * Data Access Layer for Accra Hospital Appointment Booking Platform.
 *
 * Talks to the deployed API Gateway + Lambda + DynamoDB backend.
 * Fill in API_BASE_URL below with the `ApiBaseUrl` SAM stack output
 * after deployment, or allow CI to inject it automatically.
 * It looks like:
 *   https://abcd123456.execute-api.us-east-1.amazonaws.com/dev
 *
 * SECURITY NOTES:
 * 1. Admin-only endpoints (createSlot, updateSlotStatus, getBookings, etc.)
 *    require an `x-api-key` header. An admin credential must never be bundled
 *    into this public static site or injected by CI.
 * 2. The API base URL is validated to be either HTTPS (production) or
 *    localhost (development) — plain HTTP to arbitrary hosts is rejected.
 * ---------------------------------------------------------------------------
 */

const DEFAULT_API_BASE_URL = 'http://127.0.0.1:3001';
const configuredApiBaseUrl = 'REPLACE_WITH_YOUR_API_GATEWAY_INVOKE_URL';

// The staff portal sets this value only for the active in-memory session after
// the staff member enters their credential. It is never persisted or deployed.

export const API_BASE_URL =
  (typeof window !== 'undefined' && window.__ACCRA_API_BASE_URL__) ||
  (configuredApiBaseUrl.startsWith('REPLACE_') ? DEFAULT_API_BASE_URL : configuredApiBaseUrl);

function getAdminApiKey() {
  return typeof window !== 'undefined' ? window.__ACCRA_ADMIN_API_KEY__ || '' : '';
}

// Guard: fail fast if URL is unconfigured or not a valid local/HTTPS API URL
if (!API_BASE_URL) {
  const grid = document.getElementById('slots-grid');
  if (grid)
    grid.innerHTML =
      '<p style="color:red;padding:2rem;">Configuration error: API_BASE_URL is not set in frontend/scripts/api.js.</p>';
  throw new Error('API_BASE_URL is not configured.');
}
try {
  const parsed = new URL(API_BASE_URL);
  const isLocalHttp =
    parsed.protocol === 'http:' &&
    (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost');
  if (parsed.protocol !== 'https:' && !isLocalHttp) {
    throw new Error(
      'API_BASE_URL must be an HTTPS API Gateway URL (*.amazonaws.com) or a local http://127.0.0.1 URL.',
    );
  }
} catch (e) {
  throw new Error(`Invalid API_BASE_URL: ${e.message}`);
}

/**
 * Core fetch wrapper that:
 *  - Validates the target URL stays within the configured API base.
 *  - Attaches the admin API key header when `options.admin` is true.
 *  - Parses JSON responses safely (never throws on unexpected response body).
 *
 * @param {string} path - API path (e.g. '/slots').
 * @param {object} options - Fetch options (method, body, etc.).
 * @param {boolean} [options.admin] - If true, attaches the x-api-key header.
 * @returns {Promise<{ok: boolean, status: number, data: object}>}
 */
async function apiFetch(path, options = {}) {
  const base = API_BASE_URL.endsWith('/') ? API_BASE_URL : API_BASE_URL + '/';
  const url = new URL(path.startsWith('/') ? path.slice(1) : path, base);
  // SECURITY: Only allow requests to the configured API base URL.
  if (!url.href.startsWith(API_BASE_URL)) {
    throw new Error(`Blocked request to disallowed URL: ${url.href}`);
  }

  const headers = { 'Content-Type': 'application/json' };
  if (options.admin) {
    const adminApiKey = getAdminApiKey();
    if (!adminApiKey) {
      throw new Error(
        'Admin authentication is not configured. Do not place an admin secret in the public site.',
      );
    }
    headers['x-api-key'] = adminApiKey;
  }

  const res = await fetch(url.href, {
    headers,
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

/**
 * Fetches all hospital appointment slots.
 * Public endpoint — no auth required.
 *
 * @returns {Promise<Array>} List of slot objects.
 */
export async function fetchSlots() {
  let result;
  try {
    result = await apiFetch('/slots');
  } catch (error) {
    throw new Error(
      `Unable to reach the appointment service at ${API_BASE_URL}. ${error.message}`,
    );
  }

  const { ok, status, data } = result;
  if (!ok) {
    throw new Error(data?.error || `The appointment service returned HTTP ${status}.`);
  }
  if (!Array.isArray(data)) {
    throw new Error('The appointment service returned an invalid slots response.');
  }
  return data;
}

/**
 * Creates a new appointment slot (used by Admin portal).
 * Admin-only — requires x-api-key header.
 *
 * @param {object} input - Slot creation payload.
 * @returns {Promise<object>} Created slot object.
 */
export async function createSlot(input) {
  const { data } = await apiFetch('/slots', {
    method: 'POST',
    body: JSON.stringify(input),
    admin: true,
  });
  return data;
}

/**
 * Books a slot for a patient.
 * Public endpoint — no auth required.
 *
 * Handles slot capacity check and race condition error states, matching
 * the same { success, booking, updatedSlot } / { success:false, error } shape
 * the rest of the frontend (booking.js) already expects.
 *
 * @param {string} slotId - The slot ID to book.
 * @param {object} patientData - { name, phone, email? }.
 * @returns {Promise<object>} Booking response.
 */
export async function bookSlot(slotId, patientData) {
  const { data } = await apiFetch(`/slots/${slotId}/book`, {
    method: 'POST',
    body: JSON.stringify({
      name: patientData.name,
      phone: patientData.phone,
      email: patientData.email,
    }),
  });
  return data;
}

/**
 * Fetches patient bookings (filtered by slotId if provided).
 * Admin-only — returns patient PII, requires x-api-key header.
 *
 * @param {string|null} slotId - Optional slot ID filter.
 * @returns {Promise<Array>} List of booking objects.
 */
export async function fetchBookings(slotId = null) {
  const query = slotId && slotId !== 'all' ? `?slotId=${encodeURIComponent(slotId)}` : '';
  const { ok, data } = await apiFetch(`/bookings${query}`, { admin: true });
  if (!ok && (data.error === 'Unauthorized' || data.error === 'Invalid API key')) {
    throw new Error('Unauthorized: Admin API key is required to view patient bookings.');
  }
  if (!ok) return [];
  return data;
}

/**
 * Updates operational status of a slot.
 * Admin-only — requires x-api-key header.
 *
 * @param {string} slotId - The slot ID to update.
 * @param {string} newStatus - 'available' or 'full'.
 * @returns {Promise<object>} Updated slot object.
 */
export async function updateSlotStatus(slotId, newStatus) {
  const { data } = await apiFetch(`/slots/${slotId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status: newStatus }),
    admin: true,
  });
  return data;
}

/**
 * Cancels a booking by its ID.
 * Admin-only — requires x-api-key header.
 *
 * @param {string} bookingId - The booking ID to cancel.
 * @returns {Promise<object>} Deletion response.
 */
export async function deleteBooking(bookingId) {
  const { ok, status, data } = await apiFetch(`/bookings/${bookingId}`, {
    method: 'DELETE',
    admin: true,
  });
  if (!ok) {
    throw new Error(data?.error || `The appointment service returned HTTP ${status}.`);
  }
  return data;
}
