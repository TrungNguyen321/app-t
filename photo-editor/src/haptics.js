// Light haptic "ticks" for sliders.
// Android/Chrome: navigator.vibrate. iOS Safari has no vibrate API; on iOS 18+ toggling a
// native <input type="checkbox" switch> via its <label> produces a system haptic tick.
let iosLabel = null, last = 0;

function iosTick() {
  if (!iosLabel) {
    const id = 'hapticSwitch';
    const inp = document.createElement('input');
    inp.type = 'checkbox'; inp.id = id; inp.setAttribute('switch', '');
    const lab = document.createElement('label');
    lab.htmlFor = id;
    for (const e of [inp, lab]) Object.assign(e.style, { position: 'fixed', left: '-100px', top: '0', width: '1px', height: '1px', opacity: '0', pointerEvents: 'none' });
    document.body.append(inp, lab);
    iosLabel = lab;
  }
  iosLabel.click();
}

const canVibrate = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
export let hapticsOn = true;
try { hapticsOn = localStorage.getItem('fre.haptics') !== '0'; } catch { /* ignore */ }
export function setHaptics(v) { hapticsOn = v; try { localStorage.setItem('fre.haptics', v ? '1' : '0'); } catch { /* ignore */ } }

/** strength: 'light' (minor tick) | 'strong' (major tick / zero detent) */
export function tick(strength = 'light') {
  if (!hapticsOn) return;
  const now = performance.now();
  if (now - last < (strength === 'strong' ? 25 : 45)) return;   // don't buzz continuously
  last = now;
  try {
    if (canVibrate) navigator.vibrate(strength === 'strong' ? 14 : 4);
    else iosTick();
  } catch { /* ignore */ }
}
