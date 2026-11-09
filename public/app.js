const $ = (selector) => document.querySelector(selector);
const state = { authenticated: false, view: 'overview', page: 1, pages: 1, status: 'pending', query: '', tvStatus: 'pending', animeStatus: 'pending' };
const viewTitles = { overview: 'Overview', catalog: 'Movie catalog', tv: 'TV series', anime: 'Anime series', crawler: 'Movie discovery', history: 'Crawl history' };

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && state.authenticated) showLogin();
    throw new Error(payload.error || 'Request failed (' + response.status + ').');
  }
  return payload;
}

function toast(message) {
  const el = document.createElement('div');
  el.className = 'toast-note';
  el.textContent = message;
  $('#toast-area').append(el);
  window.setTimeout(() => el.remove(), 3200);
}

function showLogin() {
  state.authenticated = false;
  $('#app-content').classList.add('d-none');
  $('#login-layer').classList.remove('d-none');
  $('#logout-btn').classList.add('d-none');
}

function showApp() {
  state.authenticated = true;
  $('#login-layer').classList.add('d-none');
  $('#app-content').classList.remove('d-none');
  $('#logout-btn').classList.remove('d-none');
  loadDashboard();
  loadMovies();
}

function openView(name) {
  if (!viewTitles[name]) name = 'overview';
  state.view = name;
  document.querySelectorAll('.view').forEach((node) => node.classList.remove('active'));
  $('#view-' + name).classList.add('active');
  document.querySelectorAll('.nav-item').forEach((node) => node.classList.toggle('active', node.dataset.view === name));
  $('#crumb-current').textContent = viewTitles[name];
  if (name === 'catalog') loadMovies();
  if (name === 'tv') loadTvSeries();
  if (name === 'anime') loadAnimeSeries();
  if (name === 'history') loadHistory();
  if (name === 'overview') loadDashboard();
  $('#sidebar').classList.remove('sidebar-open');
}

