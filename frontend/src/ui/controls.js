/**
 * UI controls: tabs, time slider, play/pause, toggles.
 */

export function setupTabs(onTabChange) {
  const tabs = document.querySelectorAll('.tab');
  const panels = document.querySelectorAll('.panel');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;

      tabs.forEach(t => t.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));

      tab.classList.add('active');
      document.getElementById(`panel-${target}`).classList.add('active');

      if (onTabChange) onTabChange(target);
    });
  });
}

export function setupTimeSlider(onTimeChange) {
  const slider = document.getElementById('time-slider');
  const display = document.getElementById('time-display');

  slider.addEventListener('input', () => {
    const fraction = parseFloat(slider.value);
    if (onTimeChange) onTimeChange(fraction);
  });

  return {
    setValue(fraction, timeValue) {
      slider.value = fraction;
      display.textContent = `t = ${timeValue.toFixed(1)} M`;
    },
  };
}

export function setupPlayButton(onToggle) {
  const btn = document.getElementById('play-btn');
  let playing = false;

  btn.addEventListener('click', () => {
    playing = !playing;
    btn.innerHTML = playing ? '&#9646;&#9646;' : '&#9654;';
    if (onToggle) onToggle(playing);
  });

  return {
    setPlaying(state) {
      playing = state;
      btn.innerHTML = playing ? '&#9646;&#9646;' : '&#9654;';
    },
  };
}

export function setupMeshToggle(onChange) {
  const checkbox = document.getElementById('mesh-checkbox');
  checkbox.addEventListener('change', () => {
    if (onChange) onChange(checkbox.checked);
  });
}

export function setupSoundToggle(onChange) {
  const checkbox = document.getElementById('sound-checkbox');
  checkbox.addEventListener('change', () => {
    if (onChange) onChange(checkbox.checked);
  });
}

export function setupTrailToggle(onChange) {
  const checkbox = document.getElementById('trail-checkbox');
  checkbox.addEventListener('change', () => {
    if (onChange) onChange(checkbox.checked);
  });
}

export function setupLensingSlider(onChange) {
  const slider = document.getElementById('lensing-slider');
  slider.addEventListener('input', () => {
    if (onChange) onChange(parseFloat(slider.value));
  });
  // Fire initial value
  onChange(parseFloat(slider.value));
}

export function setupCameraReset(onReset) {
  const btn = document.getElementById('reset-cam-btn');
  btn.addEventListener('click', () => {
    if (onReset) onReset();
  });
}

export function setupSpeedControl(onChange) {
  const select = document.getElementById('speed-select');
  select.addEventListener('change', () => {
    const seconds = parseFloat(select.value);
    if (onChange) onChange(seconds);
  });
  // Fire initial value
  onChange(parseFloat(select.value));
}

export function updateInfoBar(metadata) {
  const title = document.getElementById('sim-title');
  const params = document.getElementById('sim-params');

  title.textContent = metadata.sim_id;

  const items = [
    { label: 'q', value: metadata.mass_ratio?.toFixed(4), tooltip: 'Mass ratio m\u2081/m\u2082 (larger mass over smaller)' },
    { label: 'e', value: metadata.eccentricity?.toFixed(5), tooltip: 'Orbital eccentricity at reference time (0 = circular)' },
    { label: 'orbits', value: metadata.num_orbits?.toFixed(1), tooltip: 'Number of orbits from reference time to merger' },
    { label: '\u03C7', labelSub: 'eff', value: metadata.chi_eff?.toFixed(4), tooltip: 'Effective spin: mass-weighted projection of spins onto the orbital angular momentum' },
  ];

  params.innerHTML = items
    .filter(i => i.value != null)
    .map(i => {
      const labelHtml = i.labelSub
        ? `${i.label}<sub>${i.labelSub}</sub>`
        : i.label;
      return `<span class="param"><span class="param-label">${labelHtml}:</span><span class="param-value">${i.value}</span><span class="param-tooltip" title="${i.tooltip}">?</span></span>`;
    })
    .join('');
}
