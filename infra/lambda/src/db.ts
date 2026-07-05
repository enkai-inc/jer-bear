import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { Medicine, Schedule, DoseEvent, Device } from './types';

const client = new DynamoDBClient({});
export const docClient = DynamoDBDocumentClient.from(client);

const MEDICINES_TABLE = process.env.MEDICINES_TABLE!;
const SCHEDULES_TABLE = process.env.SCHEDULES_TABLE!;
const DOSE_EVENTS_TABLE = process.env.DOSE_EVENTS_TABLE!;
const DEVICES_TABLE = process.env.DEVICES_TABLE!;

// ─── Medicines ─────────────────────────────────────────────────

export async function getMedicines(deviceId: string): Promise<Medicine[]> {
  const result = await docClient.send(new QueryCommand({
    TableName: MEDICINES_TABLE,
    KeyConditionExpression: 'deviceId = :d',
    ExpressionAttributeValues: { ':d': deviceId },
  }));
  return (result.Items ?? []) as Medicine[];
}

export async function getMedicine(deviceId: string, medicineId: string): Promise<Medicine | undefined> {
  const result = await docClient.send(new GetCommand({
    TableName: MEDICINES_TABLE,
    Key: { deviceId, medicineId },
  }));
  return result.Item as Medicine | undefined;
}

export async function putMedicine(medicine: Medicine): Promise<void> {
  await docClient.send(new PutCommand({
    TableName: MEDICINES_TABLE,
    Item: medicine,
  }));
}

export async function deleteMedicine(deviceId: string, medicineId: string): Promise<void> {
  await docClient.send(new DeleteCommand({
    TableName: MEDICINES_TABLE,
    Key: { deviceId, medicineId },
  }));
}

// ─── Schedules ─────────────────────────────────────────────────

export async function getSchedules(deviceId: string): Promise<Schedule[]> {
  const result = await docClient.send(new QueryCommand({
    TableName: SCHEDULES_TABLE,
    KeyConditionExpression: 'deviceId = :d',
    ExpressionAttributeValues: { ':d': deviceId },
  }));
  return (result.Items ?? []) as Schedule[];
}

export async function getSchedule(deviceId: string, scheduleId: string): Promise<Schedule | undefined> {
  const result = await docClient.send(new GetCommand({
    TableName: SCHEDULES_TABLE,
    Key: { deviceId, scheduleId },
  }));
  return result.Item as Schedule | undefined;
}

export async function getSchedulesByMedicine(deviceId: string, medicineId: string): Promise<Schedule[]> {
  const result = await docClient.send(new QueryCommand({
    TableName: SCHEDULES_TABLE,
    IndexName: 'byMedicine',
    KeyConditionExpression: 'deviceId = :d AND medicineId = :m',
    ExpressionAttributeValues: { ':d': deviceId, ':m': medicineId },
  }));
  return (result.Items ?? []) as Schedule[];
}

export async function putSchedule(schedule: Schedule): Promise<void> {
  await docClient.send(new PutCommand({
    TableName: SCHEDULES_TABLE,
    Item: schedule,
  }));
}

export async function deleteSchedule(deviceId: string, scheduleId: string): Promise<void> {
  await docClient.send(new DeleteCommand({
    TableName: SCHEDULES_TABLE,
    Key: { deviceId, scheduleId },
  }));
}

// ─── Dose Events ───────────────────────────────────────────────

export async function getDoseEvents(deviceId: string, limit = 50): Promise<DoseEvent[]> {
  const result = await docClient.send(new QueryCommand({
    TableName: DOSE_EVENTS_TABLE,
    IndexName: 'byTimestamp',
    KeyConditionExpression: 'deviceId = :d',
    ExpressionAttributeValues: { ':d': deviceId },
    ScanIndexForward: false,
    Limit: limit,
  }));
  return (result.Items ?? []) as DoseEvent[];
}

export async function putDoseEvent(event: DoseEvent): Promise<void> {
  await docClient.send(new PutCommand({
    TableName: DOSE_EVENTS_TABLE,
    Item: event,
  }));
}

// ─── Devices ───────────────────────────────────────────────────

export async function getDevice(deviceId: string): Promise<Device | undefined> {
  const result = await docClient.send(new GetCommand({
    TableName: DEVICES_TABLE,
    Key: { deviceId },
  }));
  return result.Item as Device | undefined;
}

export async function putDevice(device: Device): Promise<void> {
  await docClient.send(new PutCommand({
    TableName: DEVICES_TABLE,
    Item: device,
  }));
}

export async function getDeviceByCaregiverCode(code: string): Promise<Device | undefined> {
  const result = await docClient.send(new QueryCommand({
    TableName: DEVICES_TABLE,
    IndexName: 'byCaregiverCode',
    KeyConditionExpression: 'caregiverCode = :c',
    ExpressionAttributeValues: { ':c': code },
  }));
  return result.Items?.[0] as Device | undefined;
}
