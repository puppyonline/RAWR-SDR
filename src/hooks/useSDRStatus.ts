import { useState, useEffect } from 'react';

interface SDRStatus {
  connected: boolean;
  device: string;
  sampleRate: number;
  gain: string;
  activeMode: string;
}

export function useSDRStatus(): SDRStatus {
  const [status, setStatus] = useState<SDRStatus>({
    connected: false,
    device: 'No device',
    sampleRate: 2400000,
    gain: 'Auto',
    activeMode: 'Idle',
  });

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/status');
        if (res.ok) {
          const data = await res.json();
          setStatus({
            connected: data.sdrConnected,
            device: data.device || 'Unknown',
            sampleRate: data.sampleRate || 2400000,
            gain: data.gain || 'Auto',
            activeMode: data.activeMode || 'Idle',
          });
        }
      } catch {
        setStatus((prev) => ({ ...prev, connected: false, activeMode: 'Offline' }));
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  return status;
}
