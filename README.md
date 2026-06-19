# RAWR-SDR

A web-based software-defined radio interface for RTL-SDR dongles. Tune into FM, AM, ATC, HD Radio, and track aircraft via ADS-B — all from a clean, modern glassmorphic UI.

## Features

- **FM Radio** — 87.5–108.0 MHz with presets, spectrum visualizer, and signal meter
- **AM Radio** — 530–1700 kHz broadcast band
- **ATC Scanner** — 118–137 MHz aviation band with common frequencies and squelch control
- **HD Radio** — Digital HD subchannel selection (HD1–HD4) with now-playing metadata
- **ADS-B Tracker** — 1090 MHz Mode-S transponder decoding with aircraft table and map

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- RTL-SDR drivers and tools installed (`rtl_fm`, `dump1090` in your PATH)
  - Windows: [rtl-sdr releases](https://ftp.osmocom.org/binaries/windows/rtl-sdr/)
  - dump1090: [dump1090-win](https://github.com/MalcolmRobb/dump1090)

## Getting Started

```bash
# Install dependencies
npm install

# Start dev server (frontend + backend)
npm run dev
```

The frontend runs on `http://localhost:3000` and proxies API/WebSocket requests to the backend on port 3001.

## Production Build

```bash
npm run build
npm start
```

## Tech Stack

- **Frontend:** React, TypeScript, Vite, Tailwind CSS, React Router
- **Backend:** Node.js, Express, WebSocket (ws)
- **SDR Integration:** rtl_fm / dump1090 spawned as child processes

## License

MIT
