import { useEffect, useState } from 'react';

let shared: AudioContext | null = null;
let resumeHooked = false;

export function audioContext(): AudioContext {
  shared ??= new AudioContext();
  void shared.resume().catch(() => {});
  // A context created before the page has seen a gesture starts suspended and
  // resume() fails; retry it on the first click or key press.
  if (!resumeHooked) {
    resumeHooked = true;
    const resume = () => {
      void shared
        ?.resume()
        .then(() => {
          if (shared?.state !== 'running') return;
          window.removeEventListener('pointerdown', resume);
          window.removeEventListener('keydown', resume);
        })
        .catch(() => {});
    };
    window.addEventListener('pointerdown', resume);
    window.addEventListener('keydown', resume);
  }
  return shared;
}

const SPEAKING_RMS = 0.035;
const POLL_MS = 150;

/** Whether the stream's audio is currently above a speaking threshold. */
export function useSpeaking(stream: MediaStream | null): boolean {
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    if (!stream || stream.getAudioTracks().length === 0) {
      setSpeaking(false);
      return;
    }
    let source: MediaStreamAudioSourceNode;
    let analyser: AnalyserNode;
    try {
      const ctx = audioContext();
      source = ctx.createMediaStreamSource(stream);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
    } catch (err) {
      console.warn('speaking indicator unavailable', err);
      return;
    }
    const samples = new Uint8Array(analyser.fftSize);
    let last = false;
    const timer = window.setInterval(() => {
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const v of samples) {
        const x = (v - 128) / 128;
        sum += x * x;
      }
      const now = Math.sqrt(sum / samples.length) > SPEAKING_RMS;
      if (now !== last) {
        last = now;
        setSpeaking(now);
      }
    }, POLL_MS);
    return () => {
      window.clearInterval(timer);
      source.disconnect();
    };
  }, [stream]);

  return speaking;
}