function dateText(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? '—' : new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

function statusPill(status) {
  return '<span class="status-pill status-' + escapeHtml(status) + '">' + escapeHtml(status) + '</span>';
}

function activityMarkup(run) {
  const icon = run.status === 'completed' ? 'bi-cloud-check' : 'bi-exclamation-circle';
  return '<div class="activity-row"><div class="activity-icon"><i class="bi ' + icon + '"></i></div><div><b>' +
    escapeHtml(run.startYear) + '–' + escapeHtml(run.endYear) + ' · ' + escapeHtml(run.status) +
    '</b><small>' + dateText(run.createdAt) + '</small></div><div class="activity-count"><b>+' +
    Number(run.importedCount || 0).toLocaleString() + '</b><small>imported</small></div></div>';
}

async function loadDashboard() {
  try {
    const data = await api('/api/admin/dashboard');
    $('#count-total').textContent = data.counts.total.toLocaleString();
    $('#count-pending').textContent = data.counts.pending.toLocaleString();
    $('#count-approved').textContent = data.counts.approved.toLocaleString();
    $('#count-rejected').textContent = data.counts.rejected.toLocaleString();
    $('#db-dot').classList.add('online');
    $('#db-label').textContent = 'Database connected';
    $('#recent-runs').innerHTML = data.recentRuns.length
      ? data.recentRuns.map(activityMarkup).join('')
      : '<div class="empty-state"><i class="bi bi-inbox"></i><span>No manual crawls yet.</span></div>';
  } catch (error) {
    $('#db-dot').classList.remove('online');
    $('#db-label').textContent = 'Database unavailable';
    $('#recent-runs').innerHTML = '<div class="empty-state">' + escapeHtml(error.message) + '</div>';
  }
}

function movieMarkup(movie) {
  const poster = movie.posterUrl
    ? '<img class="poster" loading="lazy" src="' + escapeHtml(movie.posterUrl) + '" alt="">'
    : '<div class="poster poster-empty"><i class="bi bi-film"></i></div>';
  const actions = movie.moderationStatus === 'pending'
    ? '<button class="row-action accept" data-review="approved" data-id="' + escapeHtml(movie.id) + '" aria-label="Approve"><i class="bi bi-check-lg"></i></button><button class="row-action decline" data-review="rejected" data-id="' + escapeHtml(movie.id) + '" aria-label="Reject"><i class="bi bi-x-lg"></i></button>'
    : '<button class="row-action" data-review="pending" data-id="' + escapeHtml(movie.id) + '" aria-label="Return to pending"><i class="bi bi-arrow-counterclockwise"></i></button>';
  return '<tr><td><div class="movie-cell">' + poster + '<div><b>' + escapeHtml(movie.title) +
    '</b><small>IMDb ID ' + escapeHtml(movie.imdbId) + (movie.genres?.length ? ' · ' + escapeHtml(movie.genres.slice(0, 2).join(', ')) : '') +
    '</small></div></div></td><td>' + escapeHtml(movie.releaseDate || '—') + '</td><td><span class="rating"><i class="bi bi-star-fill"></i> ' +
    Number(movie.voteAverage || 0).toFixed(1) + '</span><small class="table-sub">' + Number(movie.voteCount || 0).toLocaleString() +
    ' votes</small></td><td>' + (movie.runtime ? escapeHtml(movie.runtime) + ' min' : '—') + '</td><td>' +
    statusPill(movie.moderationStatus) + '</td><td><div class="row-actions">' + actions + '</div></td></tr>';
}

async function loadMovies() {
  if (!state.authenticated) return;
  const params = new URLSearchParams({ page: String(state.page), limit: '20', status: state.status });
  if (state.query) params.set('q', state.query);
  $('#movie-rows').innerHTML = '<tr><td colspan="6"><div class="loading"><span class="spinner-border spinner-border-sm"></span> Loading movies…</div></td></tr>';
  try {
    const data = await api('/api/admin/movies?' + params.toString());
    state.pages = Math.max(1, data.pagination.totalPages);
    $('#catalog-total').textContent = data.pagination.total.toLocaleString() + ' movie records';
    $('#page-label').textContent = 'Page ' + state.page + ' of ' + state.pages;
    $('#prev-page').disabled = state.page <= 1;
    $('#next-page').disabled = state.page >= state.pages;
    $('#movie-rows').innerHTML = data.items.length
      ? data.items.map(movieMarkup).join('')
      : '<tr><td colspan="6"><div class="empty-state"><i class="bi bi-film"></i><span>No records found for this filter.</span></div></td></tr>';
  } catch (error) {
    $('#movie-rows').innerHTML = '<tr><td colspan="6"><div class="empty-state">' + escapeHtml(error.message) + '</div></td></tr>';
  }
}

async function reviewMovie(id, moderationStatus) {
  try {
    await api('/api/admin/movies/' + encodeURIComponent(id) + '/review', {
      method: 'PATCH', body: JSON.stringify({ moderationStatus })
    });
    toast('Movie marked as ' + moderationStatus + '.');
    loadMovies();
    loadDashboard();
  } catch (error) { toast(error.message); }
}


function mediaActions(item, kind) {
  const route = kind === 'tv' ? 'tv-series' : 'anime-series';
  const id = item.id;
  const buttons = item.moderationStatus === 'pending'
    ? '<button class="row-action accept" data-media-review="approved" data-kind="' + kind + '" data-id="' + escapeHtml(id) + '" aria-label="Approve"><i class="bi bi-check-lg"></i></button><button class="row-action decline" data-media-review="rejected" data-kind="' + kind + '" data-id="' + escapeHtml(id) + '" aria-label="Reject"><i class="bi bi-x-lg"></i></button>'
    : '<button class="row-action" data-media-review="pending" data-kind="' + kind + '" data-id="' + escapeHtml(id) + '" aria-label="Return to pending"><i class="bi bi-arrow-counterclockwise"></i></button>';
  return '<div class="row-actions" data-route="' + route + '">' + buttons + '</div>';
}

function mediaMarkup(item, kind) {
  const title = kind === 'tv' ? item.title : (item.titleEnglish || item.title);
  const image = item.posterUrl
    ? '<img class="poster" loading="lazy" src="' + escapeHtml(item.posterUrl) + '" alt="">'
    : '<div class="poster poster-empty"><i class="bi bi-film"></i></div>';
  const idText = kind === 'tv' ? 'TMDB TV ' + item.tmdbId : 'MAL ' + item.malId;
  const date = kind === 'tv' ? (item.firstAirDate || '—') : (item.releaseYear || '—');
  const rating = kind === 'tv' ? Number(item.voteAverage || 0) : Number(item.score || 0);
  const count = kind === 'tv' ? (Number(item.numberOfSeasons || 0) + ' seasons') : (Number(item.episodes || 0) + ' episodes');
  return '<tr><td><div class="movie-cell">' + image + '<div><b>' + escapeHtml(title) +
    '</b><small>' + escapeHtml(idText) + (item.genres?.length ? ' · ' + escapeHtml(item.genres.slice(0, 2).join(', ')) : '') +
    '</small></div></div></td><td>' + escapeHtml(date) + '</td><td><span class="rating"><i class="bi bi-star-fill"></i> ' +
    rating.toFixed(1) + '</span></td><td>' + escapeHtml(count) + '</td><td>' + statusPill(item.moderationStatus) +
    '</td><td><div class="row-actions">' + mediaActions(item, kind) + '</div></td></tr>';
}

async function loadMediaCatalog(kind) {
  const isTv = kind === 'tv';
  const status = isTv ? state.tvStatus : state.animeStatus;
  const endpoint = isTv ? '/api/admin/tv-series' : '/api/admin/anime-series';
  const rows = isTv ? $('#tv-rows') : $('#anime-rows');
  rows.innerHTML = '<tr><td colspan="6"><div class="loading">Loading ' + (isTv ? 'TV series' : 'anime') + '…</div></td></tr>';
  try {
    const data = await api(endpoint + '?page=1&limit=50&status=' + encodeURIComponent(status));
    rows.innerHTML = data.items.length
      ? data.items.map((item) => mediaMarkup(item, kind)).join('')
      : '<tr><td colspan="6"><div class="empty-state">No records found for this filter.</div></td></tr>';
  } catch (error) {
    rows.innerHTML = '<tr><td colspan="6"><div class="empty-state">' + escapeHtml(error.message) + '</div></td></tr>';
  }
}

function loadTvSeries() { return loadMediaCatalog('tv'); }
function loadAnimeSeries() { return loadMediaCatalog('anime'); }

async function importSeries(kind) {
  const isTv = kind === 'tv';
  const field = isTv ? $('#tv-import-ids') : $('#anime-import-ids');
  const message = isTv ? $('#tv-import-message') : $('#anime-import-message');
  const button = isTv ? $('#tv-import-btn') : $('#anime-import-btn');
  const ids = field.value.split(/[,\s]+/).map((value) => value.trim()).filter(Boolean);
  if (!ids.length) { message.classList.remove('d-none'); message.classList.add('error'); message.textContent = 'Enter at least one ID.'; return; }
  button.disabled = true;
  message.classList.remove('d-none', 'error');
  message.textContent = 'Resolving IDs and fetching series metadata…';
  try {
    const endpoint = isTv ? '/api/admin/import-tv-series' : '/api/admin/import-anime-series';
    const response = await api(endpoint, { method: 'POST', body: JSON.stringify({ ids }) });
    const result = response.result;
    message.textContent = result.imported + ' new · ' + result.updated + ' updated · ' + result.skipped + ' skipped. New records need review.';
    if (isTv) { state.tvStatus = 'pending'; $('#tv-status-filter').value = 'pending'; loadTvSeries(); }
    else { state.animeStatus = 'pending'; $('#anime-status-filter').value = 'pending'; loadAnimeSeries(); }
    loadDashboard();
  } catch (error) {
    message.classList.add('error');
    message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

async function reviewSeries(kind, id, moderationStatus) {
  const route = kind === 'tv' ? 'tv-series' : 'anime-series';
  try {
    await api('/api/admin/' + route + '/' + encodeURIComponent(id) + '/review', {
      method: 'PATCH', body: JSON.stringify({ moderationStatus })
    });
    toast((kind === 'tv' ? 'TV series' : 'Anime') + ' marked as ' + moderationStatus + '.');
    if (kind === 'tv') loadTvSeries(); else loadAnimeSeries();
  } catch (error) { toast(error.message); }
}

async function loadHistory() {
  try {
    const data = await api('/api/admin/crawl-runs');
    $('#history-rows').innerHTML = data.items.length ? data.items.map((run) => activityMarkup(run).replace(
      '<small>' + dateText(run.createdAt) + '</small>',
      '<small>' + dateText(run.createdAt) + ' · ' + run.pagesProcessed + ' pages processed' +
      (run.errorMessage ? ' · ' + escapeHtml(run.errorMessage) : '') + '</small>'
    )).join('') : '<div class="empty-state"><i class="bi bi-clock-history"></i><span>No crawl history yet.</span></div>';
  } catch (error) {
    $('#history-rows').innerHTML = '<div class="empty-state">' + escapeHtml(error.message) + '</div>';
  }
}

function fillYears() {
  const current = new Date().getFullYear();
  for (let year = current; year >= 2000; year -= 1) {
    $('#year-from').add(new Option(String(year), String(year)));
    $('#year-to').add(new Option(String(year), String(year)));
  }
  $('#year-from').value = '2010';
  $('#year-to').value = String(current);
}

function showCrawlResult(result) {
  $('#crawl-result').classList.remove('empty-state');
  $('#crawl-result').innerHTML = '<div class="crawl-result-grid">' +
    '<div><b>' + Number(result.discoveredCount).toLocaleString() + '</b><small>Unique discovered</small></div>' +
    '<div><b>' + Number(result.importedCount).toLocaleString() + '</b><small>New records</small></div>' +
    '<div><b>' + Number(result.updatedCount).toLocaleString() + '</b><small>Existing updated</small></div>' +
    '<div><b>' + Number(result.skippedAdultCount).toLocaleString() + '</b><small>Adult flag skipped</small></div></div>' +
    '<div class="filter-callout"><i class="bi bi-info-circle"></i><span>' + result.pagesProcessed +
    ' page(s) processed of ' + result.totalPages + '. New records are Pending review.' +
    (result.nextPage ? ' Next start page: ' + result.nextPage + '.' : ' No next page in this query.') + '</span></div>';
}

$('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button[type="submit"]');
  button.disabled = true;
  $('#login-error').textContent = '';
  try {
    await api('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ username: $('#username').value.trim(), password: $('#password').value })
    });
    $('#password').value = '';
    showApp();
  } catch (error) {
    $('#login-error').textContent = error.message;
  } finally { button.disabled = false; }
});

