// app.js  — JSONL loader + adapter, preserving your existing UI & styles
// Keeps your table / filters exactly as-is.

// Removed: import { benchmarkData } from './data.js';
import { filterAndSortData, FACETS } from './logic.js?v=6';
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
  setActiveSort,
  rerenderOpenCards
} from './ui.js?v=6';

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
// "Natural Language Processing" is tagged on ~79% of cards, so as a Domain it
// carries no signal and clutters every card / the Domain filter. Drop it.
const DOMAIN_DENYLIST = new Set(['natural language processing', 'nlp']);

function adaptCard(r) {
  const domains = (Array.isArray(r.domains) ? r.domains : [])
    .filter(d => d && !DOMAIN_DENYLIST.has(String(d).trim().toLowerCase()));
  const tasks = Array.isArray(r.tasks) ? r.tasks : [];
  const atlasRisks = Array.isArray(r.atlas_risks) ? r.atlas_risks : [];
  const risks = Array.isArray(r.risk_categories) && r.risk_categories.length
    ? r.risk_categories
    : atlasRisks.map(x => x && x.category).filter(Boolean);
  const audience = Array.isArray(r.audience) ? r.audience : [];
  const languages = Array.isArray(r.languages) ? r.languages : [];
  // documentation completeness: same 4 card fields used by the dashboard.
  // slim index ships a `has_overview` boolean instead of the full text
  const hasOverview = (r.has_overview != null) ? !!r.has_overview : !!r.overview;
  const docPresent = [
    hasOverview,
    languages.length,
    r.size_category || r.size_text,
    r.modality,
  ].filter(Boolean).length;

  return {
    // stable id used to merge in the lazily-loaded detail text
    _id: r.id || (r.arxiv_id ? r.arxiv_id : ('name:' + (r.name || ''))),
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

async function loadJSON(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`);
  return res.json();
}

// True when the loaded data still needs its heavy detail text merged in
// (i.e. we loaded the slim index). False when a full source was used.
let detailsNeeded = false;

// Perf: load a slim index first (≈46% smaller) so the table is interactive
// sooner; the heavy card text (overview/goal/source/annotation) is merged in
// afterwards by loadDetails(). Falls back to the full JSONL if the slim index
// is unavailable, so the app always works.
async function loadDataEither() {
  try {
    const slim = await loadJSON('cards.min.json?v=6');
    if (Array.isArray(slim) && slim.length) { detailsNeeded = true; return slim.map(adaptCard); }
  } catch (e) {
    console.warn('slim index unavailable, falling back to full cards', e);
  }
  detailsNeeded = false;
  for (const path of ['benchmark_cards_cleaned.jsonl', 'benchmark_cards.jsonl']) {
    try {
      const raw = await loadJSONL(path);
      if (raw.length) return raw.map(adaptCard);
    } catch (e) {
      console.warn(`cards load failed for ${path}`, e);
    }
  }
  console.warn('BenchmarkCards load failed — falling back to bundled sample data');
  const { benchmarkData } = await import('./data.js?v=6');
  return benchmarkData;
}

// Merge the heavy detail text into the already-rendered records, then refresh
// any card the user has already expanded. Runs off the critical path.
async function loadDetails(records) {
  try {
    const det = await loadJSON('cards.details.json?v=6');
    const byId = new Map(records.map(r => [r._id, r]));
    for (const id in det) {
      const r = byId.get(id);
      if (!r) continue;
      const h = det[id];
      r.overview = h.overview || ''; r.goal = h.goal || '';
      r.dataSource = h.data_source || ''; r.annotation = h.annotation || '';
      r.limitations = h.limitations || ''; r.format = h.format || '';
    }
    detailsNeeded = false;
    rerenderOpenCards();   // fill in any card already open
  } catch (e) {
    console.warn('detail text load failed; cards show summary fields only', e);
  }
}

/* =========================
   APP BOOTSTRAP (unchanged)
   ========================= */

(function main(){
  const state = { allData: [], filteredData: [] };

  const $ = (id) => document.getElementById(id);
  const on = (el, evt, fn) => el && el.addEventListener(evt, fn);
  const debounce = (fn, ms=200) => { let t; return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args),ms); }; };

  // Analytics: fire a GA4 event if analytics is present (no-op otherwise).
  const track = (name, params={}) => {
    try { if (typeof window.gtag === 'function') window.gtag('event', name, params); } catch (_) {}
  };
  const trackSearch = debounce((term) => { if (term) track('search', { search_term: term }); }, 1000);

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

      // Perf: pull the heavy card text in the background once the table is up.
      if (detailsNeeded) {
        const kick = () => loadDetails(state.allData);
        if ('requestIdleCallback' in window) requestIdleCallback(kick, { timeout: 2500 });
        else setTimeout(kick, 300);
      }

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
        if (sel.length >= 1) { openComparison(sel); track('compare', { count: sel.length }); }
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
    on($('searchInput'), 'input', debounce((e)=>{ showLoadingState(); recompute(); trackSearch(($('searchInput')?.value || '').trim()); }, 150));
    ['searchName','searchTasks','searchDescription','searchDomains','searchRisks','searchAudience']
      .forEach(id => on($(id), 'change', ()=>{ showLoadingState(); recompute(); }));

    // Facets (ids come from FACETS — single source of truth)
    FACETS.forEach(facet => on($(facet.sel), 'change', ()=>{
      showLoadingState(); recompute();
      const v = $(facet.sel)?.value;
      if (v) track('filter', { filter_name: facet.key, filter_value: v });
    }));

    // Sort dropdown -> shared sort state (kept in sync with header clicks)
    on($('sortSelect'), 'change', ()=>{ setActiveSort($('sortSelect').value); showLoadingState(); recompute(); track('sort', { sort_by: $('sortSelect').value }); });

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
        const fmt = btn.getAttribute('data-export');
        exportResults(state.filteredData, fmt);
        exportDropdown.classList.remove('open');
        track('export', { format: fmt, count: state.filteredData.length });
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

    // Outbound link clicks (Paper / GitHub / HF / Homepage)
    document.addEventListener('click', (e) => {
      const a = e.target.closest && e.target.closest('a[href^="http"]');
      if (!a) return;
      let host = '';
      try { host = new URL(a.href).hostname; } catch (_) {}
      track('outbound_click', { link_url: a.href, link_domain: host });
    });

    // Keyboard shortcut to focus search
    document.addEventListener('keydown', (e) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault(); $('searchInput')?.focus();
      }
    });
  });
})();
