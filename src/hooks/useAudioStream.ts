import { useRef, useCallback, useState } from 'react';

interface AudioStreamState {
  isPlaying: boolean;
  isConnecting: boolean;
  error: string | null;
}

export function useAudioStream() {
  const [state, setState] = useState<AudioStreamState>({
    isPlaying: false,
    isConnecting: false,
    error: null,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const nextTimeRef = useRef(0);
  const bufferQueueRef = useRef<Float32Array[]>([]);
  const processingRef = useRef(false);
  const currentModeRef = useRef<string>('');

  const processQueue = useCallback(() => {
    if (processingRef.current) return;
    processingRef.current = true;

    const ctx = audioCtxRef.current;
    const gainNode = gainNodeRef.current;
    if (!ctx || !gainNode) {
      processingRef.current = false;
      return;
    }

    while (bufferQueueRef.current.length > 0) {
      const samples = bufferQueueRef.current.shift()!;
      const buffer = ctx.createBuffer(1, samples.length, 48000);
      buffer.getChannelData(0).set(samples);

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(gainNode);

      const currentTime = ctx.currentTime;
      const startTime = Math.max(nextTimeRef.current, currentTime + 0.02);
      source.start(startTime);
      nextTimeRef.current = startTime + buffer.duration;
    }

    processingRef.current = false;
  }, []);

  const start = useCallback(async (frequency: number, mode: string) => {
    setState({ isPlaying: false, isConnecting: true, error: null });
    currentModeRef.current = mode;

    try {
      // Tell the server to start/retune
      // Server kills any existing rtl_fm process and starts a new one
      const res = await fetch('/api/tune', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frequency, mode }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to start SDR');
      }

      // Only create AudioContext + WebSocket if not already connected
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new AudioContext({ sampleRate: 48000 });
      }
      if (audioCtxRef.current.state === 'suspended') {
        await audioCtxRef.current.resume();
      }

      if (!gainNodeRef.current || gainNodeRef.current.context !== audioCtxRef.current) {
        gainNodeRef.current = audioCtxRef.current.createGain();
        gainNodeRef.current.connect(audioCtxRef.current.destination);
      }

      // Clear stale audio buffers from previous frequency
      nextTimeRef.current = 0;
      bufferQueueRef.current = [];

      // Only open a new WebSocket if we don't already have one
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws`;
        const ws = new WebSocket(wsUrl);
        ws.binaryType = 'arraybuffer';

        ws.onopen = () => {
          setState({ isPlaying: true, isConnecting: false, error: null });
        };

        ws.onmessage = (event) => {
          if (!(event.data instanceof ArrayBuffer)) return;

          const int16 = new Int16Array(event.data);
          const float32 = new Float32Array(int16.length);
          for (let i = 0; i < int16.length; i++) {
            float32[i] = int16[i] / 32768;
          }

          bufferQueueRef.current.push(float32);

          // Cap at ~2s of buffered audio
          while (bufferQueueRef.current.length > 100) {
            bufferQueueRef.current.shift();
          }

          processQueue();
        };

        ws.onerror = () => {
          setState((prev) => ({ ...prev, error: 'WebSocket connection error' }));
        };

        ws.onclose = () => {
          setState((prev) => ({ ...prev, isPlaying: false }));
        };

        wsRef.current = ws;
      } else {
        // WebSocket already connected, just mark as playing
        // (server already restarted rtl_fm at new freq)
        bufferQueueRef.current = [];
        nextTimeRef.current = 0;
        setState({ isPlaying: true, isConnecting: false, error: null });
      }
    } catch (err: any) {
      setState({ isPlaying: false, isConnecting: false, error: err.message });
    }
  }, [processQueue]);

  /**
   * Retune to a new frequency without tearing down the WebSocket or AudioContext.
   * The server will kill the old rtl_fm and start a new one; audio buffers are flushed
   * so you don't hear stale data from the previous frequency.
   */
  const retune = useCallback(async (frequency: number, mode?: string) => {
    const m = mode || currentModeRef.current;
    try {
      const res = await fetch('/api/tune', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frequency, mode: m }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Retune failed');
      }
      // Flush old audio so there's no crossover between frequencies
      bufferQueueRef.current = [];
      nextTimeRef.current = 0;
    } catch (err: any) {
      setState((prev) => ({ ...prev, error: err.message }));
    }
  }, []);

  const stop = useCallback(async () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    try {
      await fetch('/api/stop', { method: 'POST' });
    } catch { /* ignore */ }

    if (audioCtxRef.current) {
      await audioCtxRef.current.close();
      audioCtxRef.current = null;
      gainNodeRef.current = null;
    }

    bufferQueueRef.current = [];
    currentModeRef.current = '';
    setState({ isPlaying: false, isConnecting: false, error: null });
  }, []);

  const setVolume = useCallback((volumePercent: number) => {
    if (gainNodeRef.current) {
      const normalized = Math.max(0, Math.min(100, volumePercent)) / 100;
      const gain = normalized * normalized;
      gainNodeRef.current.gain.setTargetAtTime(gain, gainNodeRef.current.context.currentTime, 0.015);
    }
  }, []);

  return { ...state, start, stop, retune, setVolume };
}
