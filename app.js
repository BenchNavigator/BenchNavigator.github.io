// app.js  — JSONL loader + adapter, preserving your existing UI & styles
// Keeps your table / filters exactly as-is.

// Removed: import { benchmarkData } from './data.js';
import { filterAndSortData, FACETS } from './logic.js?v=2';
import {
  refreshFacets,
  getFilterValues,
  renderTable,
  renderMore,
  renderActiveChips,
  applyStateFromURL,
  updateURLFromState,
  showLoadingState,
  hideLoadingState,
  resetFilters,
  wireTagClicks,
  initTheme,
  toggleTheme,
  exportResults,
  initTableInteractions,
  getSelected,
  clearSelection,
  openComparison,
  initHeaderSort,
  setActiveSort
} from './ui.js?v=2';

/* =========================
   JSONL LOADING + ADAPTER
   ========================= */

// Fetch and parse JSONL into array of objects
async function loadJSONL(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`);
  const text = await res.text();
  const items = [];
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    try { items.push(JSON.parse(t)); } catch { /* skip bad line */ }
  }
  return items;
}

// Adapt one real BenchmarkCard (from build_cards.py) into the UI schema. These
// records carry the REAL domains / tasks / audience / AI-risk facets, which is
// what makes the faceted filters work instead of collapsing to zero.
function adaptCard(r) {
  const domains = Array.isArray(r.domains) ? r.domains : [];
  const tasks = Array.isArray(r.tasks) ? r.tasks : [];
  const atlasRisks = Array.isArray(r.atlas_risks) ? r.atlas_risks : [];
  const risks = Array.isArray(r.risk_categories) && r.risk_categories.length
    ? r.risk_categories
    : atlasRisks.map(x => x && x.category).filter(Boolean);
  const audience = Array.isArray(r.audience) ? r.audience : [];
  const languages = Array.isArray(r.languages) ? r.languages : [];
  // documentation completeness: same 4 card fields used by the dashboard.
  const docPresent = [
    r.overview,
    languages.length,
    r.size_category || r.size_text,
    r.modality,
  ].filter(Boolean).length;

  return {
    name: r.name || 'Untitled',
    repo_id: r.arxiv_id ? `arXiv:${r.arxiv_id}` : '',
    data_type: r.primary_task || tasks[0] || 'N/A',
    domains, tasks, risks, audience,
    overview: r.overview || '',
    github: r.github || '', huggingface: r.huggingface || '', paper: r.paper || '', homepage: r.homepage || '',
    card: '',
    validation: '',
    size: '',                 // freeform size string lives in the card, not the column
    sizeRank: -1,
    docPresent, docTotal: 4,
    oss: !!(r.paper || r.github || r.huggingface || r.homepage),
    quality: r._quality || null,
    languages,
    sourceUrls: Array.isArray(r.resources) ? r.resources : [],
    keywords: [],
    language: r.primary_language || 'N/A',
    license: 'N/A',
    year: null,
    modality: r.modality || 'text',
    citations: null,
    // facets added for the Figure 3 filter set
    sizeCategory: r.size_category || '',
    dataType: r.data_type_category || '',
    annotationMethod: r.annotation_method || '',
    // rich card extras consumed by renderCard + comparison
    goal: r.goal || '', dataSource: r.data_source || '', annotation: r.annotation || '',
    methods: Array.isArray(r.methods) ? r.methods : [],
    metrics: Array.isArray(r.metrics) ? r.metrics : [],
    limitations: r.limitations || '', sizeText: r.size_text || '', format: r.format || '',
    atlasRisks,
    similar: Array.isArray(r.similar_benchmarks) ? r.similar_benchmarks : [],
    reviewStatus: r._quality && r._quality.review_status ? r._quality.review_status.replace(/_/g, ' ') : 'N/A',
  };
}

// Prefer audited BenchmarkCards; then raw BenchmarkCards; then legacy fallbacks.
async function loadDataEither() {
  for (const path of ['benchmark_cards_cleaned.jsonl', 'benchmark_cards.jsonl']) {
    try {
      const raw = await loadJSONL(path);
      if (raw.length) return raw.map(adaptCard);
    } catch (e) {
      console.warn(`cards load failed for ${path}`, e);
    }
  }
  console.warn('BenchmarkCards load failed — falling back to bundled sample data');
  const { benchmarkData } = await import('./data.js?v=2');
  return benchmarkData;
}

/* =========================
   APP BOOTSTRAP (unchanged)
   ========================= */

(function main(){
  const state = { allData: [], filteredData: [] };

  const $ = (id) => document.getElementById(id);
  const on = (el, evt, fn) => el && el.addEventListener(evt, fn);
  const debounce = (fn, ms=200) => { let t; return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args),ms); }; };

  const recompute = () => {
    const filters = getFilterValues();
    const results = filterAndSortData(state.allData, filters);
    state.filteredData = results;
    renderTable(results);
    refreshFacets(state.allData, filters);          // dependent (cascading) filter options
    renderActiveChips(filters);
    updateURLFromState(filters);
    hideLoadingState(results.length);
  };

  document.addEventListener('DOMContentLoaded', async () => {
    initTheme();                                    // :contentReference[oaicite:11]{index=11}

    showLoadingState();                             // :contentReference[oaicite:12]{index=12}
    try {
      state.allData = await loadDataEither();
      // Expose for debugging
      window.__BENCH_DATA__ = state.allData;
      const heroCount = $('heroCount');
      if (heroCount && state.allData.length) {
        heroCount.textContent = state.allData.length.toLocaleString();
      }
      refreshFacets(state.allData, getFilterValues());   // initial facet options
      applyStateFromURL();
      recompute();

      // Row expand (documentation card) + compare-checkbox selection
      const compareBtn = $('compareBtn');
      const clearSelBtn = $('clearSelBtn');
      const selectedCount = $('selectedCount');
      const onSel = (n) => {
        if (compareBtn) compareBtn.disabled = n < 1;
        if (clearSelBtn) clearSelBtn.hidden = n < 1;
        if (selectedCount) selectedCount.textContent = `${n} selected`;
      };
      initTableInteractions(onSel);
      initHeaderSort(() => { showLoadingState(); recompute(); });   // click column headers to sort
      on(compareBtn, 'click', () => {
        const sel = getSelected();
        if (sel.length >= 1) openComparison(sel);
      });
      on(clearSelBtn, 'click', () => clearSelection());
      on($('showMoreBtn'), 'click', () => renderMore());

      // Filter panel header toggles (paper Figure 3)
      on($('toggleAdvanced'), 'click', (e) => {
        const panel = $('advancedPanel');
        const open = panel.hidden;
        panel.hidden = !open;
        e.currentTarget.setAttribute('aria-expanded', String(open));
        e.currentTarget.textContent = open ? 'Hide Advanced Filters' : 'Show Advanced Filters';
      });
      on($('toggleColumns'), 'click', (e) => {
        const tbl = document.querySelector('.results-table');
        const on_ = tbl.classList.toggle('show-extra');
        e.currentTarget.setAttribute('aria-pressed', String(on_));
        e.currentTarget.textContent = on_ ? 'Hide Extra Columns' : 'Show Extra Columns';
      });
    } catch (err) {
      console.error(err);
      hideLoadingState(0);
      // Reliability: show a clear, distinct message instead of the generic
      // "no benchmarks match your filters" empty state when data fails to load.
      const empty = $('emptyState');
      const content = empty && empty.querySelector('.empty-state-content');
      if (content) {
        content.innerHTML =
          '<i class="fa-solid fa-triangle-exclamation empty-icon"></i>' +
          '<h3>Couldn’t load the benchmark data</h3>' +
          '<p>This is usually a temporary network issue. Please refresh the page; ' +
          'if it keeps happening, check your connection.</p>' +
          '<p><button id="reloadBtn" class="btn">Reload</button></p>';
        // CSP-safe: attach handler in JS instead of an inline onclick.
        on($('reloadBtn'), 'click', () => location.reload());
      }
    }

    // Search + scope
    on($('searchInput'), 'input', debounce(()=>{ showLoadingState(); recompute(); }, 150));
    ['searchName','searchTasks','searchDescription','searchDomains','searchRisks','searchAudience']
      .forEach(id => on($(id), 'change', ()=>{ showLoadingState(); recompute(); }));

    // Facets (ids come from FACETS — single source of truth)
    FACETS.forEach(facet => on($(facet.sel), 'change', ()=>{ showLoadingState(); recompute(); }));

    // Sort dropdown -> shared sort state (kept in sync with header clicks)
    on($('sortSelect'), 'change', ()=>{ setActiveSort($('sortSelect').value); showLoadingState(); recompute(); });

    // Reset
    const doReset = () => {
      resetFilters();
      showLoadingState();
      recompute();
      $('searchInput')?.focus();
    };
    on($('resetBtn'), 'click', doReset);
    on($('clearEmptyFiltersBtn'), 'click', doReset);

    // Theme
    on($('themeToggle'), 'click', toggleTheme);

    // Export (one-click JSON / CSV / Markdown of current filtered results)
    const exportDropdown = $('exportDropdown');
    on($('exportBtn'), 'click', (e) => {
      e.stopPropagation();
      exportDropdown?.classList.toggle('open');
    });
    exportDropdown?.querySelectorAll('[data-export]').forEach(btn =>
      on(btn, 'click', () => {
        exportResults(state.filteredData, btn.getAttribute('data-export'));
        exportDropdown.classList.remove('open');
      }));
    document.addEventListener('click', (e) => {
      if (exportDropdown && !exportDropdown.contains(e.target)) exportDropdown.classList.remove('open');
    });

    // Tag chips -> filters
    wireTagClicks((type, value) => {
      if (!type){ showLoadingState(); return recompute(); }
      const map = { domain: 'domainFilter', risk: 'riskFilter', audience: 'audienceFilter', task: 'taskFilter', metric: 'metricFilter', method: 'methodFilter' };
      const selId = map[type];
      if (selId && $(selId)) { $(selId).value = value || ''; }
      showLoadingState();
      recompute();
    });

    // Keyboard shortcut to focus search
    document.addEventListener('keydown', (e) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault(); $('searchInput')?.focus();
      }
    });
  });
})();
