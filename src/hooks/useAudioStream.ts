import { useRef, useCallback, useState, useEffect } from 'react';

interface AudioStreamState {
  isPlaying: boolean;
  isConnecting: boolean;
  error: string | null;
}

/**
 * Hook for streaming audio from the RTL-SDR backend.
 * 
 * Usage: call tune(frequency, mode) to start or retune.
 * The hook manages the WebSocket, AudioContext, and GainNode internally.
 * Changing frequency just calls tune() again — the server kills the old
 * rtl_fm process and starts a new one, audio buffers are flushed.
 */
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

  const ensureAudioContext = useCallback(async () => {
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
  }, []);

  const ensureWebSocket = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      return; // already connected
    }
    if (wsRef.current) {
      wsRef.current.close();
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      setState((prev) => ({ ...prev, isPlaying: true, isConnecting: false }));
    };

    ws.onmessage = (event) => {
      if (!(event.data instanceof ArrayBuffer)) return;
      const int16 = new Int16Array(event.data);
      const float32 = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) {
        float32[i] = int16[i] / 32768;
      }
      bufferQueueRef.current.push(float32);
      while (bufferQueueRef.current.length > 100) {
        bufferQueueRef.current.shift();
      }
      processQueue();
    };

    ws.onerror = () => {
      setState((prev) => ({ ...prev, error: 'WebSocket error' }));
    };

    ws.onclose = () => {
      setState((prev) => ({ ...prev, isPlaying: false }));
    };

    wsRef.current = ws;
  }, [processQueue]);

  /**
   * Tune to a frequency. If already playing, this retunes (kills old rtl_fm,
   * starts new one). If not playing, this starts everything up.
   */
  const tune = useCallback(async (frequency: number, mode: string) => {
    setState((prev) => ({ ...prev, isConnecting: true, error: null }));

    try {
      // Tell server to (re)tune — server handles killing old process
      const res = await fetch('/api/tune', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frequency, mode }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Tune failed');
      }

      // Flush stale audio
      bufferQueueRef.current = [];
      nextTimeRef.current = 0;

      // Ensure audio pipeline is running
      await ensureAudioContext();
      ensureWebSocket();

      setState({ isPlaying: true, isConnecting: false, error: null });
    } catch (err: any) {
      setState({ isPlaying: false, isConnecting: false, error: err.message });
    }
  }, [ensureAudioContext, ensureWebSocket]);

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
    setState({ isPlaying: false, isConnecting: false, error: null });
  }, []);

  const setVolume = useCallback((volumePercent: number) => {
    if (gainNodeRef.current) {
      const normalized = Math.max(0, Math.min(100, volumePercent)) / 100;
      const gain = normalized * normalized;
      gainNodeRef.current.gain.setTargetAtTime(gain, gainNodeRef.current.context.currentTime, 0.015);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) wsRef.current.close();
      if (audioCtxRef.current) audioCtxRef.current.close();
    };
  }, []);

  return { ...state, tune, stop, setVolume };
}
