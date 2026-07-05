/**
 * Shared display formatters for medicines, doses, and times.
 * Consolidates the previously hand-rolled copies across screens,
 * components, and notification services.
 */
import { Medicine, Schedule } from '../types';
import { parseTimeString } from '../services/doseSchedule';

/**
 * Dose quantity line, e.g. "2 x 10mg (tablet)" or "10mg (tablet)".
 */
export function formatDoseQuantity(medicine: Medicine): string {
  const qty = medicine.quantity !== 1 ? `${medicine.quantity} x ` : '';
  return `${qty}${medicine.strength} (${medicine.form})`;
}

/**
 * Notification body for a dose reminder, e.g.
 * "Take 2 x 10mg (tablet) — with food".
 */
export function formatDoseBody(medicine: Medicine): string {
  return `Take ${formatDoseQuantity(medicine)}${medicine.instructions ? ` — ${medicine.instructions}` : ''}`;
}

/**
 * Locale time, e.g. "9:00 AM".
 */
export function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/**
 * Relative time until a dose, e.g. "In 45 min", "Now", "Overdue".
 */
export function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffMins = Math.round(diffMs / 60000);

  if (diffMins < 0) return 'Overdue';
  if (diffMins === 0) return 'Now';
  if (diffMins < 60) return `In ${diffMins} min`;
  const hours = Math.floor(diffMins / 60);
  const mins = diffMins % 60;
  return mins > 0 ? `In ${hours}h ${mins}m` : `In ${hours}h`;
}

/**
 * Human-readable schedule summary, e.g. "9:00 AM, 9:00 PM" or "Every 6 hours".
 */
export function formatSchedule(schedule: Schedule): string {
  if (schedule.type === 'absolute' && schedule.times) {
    return schedule.times.map(t => {
      const parsed = parseTimeString(t);
      if (!parsed) return t; // show raw value if invalid
      const ampm = parsed.hour >= 12 ? 'PM' : 'AM';
      const hour = parsed.hour % 12 || 12;
      return `${hour}:${parsed.minute.toString().padStart(2, '0')} ${ampm}`;
    }).join(', ');
  }
  if (schedule.type === 'interval' && schedule.intervalHours) {
    return `Every ${schedule.intervalHours} hours`;
  }
  return '';
}
