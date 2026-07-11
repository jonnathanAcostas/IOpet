'use client';

import { FeedingSchedule } from '@/interfaces/feedingSchedule';
import { api, endpoints } from '@/services/api';
import { useFetch } from './useFetch';

export function useFeedingHistory(petId?: string) {
  const fetcher = petId
    ? () => api.get<FeedingSchedule[]>(endpoints.feedingSchedulesByPet(petId))
    : () => api.get<FeedingSchedule[]>(endpoints.feedingSchedules);

  return useFetch<FeedingSchedule[]>(fetcher, [petId], { refreshInterval: 10000 });
}
