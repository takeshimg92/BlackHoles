/**
 * Simulation selection: catalog browser with inline bar visualizations.
 *
 * Each numeric column shows a small horizontal bar proportional to
 * the value's position within the column's range, giving an instant
 * visual comparison across simulations.
 */

const COLUMNS = [
  { key: 'mass_ratio', label: 'q', tooltip: 'Mass ratio', fmt: v => v?.toFixed(3), color: '#4a7cff' },
  { key: 'eccentricity', label: 'e', tooltip: 'Eccentricity', fmt: v => v?.toExponential(1), color: '#44bbff' },
  { key: 'num_orbits', label: 'Orbits', tooltip: 'Number of orbits', fmt: v => v?.toFixed(1), color: '#66dd88' },
  { key: 'chi_eff', label: '\u03C7\u2091\u2092\u2092', tooltip: 'Effective spin', fmt: v => v?.toFixed(3), color: '#ff8844', signed: true },
];

export class CatalogBrowser {
  constructor(container, onSelect) {
    this.container = container;
    this.onSelect = onSelect;
    this.selectedId = null;
    this._simulations = [];
  }

  render(simulations) {
    this._simulations = simulations;
    this.container.innerHTML = '';

    // Compute column min/max for bar scaling
    const ranges = {};
    for (const col of COLUMNS) {
      let min = Infinity, max = -Infinity;
      for (const sim of simulations) {
        const v = sim[col.key];
        if (v != null && isFinite(v)) {
          if (col.signed) {
            // For signed values (chi_eff), scale by absolute value
            const abs = Math.abs(v);
            if (abs > max) max = abs;
          } else {
            if (v < min) min = v;
            if (v > max) max = v;
          }
        }
      }
      if (col.signed) {
        ranges[col.key] = { min: 0, max: max || 1 };
      } else {
        ranges[col.key] = { min: min === Infinity ? 0 : min, max: max === -Infinity ? 1 : max };
      }
    }

    // Header
    const header = document.createElement('div');
    header.className = 'cat-header';
    header.innerHTML = `<span class="cat-col cat-id-col">Simulation</span>` +
      COLUMNS.map(c =>
        `<span class="cat-col" title="${c.tooltip}">${c.label}</span>`
      ).join('');
    this.container.appendChild(header);

    // Rows
    for (const sim of simulations) {
      const row = document.createElement('div');
      row.className = 'cat-row';
      if (sim.sim_id === this.selectedId) row.classList.add('selected');

      let cells = `<span class="cat-col cat-id-col cat-sim-name">${sim.sim_id.replace('SXS:BBH:', '')}</span>`;

      for (const col of COLUMNS) {
        const v = sim[col.key];
        const text = v != null ? col.fmt(v) : '-';
        const range = ranges[col.key];
        const span = range.max - range.min || 1;

        let barFrac;
        if (col.signed) {
          barFrac = v != null ? Math.abs(v) / range.max : 0;
        } else {
          barFrac = v != null ? (v - range.min) / span : 0;
        }
        barFrac = Math.max(0, Math.min(1, barFrac));

        cells += `
          <span class="cat-col cat-bar-cell">
            <span class="cat-bar" style="width:${(barFrac * 100).toFixed(1)}%;background:${col.color}"></span>
            <span class="cat-val">${text}</span>
          </span>`;
      }

      row.innerHTML = cells;

      row.addEventListener('click', () => {
        this.selectedId = sim.sim_id;
        this.container.querySelectorAll('.cat-row').forEach(el =>
          el.classList.remove('selected')
        );
        row.classList.add('selected');
        if (this.onSelect) this.onSelect(sim.sim_id);
      });

      this.container.appendChild(row);
    }
  }

  setSelected(simId) {
    this.selectedId = simId;
  }
}
