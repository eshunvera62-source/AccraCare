/**
 * app.js
 * ---------------------------------------------------------------------------
 * Main patient-facing application controller for index.html.
 * Wires together slot catalog rendering and booking modal workflows.
 * ---------------------------------------------------------------------------
 */

import { initSlotCatalog, refreshSlotCatalog } from './slots.js';
import { openBookingModal } from './booking.js';

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
});