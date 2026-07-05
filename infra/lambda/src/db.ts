import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand, DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
export const docClient = DynamoDBDocumentClient.from(client);

const MEDICINES_TABLE = process.env.MEDICINES_TABLE!;
const SCHEDULES_TABLE = process.env.SCHEDULES_TABLE!;
const DOSE_EVENTS_TABLE = process.env.DOSE_EVENTS_TABLE!;
const DEVICES_TABLE = process.env.DEVICES_TABLE!;

// ─── Medicines ─────────────────────────────────────────────────

export async function getMedicines(deviceId: string) {
  const result = await docClient.send(new QueryCommand({
    TableName: MEDICINES_TABLE,
    KeyConditionExpression: 'deviceId = :d',
    ExpressionAttributeValues: { ':d': deviceId },
  }));
  return result.Items ?? [];
}

export async function getMedicine(deviceId: string, medicineId: string) {
  const result = await docClient.send(new GetCommand({
    TableName: MEDICINES_TABLE,
    Key: { deviceId, medicineId },
  }));
  return result.Item;
}

export async function putMedicine(medicine: Record<string, unknown>) {
  await docClient.send(new PutCommand({
    TableName: MEDICINES_TABLE,
    Item: medicine,
  }));
}

export async function deleteMedicine(deviceId: string, medicineId: string) {
  await docClient.send(new DeleteCommand({
    TableName: MEDICINES_TABLE,
    Key: { deviceId, medicineId },
  }));
}

// ─── Schedules ─────────────────────────────────────────────────

export async function getSchedules(deviceId: string) {
  const result = await docClient.send(new QueryCommand({
    TableName: SCHEDULES_TABLE,
    KeyConditionExpression: 'deviceId = :d',
    ExpressionAttributeValues: { ':d': deviceId },
  }));
  return result.Items ?? [];
}

export async function getSchedulesByMedicine(deviceId: string, medicineId: string) {
  const result = await docClient.send(new QueryCommand({
    TableName: SCHEDULES_TABLE,
    IndexName: 'byMedicine',
    KeyConditionExpression: 'deviceId = :d AND medicineId = :m',
    ExpressionAttributeValues: { ':d': deviceId, ':m': medicineId },
  }));
  return result.Items ?? [];
}

export async function putSchedule(schedule: Record<string, unknown>) {
  await docClient.send(new PutCommand({
    TableName: SCHEDULES_TABLE,
    Item: schedule,
  }));
}

export async function deleteSchedule(deviceId: string, scheduleId: string) {
  await docClient.send(new DeleteCommand({
    TableName: SCHEDULES_TABLE,
    Key: { deviceId, scheduleId },
  }));
}

// ─── Dose Events ───────────────────────────────────────────────

export async function getDoseEvents(deviceId: string, limit = 50) {
  const result = await docClient.send(new QueryCommand({
    TableName: DOSE_EVENTS_TABLE,
    IndexName: 'byTimestamp',
    KeyConditionExpression: 'deviceId = :d',
    ExpressionAttributeValues: { ':d': deviceId },
    ScanIndexForward: false,
    Limit: limit,
  }));
  return result.Items ?? [];
}

export async function getRecentDoseEventsForMedicine(deviceId: string, medicineId: string, limit = 5) {
  const result = await docClient.send(new QueryCommand({
    TableName: DOSE_EVENTS_TABLE,
    IndexName: 'byMedicine',
    KeyConditionExpression: 'deviceId = :d AND medicineId = :m',
    ExpressionAttributeValues: { ':d': deviceId, ':m': medicineId },
    ScanIndexForward: false,
    Limit: limit,
  }));
  return result.Items ?? [];
}

export async function putDoseEvent(event: Record<string, unknown>) {
  await docClient.send(new PutCommand({
    TableName: DOSE_EVENTS_TABLE,
    Item: event,
  }));
}

// ─── Devices ───────────────────────────────────────────────────

export async function getDevice(deviceId: string) {
  const result = await docClient.send(new GetCommand({
    TableName: DEVICES_TABLE,
    Key: { deviceId },
  }));
  return result.Item;
}

export async function putDevice(device: Record<string, unknown>) {
  await docClient.send(new PutCommand({
    TableName: DEVICES_TABLE,
    Item: device,
  }));
}

export async function getDeviceByCaregiverCode(code: string) {
  const result = await docClient.send(new QueryCommand({
    TableName: DEVICES_TABLE,
    IndexName: 'byCaregiverCode',
    KeyConditionExpression: 'caregiverCode = :c',
    ExpressionAttributeValues: { ':c': code },
  }));
  return result.Items?.[0];
}
