// ----- UI helpers -----
import { recordsMatchingExcept, FACETS, parseSort } from './logic.js?v=6';

function $(id){ return document.getElementById(id); }

// Number of <td> columns in a data row (keep in sync with index.html thead).
const TABLE_COLS = 12;
const PAGE_SIZE = 50;                  // render in pages so 4,680 rows stay fast

// Module state for expand/compare interactions
let lastRendered = [];                 // full filtered list
let shownCount = PAGE_SIZE;            // how many of it are currently rendered
const selected = new Map();            // id -> benchmark (for comparison)
let onSelectionChange = null;          // callback(count)

function benchId(b){ return b.repo_id || b.name || ''; }

// ---- sort state (shared by the dropdown + clickable column headers) ----
let activeSort = 'name-asc';
export function getActiveSort(){ return activeSort; }
export function setActiveSort(s){ activeSort = s || 'name-asc'; updateSortIndicators(); }

function updateSortIndicators(){
  const { key, dir } = parseSort(activeSort);
  document.querySelectorAll('.results-table thead th[data-sort]').forEach(th => {
    const on = th.dataset.sort === key;
    th.classList.toggle('sort-asc', on && dir === 'asc');
    th.classList.toggle('sort-desc', on && dir === 'desc');
    th.setAttribute('aria-sort', on ? (dir === 'asc' ? 'ascending' : 'descending') : 'none');
  });
}

// Click a column header to sort by it; click again to reverse (paper-style table).
export function initHeaderSort(onChange){
  const thead = document.querySelector('.results-table thead');
  if (!thead) return;
  thead.addEventListener('click', (e) => {
    const th = e.target.closest('th[data-sort]');
    if (!th) return;
    const k = th.dataset.sort;
    const { key, dir } = parseSort(activeSort);
    activeSort = (k === key) ? `${k}-${dir === 'asc' ? 'desc' : 'asc'}` : `${k}-asc`;
    const sel = $('sortSelect');
    if (sel && [...sel.options].some(o => o.value === activeSort)) sel.value = activeSort;
    updateSortIndicators();
    if (onChange) onChange();
  });
  updateSortIndicators();
}

// minimal escaping so scraped names/overviews can't break markup
function esc(s){
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

export function populateSelect(id, options) {
  const select = $(id);
  if (!select) return;
  const first = select.querySelector('option')?.textContent || 'All';
  select.innerHTML = `<option value="">${first}</option>`;
  (options || []).forEach(opt => {
    if (opt === null || opt === undefined || opt === '') return;
    const o = document.createElement('option');
    o.value = opt; o.textContent = opt;
    select.appendChild(o);
  });
}

export function initializeFilters(data) {
  const domains = new Set(), types = new Set(), risks = new Set(), audiences = new Set();
  const modalities = new Set(), licenses = new Set(), languages = new Set();

  (data || []).forEach(item => {
    if (item.data_type) types.add(item.data_type);
    (item.domains || []).forEach(x => x && domains.add(x));
    (item.risks || []).forEach(x => x && risks.add(x));
    (item.audience || []).forEach(x => x && audiences.add(x));
    if (item.modality) modalities.add(item.modality);
    if (item.license) licenses.add(item.license);
    if (item.language) languages.add(item.language);
  });

  populateSelect('domainFilter',   Array.from(domains).sort());
  populateSelect('typeFilter',     Array.from(types).sort());
  populateSelect('riskFilter',     Array.from(risks).sort());
  populateSelect('audienceFilter', Array.from(audiences).sort());
  populateSelect('modalityFilter', Array.from(modalities).sort());
  populateSelect('licenseFilter',  Array.from(licenses).sort());
  populateSelect('languageFilter', Array.from(languages).sort());
}

// Repopulate a select, preserving its "All …" placeholder + current selection.
function populateSelectPreserve(id, options, current){
  const select = $(id);
  if (!select) return;
  const placeholder = select.querySelector('option')?.textContent || 'All';
  select.innerHTML = `<option value="">${placeholder}</option>`;
  options.forEach(opt => {
    if (opt == null || opt === '') return;
    const o = document.createElement('option');
    o.value = opt; o.textContent = opt;
    select.appendChild(o);
  });
  select.value = current || '';
}

// Dependent (cascading) facet options: each dropdown only offers values that
// still have matches given the OTHER active filters, so you can never pick a
// combination that returns zero. Facets with no available options are hidden.
const FACET_OPTION_CAP = 60;   // freeform card vocab is huge; show the most common

export function refreshFacets(allData, filters){
  FACETS.forEach(facet => {
    const subset = recordsMatchingExcept(allData, filters, facet.key);
    const counts = new Map();
    const bump = (x) => { if (x && x !== 'N/A') counts.set(x, (counts.get(x) || 0) + 1); };
    subset.forEach(b => {
      const v = b[facet.field];
      if (facet.multi && Array.isArray(v)) v.forEach(bump);
      else bump(v);
    });
    const current = filters[facet.key];
    // keep the most common values (vocab can be in the hundreds), then sort A–Z
    let options = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, FACET_OPTION_CAP)
      .map(e => e[0]);
    if (current && !options.includes(current)) options.push(current);
    options.sort((a, b) => String(a).localeCompare(String(b)));
    populateSelectPreserve(facet.sel, options, current);
    const group = $(facet.sel)?.closest('.filter-group');
    if (group) group.style.display = options.length ? '' : 'none';
  });
}

