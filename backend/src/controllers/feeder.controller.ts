import { Request, Response } from 'express';
import * as http from 'http';
import { asyncWrapper } from '../middlewares/asyncWrapper';
import { sendSuccess, sendCreated, sendError } from '../utils/response';
import { logger } from '../utils/logger';
import { PetService } from '../services/pet.service';
import { FeedingScheduleService } from '../services/feedingSchedule.service';
import { getRealtimeDatabase } from '../configs/firebase';
import { enrichSchedulesWithPets } from '../utils/enrichSchedules';

const petService = new PetService();
const feedingScheduleService = new FeedingScheduleService();
let activeEsp32Ip: string = process.env.ESP32_IP || '192.168.4.1';

function getESP32IP(): string {
  return activeEsp32Ip;
}

function discoverEsp32Ip(req: Request) {
  let remoteIp = req.ip || req.socket.remoteAddress;
  if (remoteIp) {
    if (remoteIp.startsWith('::ffff:')) {
      remoteIp = remoteIp.substring(7);
    }
    if (remoteIp !== '127.0.0.1' && remoteIp !== '::1') {
      if (activeEsp32Ip !== remoteIp) {
        activeEsp32Ip = remoteIp;
        logger.info(`[Auto-Discovery] Detected and updated ESP32 IP to: ${activeEsp32Ip}`);
      }
    }
  }
}

async function esp32Get(path: string): Promise<{ ok: boolean; data?: string }> {
  try {
    console.log(`Attempting to reach ESP32 at http://${getESP32IP()}${path}...`);
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(`http://${getESP32IP()}${path}`, {
      signal: controller.signal
    });
    clearTimeout(id);
    
    const text = await response.text();
    return { ok: response.status === 200, data: text };
  } catch (err) {
    logger.error(`Error reaching ESP32:`, err);
    return { ok: false };
  }
}

async function esp32GetLong(path: string): Promise<{ ok: boolean; data?: string }> {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 15000);
    
    const response = await fetch(`http://${getESP32IP()}${path}`, {
      signal: controller.signal
    });
    clearTimeout(id);
    
    const text = await response.text();
    return { ok: response.status === 200, data: text };
  } catch (err) {
    logger.error(`Error reaching ESP32 (long):`, err);
    return { ok: false };
  }
}

export const getFeederStatus = asyncWrapper(async (_req: Request, res: Response) => {
  const result = await esp32Get('/status');
  sendSuccess(res, {
    online: result.ok,
    ip: getESP32IP(),
    lastCheck: new Date().toISOString(),
    ...(result.ok ? { message: 'ESP32 reachable' } : { message: 'ESP32 not reachable' }),
  });
});

export const feedNow = asyncWrapper(async (req: Request, res: Response) => {
  const { petId, portionSize, foodType, scheduleId } = req.body;

  if (!petId) {
    sendError(res, 400, 'VALIDATION_ERROR', 'petId is required');
    return;
  }

  let pet;
  try {
    pet = await petService.findById(petId);
  } catch {
    sendError(res, 404, 'PET_NOT_FOUND', `Pet with id ${petId} not found`);
    return;
  }

  const espResult = await esp32GetLong('/llenar');
  if (!espResult.ok) {
    logger.error('ESP32 not reachable for feeding', { ip: getESP32IP(), petId });
    sendError(res, 502, 'ESP32_UNREACHABLE', 'Could not reach the ESP32 feeder');
    return;
  }

  let finalScheduleId: string;
  if (scheduleId) {
    await feedingScheduleService.update(scheduleId, {
      status: 'completed',
      completedTime: new Date().toISOString(),
    });
    finalScheduleId = scheduleId;
  } else {
    const schedule = await feedingScheduleService.create({
      petId,
      portionSize: portionSize || '100g',
      foodType: foodType || 'Croquetas',
      scheduledTime: new Date().toISOString(),
      distributionType: 'manual',
    });

    await feedingScheduleService.update(schedule.id!, {
      status: 'completed',
      completedTime: new Date().toISOString(),
    });
    finalScheduleId = schedule.id!;
  }

  logger.info(`Manual feeding completed`, { petId: pet.id, name: pet.name });
  sendCreated(res, { pet: { id: pet.id, name: pet.name }, feedingId: finalScheduleId }, 'Comida servida correctamente');
});

export const scheduleFeeding = asyncWrapper(async (req: Request, res: Response) => {
  const { petId, portionSize, foodType, scheduledTime } = req.body;

  if (!petId || !scheduledTime) {
    sendError(res, 400, 'VALIDATION_ERROR', 'petId and scheduledTime are required');
    return;
  }

  let pet;
  try {
    pet = await petService.findById(petId);
  } catch {
    sendError(res, 404, 'PET_NOT_FOUND', `Pet with id ${petId} not found`);
    return;
  }

  const schedule = await feedingScheduleService.create({
    petId,
    portionSize: portionSize || '100g',
    foodType: foodType || 'Croquetas',
    scheduledTime,
    distributionType: 'programmed',
  });

  try {
    const rtdb = getRealtimeDatabase();
    await rtdb.ref('horarios').push({ hora: scheduledTime });
    logger.info(`Schedule written to RTDB`, { petId, scheduledTime });
  } catch (err) {
    logger.error('Failed to write to RTDB', err);
  }

  logger.info(`Feeding scheduled`, { petId: pet.id, name: pet.name, scheduledTime });
  sendCreated(res, { pet: { id: pet.id, name: pet.name }, feedingId: schedule.id, scheduledTime }, 'Horario programado correctamente');
});

export const getSchedules = asyncWrapper(async (_req: Request, res: Response) => {
  discoverEsp32Ip(_req);
  const allSchedules = await feedingScheduleService.findAll();
  const programmed = allSchedules.filter((s) => s.distributionType === 'programmed' && s.status === 'pending');
  const enriched = await enrichSchedulesWithPets(programmed);
  sendSuccess(res, enriched);
});

export const getFeedingHistory = asyncWrapper(async (_req: Request, res: Response) => {
  const schedules = await feedingScheduleService.findAll();
  const sliced = schedules.slice(0, 20);
  const enriched = await enrichSchedulesWithPets(sliced);
  sendSuccess(res, enriched);
});

export const completeSchedule = asyncWrapper(async (req: Request, res: Response) => {
  discoverEsp32Ip(req);
  const { scheduleId } = req.body;

  if (!scheduleId) {
    sendError(res, 400, 'VALIDATION_ERROR', 'scheduleId is required');
    return;
  }

  const schedule = await feedingScheduleService.update(scheduleId, {
    status: 'completed',
    completedTime: new Date().toISOString(),
  });

  logger.info(`Schedule completed via ESP32`, { scheduleId, petId: schedule.petId });
  sendSuccess(res, { scheduleId, status: 'completed' }, 'Schedule marked as completed');
});

export const registerFeeder = asyncWrapper(async (req: Request, res: Response) => {
  const { ip } = req.body;
  if (!ip) {
    sendError(res, 400, 'VALIDATION_ERROR', 'ip is required');
    return;
  }
  activeEsp32Ip = ip;
  logger.info(`[Explicit Register] ESP32 registered with IP: ${activeEsp32Ip}`);
  sendSuccess(res, { ip: activeEsp32Ip }, 'ESP32 IP registered successfully');
});
