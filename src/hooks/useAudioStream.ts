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
      // Route through gain node for volume control
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

    try {
      // Tell the server to start tuning
      const res = await fetch('/api/tune', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frequency, mode }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to start SDR');
      }

      // Set up AudioContext with gain node
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new AudioContext({ sampleRate: 48000 });
      }
      if (audioCtxRef.current.state === 'suspended') {
        await audioCtxRef.current.resume();
      }

      // Create gain node for volume control
      if (!gainNodeRef.current || gainNodeRef.current.context !== audioCtxRef.current) {
        gainNodeRef.current = audioCtxRef.current.createGain();
        gainNodeRef.current.connect(audioCtxRef.current.destination);
      }

      nextTimeRef.current = 0;
      bufferQueueRef.current = [];

      // Connect WebSocket for audio data
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      const ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';

      ws.onopen = () => {
        setState({ isPlaying: true, isConnecting: false, error: null });
      };

      ws.onmessage = (event) => {
        if (!(event.data instanceof ArrayBuffer)) return;

        // rtl_fm outputs signed 16-bit little-endian PCM at 48kHz
        const int16 = new Int16Array(event.data);
        const float32 = new Float32Array(int16.length);
        for (let i = 0; i < int16.length; i++) {
          float32[i] = int16[i] / 32768;
        }

        bufferQueueRef.current.push(float32);

        // Limit queue to ~2 seconds of audio to prevent unbounded growth
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
    } catch (err: any) {
      setState({ isPlaying: false, isConnecting: false, error: err.message });
    }
  }, [processQueue]);

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

  /**
   * Set volume level. 0 = mute, 1 = full volume.
   * Accepts 0-100 range and normalizes internally.
   */
  const setVolume = useCallback((volumePercent: number) => {
    if (gainNodeRef.current) {
      // Convert 0-100 to 0-1, apply slight exponential curve for natural feel
      const normalized = Math.max(0, Math.min(100, volumePercent)) / 100;
      const gain = normalized * normalized; // quadratic curve
      gainNodeRef.current.gain.setTargetAtTime(gain, gainNodeRef.current.context.currentTime, 0.015);
    }
  }, []);

  return { ...state, start, stop, setVolume };
}
