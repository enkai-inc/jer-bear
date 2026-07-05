/**
 * Shared app-wide constants. Single source of truth for dose-alert timing,
 * notification identifiers, and storage keys.
 */

/** How long an overdue dose stays visible (and alertable) before rolling to the next day. */
export const OVERDUE_GRACE_MS = 5 * 60 * 1000; // 300000

/** Snooze duration in seconds — 'Snooze N min' labels are derived from this. */
export const SNOOZE_SECONDS = 300;

/** Snooze duration in minutes, for user-facing labels. */
export const SNOOZE_MINUTES = SNOOZE_SECONDS / 60;

/** How often the in-app dose checker polls for due doses. */
export const ALERT_POLL_MS = 15000;

/** Notification category identifier used for dose reminders (actions attach to it). */
export const NOTIFICATION_CATEGORY = 'DOSE_REMINDER';

/** Action identifiers attached to dose-reminder notifications. */
export const NOTIFICATION_ACTIONS = {
  TAKEN: 'TAKEN',
  SNOOZE: 'SNOOZE',
  DISMISS: 'DISMISS',
} as const;

/** Values for the `type` field in notification data payloads. */
export const NOTIFICATION_TYPES = {
  DOSE: 'dose_reminder',
  SNOOZE: 'snooze_reminder',
} as const;

/** AsyncStorage key for the persistent device ID. */
export const DEVICE_ID_STORAGE_KEY = '@jer_bear_device_id';

/** Length of the caregiver share code (must match the server's constant). */
export const CAREGIVER_CODE_LENGTH = 6;
