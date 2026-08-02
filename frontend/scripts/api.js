/**
 * api.js
 * Data Access Layer for Accra Hospital Appointment Booking Platform.
 *
 * Talks to the deployed API Gateway + Lambda + DynamoDB backend.
 * Fill in API_BASE_URL below with the "api_base_url" Terraform output
 * once you have run `terraform apply` (see: terraform output api_base_url).
 * It looks like:
 *   https://abcd123456.execute-api.eu-west-1.amazonaws.com/dev
 */

export const API_BASE_URL = "REPLACE_WITH_YOUR_API_GATEWAY_INVOKE_URL";

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
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
