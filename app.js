import * as duckdb from 'https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.28.0/+esm';

let db;
let conn;

const searchInput = document.getElementById('search-input');
const resultsContainer = document.getElementById('results-container');
const resultsMeta = document.getElementById('results-meta');
const emptyState = document.getElementById('empty-state');
const statusBadge = document.getElementById('db-status');
const loader = document.getElementById('loader');

async function init() {
    try {
        // Get the base URL for proper path resolution
        const baseURL = window.location.origin + window.location.pathname.replace(/\/[^/]*$/, '/');

        // Use local bundles to avoid CORS issues
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

        // Fetch and register the parquet file in DuckDB's virtual filesystem
        try {
            const parquetResponse = await fetch('torrents.parquet');
            if (parquetResponse.ok) {
                const parquetBuffer = await parquetResponse.arrayBuffer();
                await db.registerFileBuffer('torrents.parquet', new Uint8Array(parquetBuffer));

                await conn.query(`
                    CREATE TABLE torrents AS SELECT * FROM read_parquet('torrents.parquet');
                `);

                statusBadge.textContent = 'Index Loaded';
                loader.classList.add('hidden');
                performSearch('');
            } else {
                throw new Error('Parquet file not found');
            }
        } catch (err) {
            console.error('Parquet load failed:', err);
            // Fallback to CSV
            try {
                const csvResponse = await fetch('torrents.csv');
                if (csvResponse.ok) {
                    const csvBuffer = await csvResponse.arrayBuffer();
                    await db.registerFileBuffer('torrents.csv', new Uint8Array(csvBuffer));

                    await conn.query(`CREATE TABLE torrents AS SELECT * FROM read_csv_auto('torrents.csv');`);
                    loader.classList.add('hidden');
                    statusBadge.textContent = 'CSV Fallback (Dev)';
                    performSearch('');
                } else {
                    throw new Error('CSV file not found');
                }
            } catch (csvErr) {
                console.error('CSV fallback failed:', csvErr);
                statusBadge.textContent = 'Error Loading Data';
                statusBadge.style.color = '#f43f5e';
                loader.classList.add('hidden');
            }
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

    let sql;
    if (query.trim() === '') {
        // Show top 5 most downloaded torrents when search is empty
        sql = 'SELECT * FROM torrents ORDER BY completed DESC, seeders DESC LIMIT 5';
    } else {
        // Search directly what the user typed
        const searchTerm = query.trim();
        sql = `
            SELECT * FROM torrents 
            WHERE name ILIKE '%${searchTerm.replace(/'/g, "''")}%' 
            OR infohash ILIKE '%${searchTerm}%'
            ORDER BY seeders DESC 
            LIMIT 50
        `;
    }

    const startTime = performance.now();
    const result = await conn.query(sql);
    const endTime = performance.now();
    const rows = result.toArray();

    renderResults(rows, endTime - startTime, query.trim() === '');
}

function renderResults(rows, duration, isTopTorrents = false) {
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
                <h3 class="text-truncate" title="${obj.name}">${obj.name}</h3>
                <div class="stats">
                    <span class="size">${sizeGB} GB</span>
                    <span class="seeders">S: ${obj.seeders}</span>
                    <span class="leechers">L: ${obj.leechers}</span>
                </div>
            </div>
            <a href="${magnet}" class="magnet-btn">Magnet</a>
        `;
        resultsContainer.appendChild(card);
    });
}

// Event Listeners
searchInput.addEventListener('input', (e) => {
    performSearch(e.target.value);
});

init();
