declare module 'mpegts.js' {
  interface PlayerConfig {
    type: string;
    isLive?: boolean;
    url: string;
  }

  interface PlayerOptions {
    enableWorker?: boolean;
    liveBufferLatencyChasing?: boolean;
    liveBufferLatencyMaxLatency?: number;
    liveBufferLatencyMinRemain?: number;
  }

  interface Player {
    attachMediaElement(element: HTMLMediaElement): void;
    load(): void;
    play(): void;
    pause(): void;
    destroy(): void;
  }

  function isSupported(): boolean;
  function createPlayer(config: PlayerConfig, options?: PlayerOptions): Player;

  export default { isSupported, createPlayer };
}
