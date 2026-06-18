import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

const snsClient = new SNSClient({});
const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const SCHEDULES_TABLE = process.env.SCHEDULES_TABLE!;
const DOSE_EVENTS_TABLE = process.env.DOSE_EVENTS_TABLE!;
const DEVICES_TABLE = process.env.DEVICES_TABLE!;
const MEDICINES_TABLE = process.env.MEDICINES_TABLE!;
const PUSH_TOPIC_ARN = process.env.PUSH_TOPIC_ARN!;

/**
 * Runs every minute via EventBridge.
 * Checks all active schedules against recent dose events.
 * If a dose is due and not yet taken/dismissed, sends a push notification.
 */
export async function handler() {
  const now = new Date();

  // Scan all devices (for a single-user app this is fine; would paginate for multi-user)
  const devicesResult = await ddbClient.send(new ScanCommand({
    TableName: DEVICES_TABLE,
  }));
  const devices = devicesResult.Items ?? [];

  for (const device of devices) {
    if (!device.pushToken) continue;

    const deviceId = device.deviceId as string;

    // Get active schedules
    const schedulesResult = await ddbClient.send(new QueryCommand({
      TableName: SCHEDULES_TABLE,
      KeyConditionExpression: 'deviceId = :d',
      ExpressionAttributeValues: { ':d': deviceId },
    }));
    const schedules = (schedulesResult.Items ?? []).filter(s => s.status === 'active');

    for (const schedule of schedules) {
      const isDue = isScheduleDue(schedule, now, device.timezone as string || 'America/New_York');
      if (!isDue) continue;

      // Check if there's already a dose event for this time window
      const alreadyHandled = await hasDoseEventInWindow(deviceId, schedule.scheduleId as string, now);
      if (alreadyHandled) continue;

      // Get medicine name for notification
      const medicineResult = await ddbClient.send(new QueryCommand({
        TableName: MEDICINES_TABLE,
        KeyConditionExpression: 'deviceId = :d AND medicineId = :m',
        ExpressionAttributeValues: { ':d': deviceId, ':m': schedule.medicineId },
      }));
      const medicine = medicineResult.Items?.[0];
      if (!medicine || medicine.status !== 'active') continue;

      // Send push notification
      const qty = medicine.quantity as number;
      const qtyStr = qty === 1 ? '' : `${qty} x `;
      await sendPushNotification(
        device.pushToken as string,
        device.platform as string,
        medicine.name as string,
        `Time to take ${qtyStr}${medicine.strength} (${medicine.form})`,
        {
          medicineId: schedule.medicineId as string,
          scheduleId: schedule.scheduleId as string,
          scheduledTime: now.toISOString(),
        }
      );
    }
  }
}

function isScheduleDue(schedule: Record<string, unknown>, now: Date, timezone: string): boolean {
  // Convert to device's local time
  const localTime = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
  const currentHour = localTime.getHours();
  const currentMinute = localTime.getMinutes();
  const currentDay = localTime.getDay();

  // Check day-of-week filter
  const daysOfWeek = schedule.daysOfWeek as number[] | undefined;
  if (daysOfWeek && daysOfWeek.length > 0 && !daysOfWeek.includes(currentDay)) {
    return false;
  }

  if (schedule.type === 'absolute') {
    const times = schedule.times as string[] | undefined;
    if (!times) return false;

    // Check if current time matches any scheduled time (within 1-minute window)
    return times.some(time => {
      const [h, m] = time.split(':').map(Number);
      return currentHour === h && currentMinute === m;
    });
  }

  if (schedule.type === 'interval') {
    const intervalHours = schedule.intervalHours as number | undefined;
    if (!intervalHours) return false;

    // For interval schedules, check every N hours from midnight
    const minutesSinceMidnight = currentHour * 60 + currentMinute;
    const intervalMinutes = intervalHours * 60;
    return minutesSinceMidnight % intervalMinutes === 0;
  }

  return false;
}

async function hasDoseEventInWindow(deviceId: string, scheduleId: string, now: Date): Promise<boolean> {
  // Check for dose events in the last 5 minutes to avoid duplicate notifications
  const windowStart = new Date(now.getTime() - 5 * 60 * 1000).toISOString();

  const result = await ddbClient.send(new QueryCommand({
    TableName: DOSE_EVENTS_TABLE,
    IndexName: 'byTimestamp',
    KeyConditionExpression: 'deviceId = :d AND #ts >= :start',
    FilterExpression: 'scheduleId = :s',
    ExpressionAttributeNames: { '#ts': 'timestamp' },
    ExpressionAttributeValues: {
      ':d': deviceId,
      ':s': scheduleId,
      ':start': windowStart,
    },
  }));

  return (result.Items?.length ?? 0) > 0;
}

async function sendPushNotification(
  pushToken: string,
  platform: string,
  title: string,
  body: string,
  data: Record<string, string>,
) {
  const message: Record<string, unknown> = {};

  if (platform === 'ios') {
    message.APNS = JSON.stringify({
      aps: {
        alert: { title: `🧸 ${title}`, body },
        sound: 'default',
        badge: 1,
        'content-available': 1,
        'mutable-content': 1,
        category: 'DOSE_REMINDER',
      },
      data,
    });
  } else {
    message.GCM = JSON.stringify({
      notification: { title: `🧸 ${title}`, body },
      data,
      priority: 'high',
    });
  }

  // For Expo push notifications, use Expo's push service format
  message.default = JSON.stringify({
    to: pushToken,
    title: `🧸 ${title}`,
    body,
    data,
    sound: 'default',
    priority: 'high',
    categoryId: 'DOSE_REMINDER',
  });

  await snsClient.send(new PublishCommand({
    TopicArn: PUSH_TOPIC_ARN,
    Message: JSON.stringify(message),
    MessageStructure: 'json',
  }));
}
