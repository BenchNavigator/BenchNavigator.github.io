// logic.js
// filtering + sorting for benchmark table

function matchesSearch(b, filters){
  const q = (filters.searchTerm || '').trim();
  if (!q) return true;

  const haystacks = [];
  if (filters.searchName) haystacks.push((b.name || ''));
  if (filters.searchTasks) haystacks.push((b.data_type || ''), (b.tasks || []).join(' '));
  if (filters.searchDescription) haystacks.push((b.overview || ''));
  if (filters.searchDomains) haystacks.push((b.domains || []).join(' '));
  if (filters.searchRisks) haystacks.push((b.risks || []).join(' '));
  if (filters.searchAudience) haystacks.push((b.audience || []).join(' '));

  const text = haystacks.join(' • ').toLowerCase();
  return text.includes(q.toLowerCase());
}

// Facet descriptors (single source of truth for filtering + cascading options +
// chips + URL state). Order/labels match paper Figure 3.
export const FACETS = [
  { key: 'domain',     sel: 'domainFilter',     field: 'domains',          multi: true,  label: 'Domain' },
  { key: 'task',       sel: 'taskFilter',       field: 'tasks',            multi: true,  label: 'Primary Task' },
  { key: 'modality',   sel: 'modalityFilter',   field: 'modality',         multi: false, label: 'Modality' },
  { key: 'size',       sel: 'sizeFilter',       field: 'sizeCategory',     multi: false, label: 'Size Category' },
  { key: 'language',   sel: 'languageFilter',   field: 'languages',        multi: true,  label: 'Language' },
  { key: 'datatype',   sel: 'datatypeFilter',   field: 'dataType',         multi: false, label: 'Data Type' },
  { key: 'annotation', sel: 'annotationFilter', field: 'annotationMethod', multi: false, label: 'Annotation Method' },
  { key: 'risk',       sel: 'riskFilter',       field: 'risks',            multi: true,  label: 'AI Risk Atlas' },
  { key: 'audience',   sel: 'audienceFilter',   field: 'audience',         multi: true,  label: 'Audience' },
  { key: 'metric',     sel: 'metricFilter',     field: 'metrics',          multi: true,  label: 'Metric' },
  { key: 'method',     sel: 'methodFilter',     field: 'methods',          multi: true,  label: 'Method' },
  { key: 'status',     sel: 'statusFilter',     field: 'reviewStatus',     multi: false, label: 'Quality Status' },
];

function matchesFacet(b, facet, value){
  if (!value) return true;
  const v = b[facet.field];
  return facet.multi ? (Array.isArray(v) && v.includes(value)) : ((v || '') === value);
}

// Passes all facet filters, optionally ignoring one facet (for dependent options).
function passesFacetFilters(b, f, exceptKey){
  for (const facet of FACETS){
    if (facet.key === exceptKey) continue;
    if (!matchesFacet(b, facet, f[facet.key])) return false;
  }
  return true;
}

// Records matching search + every facet EXCEPT one — used to compute which
// values that one facet can still offer (so combinations never dead-end at zero).
export function recordsMatchingExcept(allData, filters, exceptKey){
  return (allData || []).filter(b => matchesSearch(b, filters) && passesFacetFilters(b, filters, exceptKey));
}

// Sort key -> value accessor. Used by both the dropdown and header-click sorting.
const SIZE_ORDER = { '<1K': 1, '1K–10K': 2, '10K–100K': 3, '100K–1M': 4, '>1M': 5 };
const SORT_ACCESSORS = {
  name:     b => (b.name || '').toLowerCase(),
  domain:   b => ((b.domains && b.domains[0]) || '').toLowerCase(),
  task:     b => (b.data_type || '').toLowerCase(),
  modality: b => (b.modality || '').toLowerCase(),
  language: b => ((b.languages && b.languages[0]) || b.language || '').toLowerCase(),
  risk:     b => ((b.risks && b.risks[0]) || '').toLowerCase(),
  audience: b => ((b.audience && b.audience[0]) || '').toLowerCase(),
  size:     b => SIZE_ORDER[b.sizeCategory] || 0,
  paper:    b => (b.paper ? 1 : 0),
  github:   b => (b.github ? 1 : 0),
  hf:       b => (b.huggingface ? 1 : 0),
};

// Parse a sort token like "name-asc" / "size-desc" (bare "name" == ascending).
export function parseSort(sortBy){
  const m = /^(.+)-(asc|desc)$/.exec(sortBy || '');
  return m ? { key: m[1], dir: m[2] } : { key: sortBy || 'name', dir: 'asc' };
}

function sortList(list, sortBy){
  const { key, dir } = parseSort(sortBy);
  const acc = SORT_ACCESSORS[key] || SORT_ACCESSORS.name;
  list.sort((a, b) => {
    const va = acc(a), vb = acc(b);
    const c = (typeof va === 'number' && typeof vb === 'number')
      ? va - vb : String(va).localeCompare(String(vb));
    return dir === 'desc' ? -c : c;
  });
}

export function filterAndSortData(allData, filters){
  const list = (allData || []).filter(b => matchesSearch(b, filters) && passesFacetFilters(b, filters));
  sortList(list, filters.sortBy);
  return list;
}
