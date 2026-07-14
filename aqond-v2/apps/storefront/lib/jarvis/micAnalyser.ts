/** Microphone frequency levels for voice wave UI. */

export type MicAnalyserHandle = {
  stop: () => void;
  getLevels: (barCount: number) => number[];
};

export async function startMicAnalyser(): Promise<MicAnalyserHandle | null> {
  if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return null;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 128;
    analyser.smoothingTimeConstant = 0.72;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);

    return {
      stop: () => {
        stream.getTracks().forEach((t) => t.stop());
        void ctx.close();
      },
      getLevels: (barCount: number) => {
        analyser.getByteFrequencyData(data);
        const n = Math.max(4, barCount);
        const step = Math.max(1, Math.floor(data.length / n));
        const levels: number[] = [];
        for (let i = 0; i < n; i += 1) {
          let sum = 0;
          for (let j = 0; j < step; j += 1) sum += data[i * step + j] || 0;
          levels.push(Math.min(1, sum / step / 180));
        }
        return levels;
      },
    };
  } catch {
    return null;
  }
}
