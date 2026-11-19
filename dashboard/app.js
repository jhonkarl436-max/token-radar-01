document.addEventListener('DOMContentLoaded', () => {
  const radar = window.RADAR;
  if (!radar) {
    console.error('window.RADAR not found');
    return;
  }

  // Populate Header Stats
  document.getElementById('header-as-of').textContent = radar.as_of;
  document.getElementById('header-source').textContent = radar.source;
  document.getElementById('stat-board').textContent = radar.board_size;
  document.getElementById('stat-watchlist').textContent = radar.watchlist_size;
  document.getElementById('stat-live').textContent = radar.live_size;
  document.getElementById('watchlist-count').textContent = radar.watchlist_size;

  let boardRows = radar.rows || [];
  let liveRows = radar.live || [];

  // Populate category and chain dropdown filters
  const categorySelect = document.getElementById('category-select');
  const chainSelect = document.getElementById('chain-select');

  const categories = Array.from(new Set(boardRows.map(r => r.category))).sort();
  categories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    categorySelect.appendChild(opt);
  });

  const chainsSet = new Set();
  boardRows.forEach(r => {
    if (Array.isArray(r.chains)) {
      r.chains.forEach(c => chainsSet.add(c));
    }
  });
  const chains = Array.from(chainsSet).sort();
  chains.forEach(ch => {
    const opt = document.createElement('option');
    opt.value = ch;
    opt.textContent = ch;
    chainSelect.appendChild(opt);
  });

  // Format currency helpers
  function formatUSD(num) {
    if (num >= 1e9) return '$' + (num / 1e9).toFixed(2) + 'B';
    if (num >= 1e6) return '$' + (num / 1e6).toFixed(2) + 'M';
    if (num >= 1e3) return '$' + (num / 1e3).toFixed(1) + 'K';
    return '$' + num.toLocaleString();
  }

  function formatPercent(num) {
    if (num === null || num === undefined || isNaN(num)) return 'n/a';
    const sign = num > 0 ? '+' : '';
    return `${sign}${num.toFixed(1)}%`;
  }

  function formatAge(age) {
    if (age === null || age === undefined || isNaN(age)) return 'n/a';
    return `${age}d`;
  }

  // Render Live Table
  const liveTbody = document.getElementById('live-tbody');
  liveRows.forEach(l => {
    const tr = document.createElement('tr');
    const ratio = l.tvl_usd > 0 ? (l.mcap_usd / l.tvl_usd).toFixed(2) : 'N/A';
    tr.innerHTML = `
      <td>
        <div class="proto-cell">
          <span class="proto-name">${l.name}</span>
          <span class="proto-slug">${l.slug}</span>
        </div>
      </td>
      <td>${l.category}</td>
      <td>${formatUSD(l.mcap_usd)}</td>
      <td>${formatUSD(l.tvl_usd)}</td>
      <td>${ratio}x</td>
    `;
    liveTbody.appendChild(tr);
  });

  let selectedSlug = null;

  function renderBoard(rowsToRender) {
    const tbody = document.getElementById('board-tbody');
    tbody.innerHTML = '';
    document.getElementById('visible-count').textContent = `Showing ${rowsToRender.length} rows`;

    if (rowsToRender.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="8" style="text-align: center; color: var(--text-secondary); padding: 2rem;">No protocols match the current filters.</td>`;
      tbody.appendChild(tr);
      return;
    }

    rowsToRender.forEach(r => {
      const tr = document.createElement('tr');
      if (r.slug === selectedSlug) {
        tr.classList.add('selected');
      }

      const watchlistBadge = r.in_watchlist ? '<span class="watchlist-badge">W</span>' : '';
      const growthClass = (r.change_7d !== null && r.change_7d > 0) ? 'positive' : ((r.change_7d !== null && r.change_7d < 0) ? 'negative' : '');

      tr.innerHTML = `
        <td>#${r.rank}</td>
        <td>
          <div class="proto-cell">
            <span class="proto-name">${r.name}${watchlistBadge}</span>
            <span class="proto-slug">${r.slug}</span>
          </div>
        </td>
        <td>${r.category}</td>
        <td>${Array.isArray(r.chains) && r.chains.length > 0 ? r.chains[0] : 'Multiple'}</td>
        <td>${formatUSD(r.tvl_usd)}</td>
        <td class="${growthClass}">${formatPercent(r.change_7d)}</td>
        <td>${formatAge(r.age)}</td>
        <td><strong>${formatUSD(r.implied_value_usd)}</strong></td>
      `;

      tr.addEventListener('click', () => {
        selectedSlug = r.slug;
        document.querySelectorAll('#board-tbody tr').forEach(row => row.classList.remove('selected'));
        tr.classList.add('selected');
        renderDetail(r);
      });

      tbody.appendChild(tr);
    });
  }

  function renderDetail(r) {
    const detailPanel = document.getElementById('detail-panel');
    const watchlistBadge = r.in_watchlist ? '<span class="watchlist-badge">Watchlist</span>' : '';

    let stepsHtml = '';
    if (Array.isArray(r.farm_steps) && r.farm_steps.length > 0) {
      stepsHtml = r.farm_steps.map((stepText, idx) => `
        <div class="step-item">
          <strong>Step ${idx + 1}:</strong> ${stepText}
        </div>
      `).join('');
    } else {
      stepsHtml = '<div class="step-item">No specific farm steps available.</div>';
    }

    detailPanel.innerHTML = `
      <h2>Protocol Detail</h2>
      <div class="detail-header">
        <div class="detail-title">
          <h3>${r.name} ${watchlistBadge}</h3>
          <span class="detail-subtitle">${r.slug} &bull; ${r.category}</span>
        </div>
      </div>
      <div class="detail-metrics">
        <div class="metric-box">
          <span class="label">Implied Value</span>
          <span class="value">${formatUSD(r.implied_value_usd)}</span>
        </div>
        <div class="metric-box">
          <span class="label">TVL</span>
          <span class="value">${formatUSD(r.tvl_usd)}</span>
        </div>
        <div class="metric-box">
          <span class="label">7d Growth</span>
          <span class="value ${r.change_7d !== null && r.change_7d > 0 ? 'positive' : (r.change_7d !== null && r.change_7d < 0 ? 'negative' : '')}">${formatPercent(r.change_7d)}</span>
        </div>
        <div class="metric-box">
          <span class="label">Protocol Age</span>
          <span class="value">${formatAge(r.age)}</span>
        </div>
      </div>
      <div class="detail-breakdown">
        <h4>Valuation Breakdown</h4>
        <div class="breakdown-list">
          <div class="breakdown-row">
            <span>Category Multiple</span>
            <span>${r.multiple ? r.multiple.toFixed(2) : 'N/A'}x</span>
          </div>
          <div class="breakdown-row">
            <span>Growth Multiplier</span>
            <span>${r.growth_mult ? r.growth_mult.toFixed(3) : 'N/A'}</span>
          </div>
          <div class="breakdown-row">
            <span>Maturity Multiplier</span>
            <span>${r.maturity_mult ? r.maturity_mult.toFixed(3) : 'N/A'}</span>
          </div>
          <div class="breakdown-row">
            <span>Chains</span>
            <span>${Array.isArray(r.chains) ? r.chains.join(', ') : 'None'}</span>
          </div>
        </div>
      </div>
      <div class="detail-steps">
        <h4>Farming Steps (${r.farm_steps ? r.farm_steps.length : 0})</h4>
        <div class="steps-list">
          ${stepsHtml}
        </div>
      </div>
    `;
  }

  // Filter and Sort logic
  function applyFilters() {
    const searchTerm = document.getElementById('search-input').value.toLowerCase().trim();
    const selectedCategory = document.getElementById('category-select').value;
    const selectedChain = document.getElementById('chain-select').value;
    const minTvl = parseFloat(document.getElementById('min-tvl-select').value) || 0;
    const watchlistOnly = document.getElementById('watchlist-checkbox').checked;
    const sortBy = document.getElementById('sort-select').value;

    let filtered = boardRows.filter(r => {
      if (searchTerm && !r.name.toLowerCase().includes(searchTerm) && !r.slug.toLowerCase().includes(searchTerm)) {
        return false;
      }
      if (selectedCategory && r.category !== selectedCategory) {
        return false;
      }
      if (selectedChain && (!Array.isArray(r.chains) || !r.chains.includes(selectedChain))) {
        return false;
      }
      if (r.tvl_usd < minTvl) {
        return false;
      }
      if (watchlistOnly && !r.in_watchlist) {
        return false;
      }
      return true;
    });

    // Sorting
    filtered.sort((a, b) => {
      if (sortBy === 'rank') {
        return a.rank - b.rank;
      } else if (sortBy === 'tvl-desc') {
        return b.tvl_usd - a.tvl_usd;
      } else if (sortBy === 'growth-desc') {
        const ga = a.change_7d ?? -999;
        const gb = b.change_7d ?? -999;
        return gb - ga;
      } else if (sortBy === 'age-desc') {
        const aa = a.age ?? -1;
        const ab = b.age ?? -1;
        return ab - aa;
      } else if (sortBy === 'slug-asc') {
        return a.slug.localeCompare(b.slug);
      }
      return a.rank - b.rank;
    });

    renderBoard(filtered);
  }

  // Attach event listeners to controls
  document.getElementById('search-input').addEventListener('input', applyFilters);
  document.getElementById('category-select').addEventListener('change', applyFilters);
  document.getElementById('chain-select').addEventListener('change', applyFilters);
  document.getElementById('min-tvl-select').addEventListener('change', applyFilters);
  document.getElementById('watchlist-checkbox').addEventListener('change', applyFilters);
  document.getElementById('sort-select').addEventListener('change', applyFilters);

  // Initial render
  renderBoard(boardRows);
});
