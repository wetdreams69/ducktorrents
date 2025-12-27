import * as duckdb from 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/+esm';

let db;
let conn;
let searchTimeout;
const searchCache = new Map();
const MAX_CACHE_SIZE = 50;

const searchInput = document.getElementById('search-input');
const resultsContainer = document.getElementById('results-container');
const resultsMeta = document.getElementById('results-meta');
const emptyState = document.getElementById('empty-state');
const statusBadge = document.getElementById('db-status');
const loader = document.getElementById('loader');

async function init() {
    try {
        const baseURL = window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '/');

        const BUNDLES = {
            mvp: {
                mainModule: baseURL + 'lib/duckdb-mvp.wasm',
                mainWorker: baseURL + 'lib/duckdb-browser-mvp.worker.js',
            },
            eh: {
                mainModule: baseURL + 'lib/duckdb-eh.wasm',
                mainWorker: baseURL + 'lib/duckdb-browser-eh.worker.js',
            },
        };

        const bundle = await duckdb.selectBundle(BUNDLES);
        const worker = new Worker(bundle.mainWorker);
        const logger = new duckdb.ConsoleLogger();

        db = new duckdb.AsyncDuckDB(logger, worker);
        await db.instantiate(bundle.mainModule, bundle.pthreadWorker);

        conn = await db.connect();
        statusBadge.textContent = 'Engine Ready';

        try {
            const parquetResponse = await fetch('torrents.parquet');
            if (parquetResponse.ok) {
                const parquetBuffer = await parquetResponse.arrayBuffer();
                await db.registerFileBuffer('torrents.parquet', new Uint8Array(parquetBuffer));

                await conn.query(`
                    CREATE TABLE torrents AS SELECT * FROM read_parquet('torrents.parquet');
                `);

                // Get database stats
                const stats = await conn.query(`
                    SELECT 
                        COUNT(*) as total,
                        COUNT(CASE WHEN seeders > 0 THEN 1 END) as active
                    FROM torrents
                `);
                const statsData = stats.toArray()[0].toJSON();
                
                statusBadge.textContent = `${statsData.total.toLocaleString()} torrents indexed`;
                statusBadge.title = `${statsData.active.toLocaleString()} active torrents`;
                
                loader.classList.add('hidden');
                performSearch('');
            } else {
                throw new Error('Parquet file not found');
            }
        } catch (err) {
            console.error('Parquet load failed:', err);
            statusBadge.textContent = 'Data Not Available';
            statusBadge.style.color = '#f43f5e';
            loader.classList.add('hidden');
        }
    } catch (error) {
        console.error('Fatal initialization error:', error);
        statusBadge.textContent = 'Initialization Failed';
        statusBadge.style.color = '#f43f5e';
        loader.classList.add('hidden');
    }
}

async function performSearch(query) {
    if (!conn) return;

    const queryTrimmed = query.trim();
    const cacheKey = queryTrimmed.toLowerCase();

    // Check cache first
    if (searchCache.has(cacheKey)) {
        const cached = searchCache.get(cacheKey);
        renderResults(cached.rows, cached.duration, queryTrimmed === '', queryTrimmed);
        return;
    }

    // Show loading state
    if (queryTrimmed !== '') {
        resultsContainer.innerHTML = '<div class="searching-message">Searching...</div>';
        emptyState.classList.add('hidden');
    }

    let sql;
    let params = [];

    if (queryTrimmed === '') {
        sql = 'SELECT * FROM torrents WHERE seeders > 0 ORDER BY completed DESC, seeders DESC LIMIT 5';
    } else {
        const searchTerm = queryTrimmed;
        sql = `
            SELECT * FROM torrents 
            WHERE seeders > 0 AND (
                name ILIKE '%' || ? || '%' 
                OR infohash ILIKE ?
            )
            ORDER BY seeders DESC 
            LIMIT 50
        `;
        params = [searchTerm, searchTerm];
    }

    try {
        const startTime = performance.now();
        const result = await conn.query(sql, params);
        const endTime = performance.now();
        const rows = result.toArray();
        const duration = endTime - startTime;

        // Cache the results
        if (searchCache.size >= MAX_CACHE_SIZE) {
            const firstKey = searchCache.keys().next().value;
            searchCache.delete(firstKey);
        }
        searchCache.set(cacheKey, { rows, duration });

        renderResults(rows, duration, queryTrimmed === '', queryTrimmed);
    } catch (error) {
        console.error('Search error:', error);
        resultsContainer.innerHTML = '<div class="error-message">Search error. Please try again.</div>';
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function highlightMatch(text, searchTerm) {
    if (!searchTerm || searchTerm === '') return escapeHtml(text);
    
    const escapedText = escapeHtml(text);
    const escapedTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedTerm})`, 'gi');
    
    return escapedText.replace(regex, '<mark>$1</mark>');
}

function renderResults(rows, duration, isTopTorrents = false, searchTerm = '') {
    resultsContainer.innerHTML = '';

    if (rows.length === 0) {
        emptyState.classList.remove('hidden');
        resultsMeta.textContent = '';
        return;
    }

    emptyState.classList.add('hidden');
    if (isTopTorrents) {
        resultsMeta.textContent = `Top ${rows.length} most downloaded torrents`;
    } else {
        resultsMeta.textContent = `${rows.length} results found in ${duration.toFixed(2)}ms`;
    }

    rows.forEach(row => {
        const obj = row.toJSON();
        const sizeGB = (Number(obj.size_bytes) / (1024 ** 3)).toFixed(2);
        const magnet = `magnet:?xt=urn:btih:${obj.infohash}&dn=${encodeURIComponent(obj.name)}`;

        const card = document.createElement('div');
        card.className = 'result-card glass';
        card.innerHTML = `
            <div class="info text-truncate">
                <h3 class="text-truncate" title="${escapeHtml(obj.name)}">
                    ${highlightMatch(obj.name, searchTerm)}
                </h3>
                <div class="stats">
                    <span class="size">${sizeGB} GB</span>
                    <span class="seeders" title="Seeders"> ${obj.seeders}</span>
                    <span class="leechers" title="Leechers"> ${obj.leechers}</span>
                    ${obj.completed ? `<span class="completed" title="Downloads"> ${obj.completed}</span>` : ''}
                </div>
            </div>
            <a href="${magnet}" class="magnet-btn" title="Download via magnet link">🧲 Magnet</a>
        `;
        resultsContainer.appendChild(card);
    });
}

// Event Listeners with debounce
searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        performSearch(e.target.value);
    }, 300);
});

// Allow instant search on Enter
searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        clearTimeout(searchTimeout);
        performSearch(e.target.value);
    }
});

// Modal Logic
const modal = document.getElementById('contribute-modal');
const openModalBtn = document.getElementById('open-contribute');
const contributeBtn = document.getElementById('contribute-btn');
const closeModalBtn = document.getElementById('close-modal');

const toggleModal = (e) => {
    if (e) e.preventDefault();
    modal.classList.toggle('hidden');
};

if (openModalBtn) openModalBtn.addEventListener('click', toggleModal);
if (contributeBtn) contributeBtn.addEventListener('click', toggleModal);
if (closeModalBtn) closeModalBtn.addEventListener('click', toggleModal);

if (modal) {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) toggleModal();
    });
}

// Initialize
init();