export function getFilterValues() {
  const safeVal = (id) => ($(id) && $(id).value) || '';
  const f = {
    searchTerm: ($('searchInput')?.value || '').toLowerCase(),
    searchName: !!$('searchName')?.checked,
    searchTasks: !!$('searchTasks')?.checked,
    searchDescription: !!$('searchDescription')?.checked,
    searchDomains: !!$('searchDomains')?.checked,
    searchRisks: !!$('searchRisks')?.checked,
    searchAudience: !!$('searchAudience')?.checked,
    sortBy: activeSort,
  };
  FACETS.forEach(facet => { f[facet.key] = safeVal(facet.sel); });
  return f;
}

function validationBadge(validation){
  if(!validation) return '';
  const txt = (String(validation).toLowerCase() === 'author')
    ? 'Author Verified'
    : (String(validation).toLowerCase() === 'llm' ? 'LLM Generated' : validation);
  return `<span class="badge" title="Validation">${txt}</span>`;
}

// Surfaces the paper's "metadata gap" theme per row: documentation completeness
// (key fields present out of 4) and whether source links are available.
function metaBadges(b){
  const out = [];
  if (typeof b.docPresent === 'number'){
    const total = b.docTotal || 4;
    const cls = b.docPresent >= total ? 'badge-good' : (b.docPresent <= 1 ? 'badge-warn' : 'badge-mid');
    out.push(`<span class="badge ${cls}" title="Key metadata fields documented (license, languages, size, modality)">Docs ${b.docPresent}/${total}</span>`);
  }
  if (b.oss) out.push(`<span class="badge badge-good" title="Permissive license + open access">OSS</span>`);
  return out.join(' ');
}

function linkCell(url, label){
  return url ? `<a href="${url}" target="_blank" rel="noopener noreferrer" class="link-icon">${label}</a>` : '';
}

// Compact, readable size-bucket labels that fit the narrow Size column.
const SIZE_PRETTY = {
  '<1MB': '<1MB', 'n<1K': '<1K', '1K<n<10K': '1K–10K', '10K<n<100K': '10K–100K',
  '100K<n<1M': '100K–1M', '1M<n<10M': '1M–10M', '10M<n<100M': '10M–100M',
  '100M<n<1B': '100M–1B', '1B<n<10B': '1B–10B', '10B<n<100B': '10B–100B',
  '100B<n<1T': '100B–1T', 'n>1T': '>1T', 'unknown': 'N/A',
};
function prettySize(s){
  if (s === null || s === undefined || s === '') return 'N/A';
  if (typeof s === 'number') return s.toLocaleString();
  return SIZE_PRETTY[s] || s;
}

function prettyModality(m){
  if (!m) return 'N/A';
  if (m === 'math_text') return 'Math (text)';
  return m.charAt(0).toUpperCase() + m.slice(1);
}

