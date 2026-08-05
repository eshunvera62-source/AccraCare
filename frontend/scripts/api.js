/**
 * api.js
 * Data Access Layer for Accra Hospital Appointment Booking Platform.
 *
 * Talks to the deployed API Gateway + Lambda + DynamoDB backend.
 * Fill in API_BASE_URL below with the `ApiBaseUrl` SAM stack output
 * after deployment, or allow CI to inject it automatically.
 * It looks like:
 *   https://abcd123456.execute-api.us-east-1.amazonaws.com/dev
 */

const DEFAULT_API_BASE_URL = "http://127.0.0.1:3001";
const configuredApiBaseUrl = "REPLACE_WITH_YOUR_API_GATEWAY_INVOKE_URL";
export const API_BASE_URL = (typeof window !== "undefined" && window.__ACCRA_API_BASE_URL__) ||
  (configuredApiBaseUrl.startsWith('REPLACE_') ? DEFAULT_API_BASE_URL : configuredApiBaseUrl);

// Guard: fail fast if URL is unconfigured or not a valid local/HTTPS API URL
if (!API_BASE_URL) {
  const grid = document.getElementById('slots-grid');
  if (grid) grid.innerHTML = '<p style="color:red;padding:2rem;">Configuration error: API_BASE_URL is not set in frontend/scripts/api.js.</p>';
  throw new Error('API_BASE_URL is not configured.');
}
try {
  const parsed = new URL(API_BASE_URL);
  const isLocalHttp = parsed.protocol === 'http:' && (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost');
  if (parsed.protocol !== 'https:' && !isLocalHttp) {
    throw new Error('API_BASE_URL must be an HTTPS API Gateway URL (*.amazonaws.com) or a local http://127.0.0.1 URL.');
  }
} catch (e) {
  throw new Error(`Invalid API_BASE_URL: ${e.message}`);
}

async function apiFetch(path, options = {}) {
  const url = new URL(path, API_BASE_URL + "/");
  if (!url.href.startsWith(API_BASE_URL)) {
    throw new Error(`Blocked request to disallowed URL: ${url.href}`);
  }
  const res = await fetch(url.href, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

/**
 * Fetches all hospital appointment slots.
 */
export async function fetchSlots() {
  const { ok, data } = await apiFetch("/slots");
  if (!ok) return [];
  return data;
}

/**
 * Creates a new appointment slot (used by Admin portal).
 */
export async function createSlot(input) {
  const { data } = await apiFetch("/slots", {
    method: "POST",
    body: JSON.stringify(input)
  });
  return data;
}

/**
 * Books a slot for a patient.
 * Handles slot capacity check and race condition error states, matching
 * the same { success, booking, updatedSlot } / { success:false, error } shape
 * the rest of the frontend (booking.js) already expects.
 */
export async function bookSlot(slotId, patientData, options = {}) {
  const { data } = await apiFetch(`/slots/${slotId}/book`, {
    method: "POST",
    body: JSON.stringify({
      name: patientData.name,
      phone: patientData.phone,
      email: patientData.email,
      simulateSlotFullError: options.simulateSlotFullError || false
    })
  });
  return data;
}

/**
 * Fetches patient bookings (filtered by slotId if provided).
 */
export async function fetchBookings(slotId = null) {
  const query = slotId && slotId !== "all" ? `?slotId=${encodeURIComponent(slotId)}` : "";
  const { ok, data } = await apiFetch(`/bookings${query}`);
  if (!ok) return [];
  return data;
}

/**
 * Updates operational status of a slot.
 */
export async function updateSlotStatus(slotId, newStatus) {
  const { data } = await apiFetch(`/slots/${slotId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status: newStatus })
  });
  return data;
}
