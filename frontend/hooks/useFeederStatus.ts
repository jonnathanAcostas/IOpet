'use client';

import { useState, useEffect } from 'react';
import { api } from '@/services/api';

interface FeederStatusData {
  online: boolean;
  ip: string;
  lastCheck: string;
  message: string;
}

export function useFeederStatus() {
  const [online, setOnline] = useState<boolean>(false);
  const [ip, setIp] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;

    async function checkStatus() {
      try {
        const res = await api.get<FeederStatusData>('/feeder/status');
        if (isMounted && res.success && res.data) {
          setOnline(res.data.online);
          setIp(res.data.ip);
        } else if (isMounted) {
          setOnline(false);
        }
      } catch {
        if (isMounted) setOnline(false);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    checkStatus();
    const interval = setInterval(checkStatus, 15000); // Consultar cada 15 segundos

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  return { online, ip, loading };
}
