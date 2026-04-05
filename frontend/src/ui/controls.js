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

export function setupTimeSlider(onTimeChange, onDragStart, onDragEnd) {
  const slider = document.getElementById('time-slider');
  const display = document.getElementById('time-display');
  let userDragging = false;

  slider.addEventListener('pointerdown', () => {
    userDragging = true;
    if (onDragStart) onDragStart();
  });

  function endDrag() {
    if (!userDragging) return;
    userDragging = false;
    if (onDragEnd) onDragEnd(parseFloat(slider.value));
  }

  // Listen on window so we catch release even if pointer leaves the slider
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);

  slider.addEventListener('input', () => {
    const fraction = parseFloat(slider.value);
    if (onTimeChange) onTimeChange(fraction);
  });

  return {
    setValue(fraction, timeValue) {
      if (!userDragging) {
        slider.value = fraction;
      }
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

export function setupCarousel() {
  const slides = document.querySelectorAll('.carousel-slide');
  const dots = document.querySelectorAll('.carousel-dots .dot');
  const prevBtn = document.querySelector('.carousel-prev');
  const nextBtn = document.querySelector('.carousel-next');

  function showSlide(name) {
    slides.forEach(s => s.classList.toggle('active', s.dataset.slide === name));
    dots.forEach(d => d.classList.toggle('active', d.dataset.slide === name));
  }

  function currentIndex() {
    return [...slides].findIndex(s => s.classList.contains('active'));
  }

  prevBtn.addEventListener('click', () => {
    const i = (currentIndex() - 1 + slides.length) % slides.length;
    showSlide(slides[i].dataset.slide);
  });

  nextBtn.addEventListener('click', () => {
    const i = (currentIndex() + 1) % slides.length;
    showSlide(slides[i].dataset.slide);
  });

  dots.forEach(dot => {
    dot.addEventListener('click', () => showSlide(dot.dataset.slide));
  });
}

export function setupMeshBrightness(onChange) {
  const slider = document.getElementById('mesh-brightness-slider');
  slider.addEventListener('input', () => {
    if (onChange) onChange(parseFloat(slider.value));
  });
  onChange(parseFloat(slider.value));
}

export function setupMeshResolution(onChange) {
  const slider = document.getElementById('mesh-resolution-slider');
  // Only fire on release (change), not on every drag movement,
  // because rebuilding the mesh geometry is expensive.
  slider.addEventListener('change', () => {
    if (onChange) onChange(parseInt(slider.value));
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
  // Don't fire initial value — loadSimulation already fetches audio
  // at the correct duration, and firing here races with it.
}

export function updateInfoBar(metadata) {
  const title = document.getElementById('sim-title');
  const params = document.getElementById('sim-params');

  title.textContent = metadata.sim_id;

  const items = [
    { label: 'Mass ratio (q)', value: metadata.mass_ratio?.toFixed(2), tooltip: 'Ratio m\u2081/m\u2082 of the heavier to lighter black hole' },
    { label: 'Eccentricity (e)', value: metadata.eccentricity?.toFixed(5), tooltip: 'Orbital eccentricity at reference time (0 = circular)' },
    { label: 'Orbits', value: metadata.num_orbits?.toFixed(1), tooltip: 'Number of orbits from reference time to merger' },
    { label: 'Effective spin (\u03C7<sub>eff</sub>)', value: metadata.chi_eff?.toFixed(4), tooltip: 'Mass-weighted projection of spins onto the orbital angular momentum' },
  ];

  params.innerHTML = items
    .filter(i => i.value != null)
    .map(i => {
      return `<span class="param"><span class="param-label">${i.label}:</span><span class="param-value">${i.value}</span><span class="param-tooltip" title="${i.tooltip}">?</span></span>`;
    })
    .join('');
}