function prettyValidationCell(v){
  if (!v) return 'N/A';
  const s = String(v).toLowerCase();
  if (s === 'author') return 'Author';
  if (s === 'llm') return 'LLM';
  return v;
}

// compact ✓ / – cell for a source link (paper Figure 4)
function checkLink(url, label){
  return url
    ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer" class="check-link" title="${label}" aria-label="${label} available">✓</a>`
    : `<span class="no-link" title="not available">–</span>`;
}

function tagCell(items, cls, tagName, cap){
  const all = items || [];
  const shown = all.slice(0, cap);
  const tags = shown.map(d =>
    `<span class="tag ${cls}" role="button" tabindex="0" data-tag="${tagName}" data-value="${esc(d)}">${esc(d)}</span>`
  ).join('');
  const more = all.length > shown.length ? `<span class="tag-more">+${all.length - shown.length}</span>` : '';
  return `<div class="tag-container">${tags}${more}</div>`;
}

function renderRow(b, i){
  const name = esc(b.name || 'Untitled');
  const task = esc(b.data_type || 'N/A');
  const langs = (b.languages && b.languages.length)
    ? esc(b.languages.slice(0, 3).join(', ') + (b.languages.length > 3 ? ` +${b.languages.length - 3}` : ''))
    : esc(b.language && b.language !== 'N/A' ? b.language : 'N/A');
  const size = esc(b.sizeCategory || (b.sizeText ? (b.sizeText.length > 22 ? b.sizeText.slice(0, 22) + '…' : b.sizeText) : 'N/A'));
  const isSel = selected.has(benchId(b));

  return `<tr data-idx="${i}">
    <td class="col-compare"><input type="checkbox" class="cmp-check" data-idx="${i}" title="Add to comparison" aria-label="Select ${name} to compare" ${isSel ? 'checked' : ''} /></td>
    <td class="col-name"><span class="benchmark-name" title="${name}" role="button" tabindex="0">${name}</span></td>
    <td data-label="Domain">${tagCell(b.domains, '', 'domain', 2)}</td>
    <td data-label="Task">${task !== 'N/A' ? `<span class="cell-box">${task}</span>` : '<span class="muted-na">N/A</span>'}</td>
    <td data-label="Modality"><span class="cell-box">${prettyModality(b.modality)}</span></td>
    <td data-label="Languages">${langs}</td>
    <td data-label="AI Risk Atlas">${tagCell(b.risks, 'risk-tag', 'risk', 3)}</td>
    <td class="col-extra" data-label="Audience">${tagCell(b.audience, '', 'audience', 2)}</td>
    <td class="col-extra" data-label="Size">${size}</td>
    <td class="col-link" data-label="Paper">${checkLink(b.paper, 'Paper')}</td>
    <td class="col-link" data-label="GitHub">${checkLink(b.github, 'GitHub')}</td>
    <td class="col-link" data-label="Hugging Face">${checkLink(b.huggingface, 'HuggingFace')}</td>
  </tr>`;
}

function renderSlice(){
  const slice = lastRendered.slice(0, shownCount);
  $('tableBody').innerHTML = slice.map((b, i) => renderRow(b, i)).join('');
  const remaining = lastRendered.length - shownCount;
  const bar = $('showMoreBar');
  if (bar){
    bar.hidden = remaining <= 0;
    const info = $('showMoreInfo');
    if (info) info.textContent = remaining > 0
      ? `Showing ${shownCount.toLocaleString()} of ${lastRendered.length.toLocaleString()}`
      : '';
  }
}

export function renderTable(data){
  lastRendered = data || [];
  shownCount = Math.min(PAGE_SIZE, lastRendered.length);   // reset to first page
  renderSlice();
  $('loading').hidden = true;
  const hasData = !!lastRendered.length;
  $('tableView').style.display = hasData ? 'block' : 'none';
  $('emptyState').hidden = hasData;
  updateResultsCount(lastRendered.length);
}

// Render the next page (Show more) without resetting selection/scroll.
export function renderMore(){
  shownCount = Math.min(shownCount + PAGE_SIZE, lastRendered.length);
  renderSlice();
}

