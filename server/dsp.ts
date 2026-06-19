/**
 * DSP functions for demodulating raw IQ samples from rtl_sdr.
 * Implements the same pipeline as csdr but in TypeScript.
 *
 * Pipeline for FM:
 *   rtl_sdr (u8 IQ @ 240k) -> convert_u8_f -> fmdemod -> decimate 5:1 -> deemphasis -> s16 PCM @ 48k
 *
 * Pipeline for AM:
 *   rtl_sdr (u8 IQ @ 240k) -> convert_u8_f -> amdemod -> decimate 5:1 -> AGC -> s16 PCM @ 48k
 */

// State for FM demodulator (needs previous sample)
let prevI = 0;
let prevQ = 0;

// State for de-emphasis filter (single-pole IIR)
let deemphState = 0;

// State for AGC
let agcGain = 1.0;

export function resetState() {
  prevI = 0;
  prevQ = 0;
  deemphState = 0;
  agcGain = 1.0;
}

/**
 * Full FM demodulation pipeline:
 * Input: raw unsigned 8-bit IQ from rtl_sdr at 240kHz
 * Output: Buffer of signed 16-bit PCM at 48kHz
 */
export function demodFM(raw: Buffer): Buffer {
  const numIQ = Math.floor(raw.length / 2); // each IQ pair is 2 bytes
  if (numIQ < 2) return Buffer.alloc(0);

  // Convert U8 IQ to float and demodulate FM (quadrature demod)
  const demodulated = new Float32Array(numIQ);
  for (let i = 0; i < numIQ; i++) {
    const iSamp = (raw[i * 2] - 127.5) / 127.5;
    const qSamp = (raw[i * 2 + 1] - 127.5) / 127.5;

    // Quadrature FM demodulation: angle between consecutive IQ samples
    // demod = (i1*q0 - i0*q1) / (i0^2 + q0^2)
    const denom = prevI * prevI + prevQ * prevQ;
    if (denom > 0.00001) {
      demodulated[i] = (prevI * qSamp - iSamp * prevQ) / denom;
    } else {
      demodulated[i] = 0;
    }

    prevI = iSamp;
    prevQ = qSamp;
  }

  // Decimate 5:1 (240kHz -> 48kHz)
  const decimation = 5;
  const outLen = Math.floor(numIQ / decimation);
  const decimated = new Float32Array(outLen);

  // Simple averaging decimation (acts as a low-pass anti-alias filter)
  for (let i = 0; i < outLen; i++) {
    let sum = 0;
    const base = i * decimation;
    for (let j = 0; j < decimation; j++) {
      sum += demodulated[base + j];
    }
    decimated[i] = sum / decimation;
  }

  // De-emphasis filter (75µs for North America)
  // Single-pole IIR: y[n] = y[n-1] + alpha * (x[n] - y[n-1])
  // tau = 75e-6, fs = 48000, alpha = 1 / (1 + fs * tau) = 1 / (1 + 48000 * 75e-6) = 0.217
  const alpha = 0.217;
  for (let i = 0; i < outLen; i++) {
    deemphState = deemphState + alpha * (decimated[i] - deemphState);
    decimated[i] = deemphState;
  }

  // Convert to signed 16-bit PCM
  const output = Buffer.alloc(outLen * 2);
  for (let i = 0; i < outLen; i++) {
    // Clamp and scale (FM demod output is roughly -1 to 1 but can exceed)
    const sample = Math.max(-1, Math.min(1, decimated[i] * 5)); // gain factor
    output.writeInt16LE(Math.round(sample * 32000), i * 2);
  }

  return output;
}

/**
 * Full AM demodulation pipeline:
 * Input: raw unsigned 8-bit IQ from rtl_sdr at 240kHz
 * Output: Buffer of signed 16-bit PCM at 48kHz
 */
export function demodAM(raw: Buffer): Buffer {
  const numIQ = Math.floor(raw.length / 2);
  if (numIQ < 2) return Buffer.alloc(0);

  // Convert U8 IQ to float and AM demod (envelope detection = magnitude)
  const demodulated = new Float32Array(numIQ);
  for (let i = 0; i < numIQ; i++) {
    const iSamp = (raw[i * 2] - 127.5) / 127.5;
    const qSamp = (raw[i * 2 + 1] - 127.5) / 127.5;
    demodulated[i] = Math.sqrt(iSamp * iSamp + qSamp * qSamp);
  }

  // DC blocking filter (remove DC offset from AM envelope)
  let dcState = 0;
  for (let i = 0; i < numIQ; i++) {
    const x = demodulated[i];
    dcState = 0.999 * dcState + 0.001 * x;
    demodulated[i] = x - dcState;
  }

  // Decimate 5:1 (240kHz -> 48kHz)
  const decimation = 5;
  const outLen = Math.floor(numIQ / decimation);
  const decimated = new Float32Array(outLen);

  for (let i = 0; i < outLen; i++) {
    let sum = 0;
    const base = i * decimation;
    for (let j = 0; j < decimation; j++) {
      sum += demodulated[base + j];
    }
    decimated[i] = sum / decimation;
  }

  // AGC (automatic gain control)
  const agcRate = 0.001;
  const agcRef = 0.3;
  for (let i = 0; i < outLen; i++) {
    decimated[i] *= agcGain;
    const absVal = Math.abs(decimated[i]);
    if (absVal > agcRef) {
      agcGain -= agcRate * (absVal - agcRef);
    } else {
      agcGain += agcRate * (agcRef - absVal) * 0.1;
    }
    agcGain = Math.max(0.1, Math.min(100, agcGain));
  }

  // Convert to signed 16-bit PCM
  const output = Buffer.alloc(outLen * 2);
  for (let i = 0; i < outLen; i++) {
    const sample = Math.max(-1, Math.min(1, decimated[i]));
    output.writeInt16LE(Math.round(sample * 32000), i * 2);
  }

  return output;
}