$('#logout-btn').addEventListener('click', async () => {
  try { await api('/api/admin/logout', { method: 'POST', body: '{}' }); } catch {}
  showLogin();
});

$('#tmdb-check-btn').addEventListener('click', async () => {
  const button = $('#tmdb-check-btn');
  const message = $('#tmdb-check-message');
  button.disabled = true;
  button.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Checking…';
  message.classList.remove('d-none', 'error', 'success');
  message.textContent = 'Checking outbound connection to TMDB and validating the API key…';
  try {
    const result = await api('/api/admin/tmdb-status');
    message.classList.add('success');
    message.textContent = result.message + ' Host: ' + result.host;
    toast('TMDB connection is working.');
  } catch (error) {
    message.classList.add('error');
    message.textContent = error.message;
    toast('TMDB connection test failed.');
  } finally {
    button.disabled = false;
    button.innerHTML = '<i class="bi bi-wifi"></i> Test TMDB connection';
  }
});


$('#seed-movies-btn').addEventListener('click', async () => {
  const button = $('#seed-movies-btn');
  const message = $('#seed-movies-message');
  button.disabled = true;
  message.classList.remove('d-none', 'error');
  message.textContent = 'Discovering eligible movies and saving each successful record to MongoDB…';
  try {
    const response = await api('/api/admin/seed-top-movies', {
      method: 'POST',
      body: JSON.stringify({ targetCount: 60, maxPages: 20 })
    });
    const result = response.result;
    message.textContent = 'Added ' + result.imported + ' new movies. ' +
      result.remaining + ' still missing. Checked ' + result.candidatesChecked +
      ' candidates across ' + result.pagesProcessed + ' pages; ' +
      result.filtered + ' filtered, ' + result.duplicates + ' already existed, ' +
      result.failed + ' failed lookups.' +
      (result.failures?.length ? ' First error: ' + result.failures[0].message : '');
    if (result.remaining > 0) message.classList.add('error');
    loadDashboard();
    if (state.view === 'catalog') loadMovies();
  } catch (error) {
    message.classList.add('error');
    message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

$('#crawl-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = $('#crawl-btn');
  const message = $('#crawl-message');
  button.disabled = true;
  button.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Crawling TMDB…';
  message.classList.remove('d-none', 'error');
  message.textContent = 'Fetching metadata and saving the batch to MongoDB.';
  try {
    const response = await api('/api/admin/crawl', {
      method: 'POST',
      body: JSON.stringify({
        startYear: Number($('#year-from').value),
        endYear: Number($('#year-to').value),
        startPage: Number($('#page-start').value),
        maxPages: Number($('#page-count').value)
      })
    });
    showCrawlResult(response.result);
    message.textContent = 'Crawl completed · ' + response.result.importedCount + ' new records · ' + response.result.updatedCount + ' updated.';
    if (response.result.nextPage) $('#page-start').value = String(response.result.nextPage);
    state.status = 'pending';
    state.page = 1;
    $('#status-filter').value = 'pending';
    loadMovies();
    loadDashboard();
    loadHistory();
  } catch (error) {
    message.classList.add('error');
    message.textContent = error.message;
  } finally {
    button.disabled = false;
    button.innerHTML = '<i class="bi bi-cloud-arrow-down"></i><span>Run manual crawl</span>';
  }
});

$('#status-filter').addEventListener('change', (event) => {
  state.status = event.target.value;
  state.page = 1;
  loadMovies();
});

let searchTimer;
$('#movie-search').addEventListener('input', (event) => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => {
    state.query = event.target.value.trim();
    state.page = 1;
    loadMovies();
  }, 300);
});

