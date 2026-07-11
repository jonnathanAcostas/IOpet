'use client';

import { useState, useEffect, useCallback } from 'react';
import { ApiResponse } from '@/interfaces/api';

interface UseFetchResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

interface UseFetchOptions {
  refreshInterval?: number;
}

export function useFetch<T>(
  fetcher: () => Promise<ApiResponse<T>>,
  deps: unknown[] = [],
  options?: UseFetchOptions
): UseFetchResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (isSilent = false) => {
    if (!isSilent) {
      setLoading(true);
    }
    setError(null);
    try {
      const response = await fetcher();
      if (response.success && response.data !== undefined) {
        setData(response.data);
      } else {
        if (!isSilent) {
          setError(response.message || 'Unknown error');
        }
      }
    } catch (err) {
      if (!isSilent) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      }
    } finally {
      if (!isSilent) {
        setLoading(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (options?.refreshInterval) {
      const interval = setInterval(() => {
        fetchData(true);
      }, options.refreshInterval);
      return () => clearInterval(interval);
    }
  }, [fetchData, options?.refreshInterval]);

  return { data, loading, error, refetch: () => fetchData(false) };
}
