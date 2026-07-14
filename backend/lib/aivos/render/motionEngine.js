/**
 * Motion Engine – produces ffmpeg filter strings for cinematic motion effects.
 * Each effect returns an object with { effect, filters, ffmpegArgs }.
 */

const EFFECTS = {
  /** Simple fade-in and fade-out. */
  fade({ duration = 1, fps = 25 } = {}) {
    const frames = Math.round(duration * fps);
    return [`fade=t=in:st=0:d=${duration}:alpha=1`];
  },

  /** Slow zoom-in (digital zoom pan). */
  zoom({ scale = 1.1, fps = 25 } = {}) {
    const increment = (scale - 1) / (5 * fps); // reach scale over 5 s
    return [`zoompan=z='min(zoom+${increment.toFixed(6)},${scale})':d=${5 * fps}:s=hd1080`];
  },

  /** Ken Burns – slow zoom + gentle pan across the frame. */
  kenburns({ scale = 1.15, duration = 6, fps = 25 } = {}) {
    const d = Math.round(duration * fps);
    return [
      `zoompan=z='min(max(zoom,1),${scale})':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${d}:s=1280x720:fps=${fps}`,
    ];
  },

  /** Horizontal pan. */
  pan({ direction = 'right', speed = 10 } = {}) {
    const x =
      direction === 'right'
        ? `'min(iw*t/${speed},iw-ow)'`
        : direction === 'left'
        ? `'max(iw-iw*t/${speed},0)'`
        : '0';
    return [`crop=iw:ih:${x}:0`];
  },

  /** Slow push-in (scale up over time). */
  pushin({ from = 1.0, to = 1.05, duration = 5, fps = 25 } = {}) {
    const d = Math.round(duration * fps);
    const step = ((to - from) / d).toFixed(6);
    return [`zoompan=z='min(zoom+${step},${to})':d=${d}:s=hd1080`];
  },
};

export function createMotionEngine(deps = {}) {
  /**
   * Apply an effect by name.
   * @returns {{ effect: string, filters: string[], ffmpegArgs: string[] }}
   */
  function apply(effect, options = {}) {
    const fn = EFFECTS[effect];
    if (!fn) {
      return { effect: 'none', filters: [], ffmpegArgs: [] };
    }
    const filters = fn(options);
    return { effect, filters, ffmpegArgs: filters.length ? ['-vf', filters.join(',')] : [] };
  }

  /** List supported effects. */
  function list() {
    return Object.keys(EFFECTS);
  }

  /**
   * Convenience: return raw ffmpegArgs for an effect.
   */
  function ffmpegArgs(effect, options = {}) {
    return apply(effect, options).ffmpegArgs;
  }

  return { apply, list, ffmpegArgs };
}

export default createMotionEngine;
