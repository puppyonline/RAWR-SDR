import { useRef, useCallback, useState, useEffect } from 'react';

interface AudioStreamState {
  isPlaying: boolean;
  isConnecting: boolean;
  error: string | null;
}

/**
 * Streams PCM audio from the RTL-SDR backend over WebSocket.
 * 
 * Audio chain: BufferSource -> LowPassFilter (15kHz) -> GainNode -> Destination
 * 
 * The low-pass filter removes the 19kHz FM stereo pilot tone that rtl_fm
 * passes through when outputting at 48kHz.
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
  const filterRef = useRef<BiquadFilterNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const nextTimeRef = useRef(0);
  const bufferQueueRef = useRef<Float32Array[]>([]);
  const processingRef = useRef(false);
  const rdsCallbackRef = useRef<((data: any) => void) | null>(null);

  const processQueue = useCallback(() => {
    if (processingRef.current) return;
    processingRef.current = true;

    const ctx = audioCtxRef.current;
    const filter = filterRef.current;
    if (!ctx || !filter) {
      processingRef.current = false;
      return;
    }

    while (bufferQueueRef.current.length > 0) {
      const samples = bufferQueueRef.current.shift()!;
      const buffer = ctx.createBuffer(1, samples.length, 48000);
      buffer.getChannelData(0).set(samples);

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      // Route: source -> lowpass filter -> gain -> speakers
      source.connect(filter);

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

    const ctx = audioCtxRef.current;

    // Create gain node if needed — start at 50% to avoid hot output
    if (!gainNodeRef.current || gainNodeRef.current.context !== ctx) {
      gainNodeRef.current = ctx.createGain();
      gainNodeRef.current.gain.value = 0.5;

      // AnalyserNode for real spectrum/signal data
      analyserRef.current = ctx.createAnalyser();
      analyserRef.current.fftSize = 256; // 128 frequency bins
      analyserRef.current.smoothingTimeConstant = 0.7;

      // Chain: gain -> analyser -> destination
      gainNodeRef.current.connect(analyserRef.current);
      analyserRef.current.connect(ctx.destination);
    }

    // Pilot tone filter + slight smoothing
    // De-emphasis is handled server-side by rtl_fm -E deemp (proper 75µs IIR)
    if (!filterRef.current || filterRef.current.context !== ctx) {
      // Pilot tone removal at 14kHz
      const lpf1 = ctx.createBiquadFilter();
      lpf1.type = 'lowpass';
      lpf1.frequency.value = 14000;
      lpf1.Q.value = 0.54;

      const lpf2 = ctx.createBiquadFilter();
      lpf2.type = 'lowpass';
      lpf2.frequency.value = 14000;
      lpf2.Q.value = 1.31;

      lpf1.connect(lpf2);
      lpf2.connect(gainNodeRef.current);
      filterRef.current = lpf1;
    }
  }, []);

  const ensureWebSocket = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      return;
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
      if (!(event.data instanceof ArrayBuffer)) {
        // Text messages are RDS JSON updates
        try {
          const msg = JSON.parse(event.data as string);
          if (msg.type === 'rds' && rdsCallbackRef.current) {
            rdsCallbackRef.current(msg.data);
          }
        } catch { /* ignore non-JSON */ }
        return;
      }

      // Binary = PCM audio data
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
   * Tune to a frequency. Starts streaming if not already, or retunes live.
   */
  const tune = useCallback(async (frequency: number, mode: string) => {
    setState((prev) => ({ ...prev, isConnecting: true, error: null }));

    try {
      const res = await fetch('/api/tune', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frequency, mode }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Tune failed');
      }

      // Flush stale audio from previous frequency
      bufferQueueRef.current = [];
      nextTimeRef.current = 0;

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
      filterRef.current = null;
      analyserRef.current = null;
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

  const onRDS = useCallback((callback: (data: any) => void) => {
    rdsCallbackRef.current = callback;
  }, []);

  /** Get current FFT frequency data (0-255 values, 128 bins) */
  const getFrequencyData = useCallback((): Uint8Array => {
    if (analyserRef.current) {
      const data = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getByteFrequencyData(data);
      return data;
    }
    return new Uint8Array(128);
  }, []);

  /** Get signal strength as 0-100 based on RMS of frequency data */
  const getSignalLevel = useCallback((): number => {
    if (analyserRef.current) {
      const data = new Uint8Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i];
      const avg = sum / data.length;
      return Math.min(100, Math.round((avg / 255) * 150)); // scale up a bit
    }
    return 0;
  }, []);

  useEffect(() => {
    return () => {
      if (wsRef.current) wsRef.current.close();
      if (audioCtxRef.current) audioCtxRef.current.close();
    };
  }, []);

  return { ...state, tune, stop, setVolume, onRDS, getFrequencyData, getSignalLevel };
}
