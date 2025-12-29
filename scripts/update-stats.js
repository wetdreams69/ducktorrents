import fs from 'node:fs';
import path from 'node:path';
// @ts-expect-error - Metadata extraction library
import bittorrentTracker from 'bittorrent-tracker';

const TRACKERS = [
    'udp://tracker.opentrackr.org:1337/announce',
    'udp://open.stealth.si:80/announce',
    'udp://tracker.torrent.eu.org:451/announce',
    'udp://exodus.desync.com:6969/announce',
    'udp://tracker.moeking.me:6969/announce',
    'udp://opentracker.i2p.rocks:6969/announce',
    'udp://tracker.bitsearch.to:1337/announce',
    'udp://tracker.tiny-vps.com:6969/announce',
    'udp://tracker.openbittorrent.com:6969/announce'
];

const BATCH_SIZE = 50; // Torrents por cada petición al tracker
const CONCURRENCY = 10; // Peticiones simultáneas (Total: BATCH_SIZE * CONCURRENCY = 500 torrents)

async function scrapeBatch(infoHashes, tracker) {
    return new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(null), 8000);
        try {
            const buffers = infoHashes.map(h => Buffer.from(h, 'hex'));
            bittorrentTracker.scrape({ infoHash: buffers, announce: tracker }, (err, results) => {
                clearTimeout(timeout);
                if (err || !results) return resolve(null);
                // results es un objeto donde la llave es el infohash en hex (minúsculas)
                resolve(results);
            });
        } catch (e) {
            clearTimeout(timeout);
            resolve(null);
        }
    });
}

async function run() {
    const files = fs.readdirSync(process.cwd())
        .filter(f => f.startsWith('torrents_part_') && f.endsWith('.csv'))
        .sort((a, b) => {
            const numA = parseInt(a.match(/\d+/)[0]);
            const numB = parseInt(b.match(/\d+/)[0]);
            return numA - numB;
        });

    if (files.length === 0) {
        console.log('No torrents_part_*.csv files found.');
        return;
    }

    for (const csvFile of files) {
        const csvPath = path.resolve(process.cwd(), csvFile);
        console.log(`\n📦 Processing ${csvFile}...`);

        const content = fs.readFileSync(csvPath, 'utf8');
        const lines = content.trim().split('\n');
        if (lines.length <= 1) continue;

        const header = lines[0];
        const dataLines = lines.slice(1);
        const total = dataLines.length;

        console.log(`Checking ${total} torrents using Batch Scraping (Batch: ${BATCH_SIZE}, Parallel: ${CONCURRENCY})...`);

        const updatedLines = new Array(total).fill(null);
        let processed = 0;
        let dead = 0;
        let alive = 0;
        let failed = 0;

        const processBatch = async (startIndex) => {
            const batchIndices = [];
            const batchHashes = [];

            for (let i = 0; i < BATCH_SIZE && (startIndex + i) < total; i++) {
                const idx = startIndex + i;
                const line = dataLines[idx];
                const infohash = line.split(';')[0];
                if (infohash) {
                    batchIndices.push(idx);
                    batchHashes.push(infohash);
                }
            }

            if (batchHashes.length === 0) return;

            // Consultar todos los trackers para este batch
            const trackerPromises = TRACKERS.map(t => scrapeBatch(batchHashes, t));
            const allTrackerResults = await Promise.all(trackerPromises);

            // Consolidar resultados por infohash
            batchIndices.forEach((lineIdx, i) => {
                const hash = batchHashes[i].toLowerCase();
                let maxS = 0;
                let maxL = 0;
                let anySuccess = false;

                allTrackerResults.forEach(res => {
                    if (res && res[hash]) {
                        maxS = Math.max(maxS, res[hash].complete || 0);
                        maxL = Math.max(maxL, res[hash].incomplete || 0);
                        anySuccess = true;
                    }
                });

                const originalLine = dataLines[lineIdx];
                if (!anySuccess) {
                    failed++;
                    updatedLines[lineIdx] = originalLine;
                } else if (maxS > 0 || maxL > 0) {
                    alive++;
                    const parts = originalLine.split(';');
                    // infohash;name;size;created;s;l;c;date
                    parts[4] = maxS;
                    parts[5] = maxL;
                    parts[7] = Math.floor(Date.now() / 1000);
                    updatedLines[lineIdx] = parts.join(';');
                } else {
                    dead++;
                    updatedLines[lineIdx] = null; // Marcar para borrar
                }
            });

            processed += batchIndices.length;
            if (processed % 100 === 0 || processed >= total) {
                const percent = ((processed / total) * 100).toFixed(2);
                process.stdout.write(`\r🚀 Progress: ${percent}% (${processed}/${total}) | Alive: ${alive} | Dead: ${dead} | Failed: ${failed}   `);
            }
        };

        // Ejecutar batches con concurrencia controlada
        for (let i = 0; i < total; i += (BATCH_SIZE * CONCURRENCY)) {
            const parallelBatches = [];
            for (let j = 0; j < CONCURRENCY; j++) {
                const start = i + (j * BATCH_SIZE);
                if (start < total) {
                    parallelBatches.push(processBatch(start));
                }
            }
            await Promise.all(parallelBatches);
        }

        console.log(`\nWriting updated ${csvFile}...`);
        const finalLines = [header, ...updatedLines.filter(l => l !== null)];
        fs.writeFileSync(csvPath, finalLines.join('\n') + '\n');
    }

    console.log('\n✅ All files updated.');
}

run().then(() => {
    process.exit(0);
}).catch(err => {
    console.error(err);
    process.exit(1);
});