export function updateResultsCount(count){
  const el = $('resultCount');
  if (el) el.textContent = `${(count || 0).toLocaleString()} benchmark${count === 1 ? '' : 's'}`;
}

/* ---------- Export (one-click, paper feature: JSON/Markdown/CSV) ---------- */
const EXPORT_COLS = [
  ['name', 'Name'], ['data_type', 'Primary Task'], ['modality', 'Modality'],
  ['size', 'Size'], ['language', 'Language'], ['license', 'License'],
  ['domains', 'Domains'], ['tasks', 'Tasks'], ['risks', 'AI Risk Atlas'],
  ['docPresent', 'Docs (of 4)'], ['oss', 'Source-linked'],
  ['github', 'GitHub'], ['huggingface', 'HuggingFace'], ['paper', 'Paper'],
  ['overview', 'Overview'],
];

function cellValue(b, key){
  if (key === 'size') return b.size || b.sizeCategory || b.sizeText || '';
  const v = b[key];
  if (Array.isArray(v)) return v.join('; ');
  if (v === null || v === undefined) return '';
  return String(v);
}

function csvEscape(s){
  const needs = /[",\n]/.test(s);
  const e = s.replace(/"/g, '""');
  return needs ? `"${e}"` : e;
}

function downloadFile(filename, text, mime){
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

export function exportResults(data, format){
  const list = data || [];
  const stamp = new Date().toISOString().slice(0, 10);
  if (format === 'json'){
    downloadFile(`benchnavigator_${stamp}.json`, JSON.stringify(list, null, 2), 'application/json');
    return;
  }
  if (format === 'csv'){
    const head = EXPORT_COLS.map(c => csvEscape(c[1])).join(',');
    const rows = list.map(b => EXPORT_COLS.map(c => csvEscape(cellValue(b, c[0]))).join(','));
    downloadFile(`benchnavigator_${stamp}.csv`, [head, ...rows].join('\n'), 'text/csv');
    return;
  }
  if (format === 'md'){
    const head = `| ${EXPORT_COLS.map(c => c[1]).join(' | ')} |`;
    const sep = `| ${EXPORT_COLS.map(() => '---').join(' | ')} |`;
    const rows = list.map(b =>
      `| ${EXPORT_COLS.map(c => cellValue(b, c[0]).replace(/\|/g, '\\|').replace(/\n/g, ' ')).join(' | ')} |`);
    downloadFile(`benchnavigator_${stamp}.md`,
      [`# BenchNavigator — ${list.length} benchmarks`, '', head, sep, ...rows].join('\n'),
      'text/markdown');
  }
}

/* ===========================================================================
   Documentation card (paper Figure 5) + comparison view (paper Figure 6)
   ======================================================================== */
function notDoc(){ return `<span class="muted-na">Not documented in source</span>`; }
function linkChip(url, label){
  return url ? `<a class="src-chip" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${label}</a>` : '';
}

const FLAG_LABELS = {
  missing_overview: 'No overview',
  missing_goal: 'No goal',
  missing_data_source: 'No data source',
  missing_annotation: 'No annotation',
  missing_language: 'No language',
  missing_size: 'No size',
  missing_risk: 'No risk category',
  missing_audience: 'No audience',
  no_source_links: 'No source links',
};
function qualityBlock(b){
  const q = b.quality;
  if (!q) return '';
  const cls = q.score >= 75 ? 'badge-good' : (q.score >= 50 ? 'badge-mid' : 'badge-warn');
  const score = (typeof q.score === 'number') ? `<span class="badge ${cls}">Quality ${q.score}/100</span>` : '';
  const statusLabel = q.review_status ? q.review_status.replace(/_/g, ' ') : '';
  const statusCls = q.review_status === 'approved' ? 'badge-good' : (q.review_status === 'incomplete' ? 'badge-warn' : 'badge-mid');
  const status = statusLabel ? `<span class="badge ${statusCls}">${statusLabel}</span>` : '';
  const flags = (q.flags || []).map(f => `<span class="badge badge-warn">${FLAG_LABELS[f] || f}</span>`).join(' ');
  if (!score && !status && !flags) return '';
  return `<div class="card-quality"><span class="k">Review status</span> ${status} ${score} ${flags}</div>`;
}

function tagList(arr, cls){
  if (!arr || !arr.length) return notDoc();
  return `<div class="tag-container">${arr.map(x => `<span class="tag ${cls || ''}">${esc(x)}</span>`).join('')}</div>`;
}

// AI Risk Atlas as nested bullets (category → subcategories), paper Figure 5.
function renderRiskBullets(b){
  const a = b.atlasRisks || [];
  if (a.length){
    return `<ul class="card-bullets">${a.map(r =>
      `<li>${esc(r.category)}${
        (r.subcategory && r.subcategory.length)
          ? `<ul>${r.subcategory.map(s => `<li>${esc(s)}</li>`).join('')}</ul>` : ''
      }</li>`).join('')}</ul>`;
  }
  if (b.risks && b.risks.length){
    return `<ul class="card-bullets">${b.risks.map(r => `<li>${esc(r)}</li>`).join('')}</ul>`;
  }
  return notDoc();
}

function bulletList(items){
  if (!items || !items.length) return notDoc();
  return `<ul class="card-bullets">${items.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
}

// link chip with a Font Awesome icon (paper Figure 5 footer chips)
function srcChipIcon(url, label, iconHtml){
  return url ? `<a class="src-chip" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${iconHtml} ${label}</a>` : '';
}

function renderCard(b){
  const links = [
    srcChipIcon(b.paper, 'Paper', '<i class="fa-regular fa-file-lines"></i>'),
    srcChipIcon(b.github, 'GitHub', '<i class="fa-brands fa-github"></i>'),
    srcChipIcon(b.huggingface, 'HuggingFace', '<span aria-hidden="true">🤗</span>'),
    srcChipIcon(b.homepage, 'Homepage', '<i class="fa-solid fa-globe"></i>'),
  ].filter(Boolean).join('');

  return `<div class="bench-card">
    <div class="card-grid">
      <section><h4>Overview</h4><p>${b.overview ? esc(b.overview) : notDoc()}</p></section>
      <section><h4>Goal</h4><p>${b.goal ? esc(b.goal) : notDoc()}</p></section>
      <section><h4>Data Source</h4><p>${b.dataSource ? esc(b.dataSource) : notDoc()}</p></section>
      <section><h4>Annotation</h4><p>${b.annotation ? esc(b.annotation) : notDoc()}</p></section>
      <section><h4>AI Risk Atlas Categories</h4>${renderRiskBullets(b)}</section>
      <section><h4>Intended Audience</h4>${bulletList(b.audience)}</section>
    </div>
    ${links ? `<div class="card-links">${links}</div>` : ''}
  </div>`;
}

function toggleCardForRow(tr){
  if (!tr) return;
  const next = tr.nextElementSibling;
  if (next && next.classList.contains('card-row')){
    next.remove(); tr.classList.remove('expanded'); return;
  }
  const b = lastRendered[+tr.dataset.idx];
  if (!b) return;
  const row = document.createElement('tr');
  row.className = 'card-row';
  row.innerHTML = `<td colspan="${TABLE_COLS}">${renderCard(b)}</td>`;
  tr.after(row);
  tr.classList.add('expanded');
}

// Re-render any expanded card in place (used after lazy detail text loads).
export function rerenderOpenCards(){
  document.querySelectorAll('tr.card-row').forEach(cr => {
    const tr = cr.previousElementSibling;
    if (!tr) return;
    const b = lastRendered[+tr.dataset.idx];
    const td = cr.querySelector('td');
    if (b && td) td.innerHTML = renderCard(b);
  });
}

// Wire row-level expand (click name) + compare-checkbox behavior.
export function initTableInteractions(onSelChange){
  onSelectionChange = onSelChange || null;
  const body = $('tableBody');
  if (!body) return;
  body.addEventListener('click', (e) => {
    if (e.target.closest('.cmp-check') || e.target.closest('a')) return;
    const nameEl = e.target.closest('.benchmark-name');
    if (nameEl){ e.preventDefault(); toggleCardForRow(nameEl.closest('tr')); }
  });
  body.addEventListener('keydown', (e) => {
    const nameEl = e.target.closest?.('.benchmark-name');
    if (nameEl && (e.key === 'Enter' || e.key === ' ')){ e.preventDefault(); toggleCardForRow(nameEl.closest('tr')); }
  });
  body.addEventListener('change', (e) => {
    const chk = e.target.closest('.cmp-check');
    if (!chk) return;
    const b = lastRendered[+chk.dataset.idx];
    if (!b) return;
    const id = benchId(b);
    if (chk.checked) selected.set(id, b); else selected.delete(id);
    if (onSelectionChange) onSelectionChange(selected.size);
  });
}

export function getSelected(){ return Array.from(selected.values()); }
export function clearSelection(){
  selected.clear();
  document.querySelectorAll('.cmp-check').forEach(c => { c.checked = false; });
  if (onSelectionChange) onSelectionChange(0);
}

// Comparison modal (paper Figure 6): attributes down the left, benchmarks as columns.
const CMP_ATTRS = [
  ['Domain', b => (b.domains && b.domains.length) ? esc(b.domains.join(', ')) : '—'],
  ['Primary task', b => esc(b.data_type || 'N/A')],
  ['Modality', b => prettyModality(b.modality)],
  ['Size', b => esc(b.sizeText || (b.size && b.size !== '' ? b.size : 'N/A'))],
  ['Languages', b => esc((b.languages && b.languages.length) ? b.languages.join(', ') : (b.language || 'N/A'))],
  ['Tasks', b => (b.tasks && b.tasks.length) ? b.tasks.slice(0, 8).map(t => `<span class="tag">${esc(t)}</span>`).join('') : '—'],
  ['AI Risk Atlas', b => (b.atlasRisks && b.atlasRisks.length) ? b.atlasRisks.map(r => esc(r.category)).join(', ')
                        : ((b.risks && b.risks.length) ? b.risks.map(esc).join(', ') : '—')],
  ['Intended audience', b => (b.audience && b.audience.length) ? b.audience.map(esc).join(', ') : '—'],
  ['Goal', b => b.goal ? esc(b.goal) : '—'],
  ['Data source', b => b.dataSource ? esc(b.dataSource) : '—'],
  ['Annotation', b => b.annotation ? esc(b.annotation) : '—'],
  ['Overview', b => b.overview ? esc(b.overview) : '—'],
  ['Links', b => [linkChip(b.paper, 'Paper'), linkChip(b.github, 'GitHub'), linkChip(b.huggingface, 'HF'), linkChip(b.homepage, 'Home')].filter(Boolean).join(' ') || '—'],
];

function escClose(e){ if (e.key === 'Escape') closeComparison(); }

export function openComparison(list){
  if (!list || !list.length) return;
  let modal = $('comparisonModal');
  if (!modal){
    modal = document.createElement('div');
    modal.id = 'comparisonModal';
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);
  }
  const cols = list.map(b => `<th>${esc(b.name)}</th>`).join('');
  const rows = CMP_ATTRS.map(([label, fn]) =>
    `<tr><th class="attr">${label}</th>${list.map(b => `<td>${fn(b)}</td>`).join('')}</tr>`).join('');
  modal.innerHTML = `<div class="modal-card">
    <div class="modal-head">
      <h2>Benchmark Comparison <span class="modal-sub">${list.length} selected</span></h2>
      <button class="modal-close" type="button" aria-label="Close">×</button>
    </div>
    <div class="modal-body">
      <table class="cmp-table">
        <thead><tr><th class="attr">Attribute</th>${cols}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </div>`;
  modal.hidden = false;
  document.body.classList.add('modal-open');
  modal.querySelector('.modal-close').addEventListener('click', closeComparison);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeComparison(); });
  document.addEventListener('keydown', escClose);
}

export function closeComparison(){
  const modal = $('comparisonModal');
  if (modal) modal.hidden = true;
  document.body.classList.remove('modal-open');
  document.removeEventListener('keydown', escClose);
}

export function applyStateFromURL(){
  const p = new URLSearchParams(location.search);
  if ($('searchInput')) $('searchInput').value = p.get('q') || '';
  FACETS.forEach(facet => {
    const el = $(facet.sel);
    const value = p.get(facet.key) || '';
    if (el && value && ![...el.options].some(o => o.value === value)){
      const opt = document.createElement('option');
      opt.value = value; opt.textContent = value;
      el.appendChild(opt);
    }
    if (el) el.value = value;
  });
  const sort = p.get('sort');
  if (sort){ setActiveSort(sort); if ($('sortSelect') && [...$('sortSelect').options].some(o => o.value === sort)) $('sortSelect').value = sort; }
}

export function updateURLFromState(filters){
  const p = new URLSearchParams();
  if (filters.searchTerm) p.set('q', filters.searchTerm);
  FACETS.forEach(facet => { if (filters[facet.key]) p.set(facet.key, filters[facet.key]); });
  if (filters.sortBy && filters.sortBy !== 'name-asc') p.set('sort', filters.sortBy);
  const qs = p.toString();
  history.replaceState({}, '', qs ? `${location.pathname}?${qs}` : location.pathname);
}

export function showLoadingState(){
  $('loading').hidden = false;
  $('tableView').style.display = 'block';
  $('emptyState').hidden = true;
}

export function hideLoadingState(count){
  $('loading').hidden = true;
  const show = count > 0;
  $('tableView').style.display = show ? 'block' : 'none';
  $('emptyState').hidden = show;
}

export function renderActiveChips(filters){
  const container = $('activeFiltersContainer');
  const chips = [];
  const add = (label, key) => {
    chips.push(`<span class="chip">${label} <button type="button" data-clear="${key}" aria-label="Clear ${key}">×</button></span>`);
  };
  if (filters.searchTerm) add(`Search: “${esc(filters.searchTerm)}”`, 'search');
  FACETS.forEach(facet => { if (filters[facet.key]) add(`${facet.label}: ${esc(filters[facet.key])}`, facet.key); });
  container.innerHTML = chips.join('');
}

export function resetFilters(){
  $('filterForm').reset();
  setActiveSort('name-asc');
  if ($('sortSelect')) $('sortSelect').value = 'name-asc';
}

export function wireTagClicks(onTagSelected){
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (t && t.classList?.contains('tag')){
      const type = t.getAttribute('data-tag');
      const value = t.getAttribute('data-value');
      onTagSelected?.(type, value);
    }
    if (t && t.matches('[data-clear]')){
      const key = t.getAttribute('data-clear');
      if (key === 'search') $('searchInput').value = '';
      else if ($(`${key}Filter`)) $(`${key}Filter`).value = '';
      onTagSelected?.();
    }
  });

  // Keyboard activation for tags (Enter/Space)
  document.addEventListener('keydown', (e) => {
    const t = e.target;
    if (t && t.classList?.contains('tag') && (e.key === 'Enter' || e.key === ' ')){
      e.preventDefault();
      const type = t.getAttribute('data-tag');
      const value = t.getAttribute('data-value');
      onTagSelected?.(type, value);
    }
  });
}

/* ---------- Theme ---------- */
export function initTheme(){
  const saved = localStorage.getItem('theme') || '';
  const dark = saved ? saved === 'dark' : (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  setTheme(dark ? 'dark' : 'light');
  syncThemeIcon();
}

function syncThemeIcon(){
  const icon = document.getElementById('themeIcon');
  if (!icon) return;
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  icon.classList.remove(dark ? 'fa-moon' : 'fa-sun');
  icon.classList.add(dark ? 'fa-sun' : 'fa-moon');
}

export function setTheme(mode){
  const root = document.documentElement;
  if (mode === 'dark'){ root.setAttribute('data-theme','dark'); }
  else { root.removeAttribute('data-theme'); }
  localStorage.setItem('theme', mode);
  syncThemeIcon();
}

export function toggleTheme(){
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  setTheme(dark ? 'light' : 'dark');
  syncThemeIcon();
}