$('#movie-rows').addEventListener('click', (event) => {
  const button = event.target.closest('[data-review]');
  if (button) reviewMovie(button.dataset.id, button.dataset.review);
});
$('#prev-page').addEventListener('click', () => { state.page = Math.max(1, state.page - 1); loadMovies(); });
$('#next-page').addEventListener('click', () => { state.page = Math.min(state.pages, state.page + 1); loadMovies(); });
$('#refresh-catalog').addEventListener('click', loadMovies);
$('#refresh-history').addEventListener('click', loadHistory);
$('#tv-import-form').addEventListener('submit', (event) => { event.preventDefault(); importSeries('tv'); });
$('#anime-import-form').addEventListener('submit', (event) => { event.preventDefault(); importSeries('anime'); });
$('#tv-status-filter').addEventListener('change', (event) => { state.tvStatus = event.target.value; loadTvSeries(); });
$('#anime-status-filter').addEventListener('change', (event) => { state.animeStatus = event.target.value; loadAnimeSeries(); });
$('#tv-rows').addEventListener('click', (event) => {
  const button = event.target.closest('[data-media-review]');
  if (button) reviewSeries('tv', button.dataset.id, button.dataset.mediaReview);
});
$('#anime-rows').addEventListener('click', (event) => {
  const button = event.target.closest('[data-media-review]');
  if (button) reviewSeries('anime', button.dataset.id, button.dataset.mediaReview);
});

document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => openView(button.dataset.view)));
document.querySelectorAll('[data-open-view]').forEach((button) => button.addEventListener('click', () => openView(button.dataset.openView)));
$('#menu-toggle').addEventListener('click', () => $('#sidebar').classList.toggle('sidebar-open'));

fillYears();
api('/api/admin/session').then(showApp).catch(showLogin);
