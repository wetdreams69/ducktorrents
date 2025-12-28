import fs from 'node:fs';
import path from 'node:path';
// @ts-expect-error - Metadata extraction library
import bittorrentTracker from 'bittorrent-tracker';

const TRACKERS = [
    'udp://tracker.opentrackr.org:1337/announce',
    'udp://open.stealth.si:80/announce',
    'udp://tracker.torrent.eu.org:451/announce',
    'udp://exodus.desync.com:6969/announce'
];

const BATCH_SIZE = 50;
const CONCURRENCY = 15;
const SCRAPE_TIMEOUT = 10000;

async function scrapeBatch(infoHashes) {
    return new Promise((resolve) => {
        const resultsMap = new Map();
        infoHashes.forEach(h => {
            resultsMap.set(h.toLowerCase(), { s: 0, l: 0 });
        });

        const timeout = setTimeout(() => {
            resolve(resultsMap);
        }, SCRAPE_TIMEOUT + 2000);

        try {
            bittorrentTracker.scrape({ infoHash: infoHashes, announce: TRACKERS }, (err, results) => {
                clearTimeout(timeout);
                if (err || !results) return resolve(resultsMap);

                // results is { [trackerUrl]: trackerData }
                for (const trackerData of Object.values(results)) {
                    if (!trackerData) continue;
                    
                    // bittorrent-tracker returns results keyed by infohash if multiple hashes were requested
                    // Note: keys might be hex strings or binary hashes depending on the library version
                    // and how it was called, but for node-bittorrent-tracker it's usually hex strings.
                    for (const [hash, stats] of Object.entries(trackerData)) {
                        const h = hash.toLowerCase();
                        if (resultsMap.has(h)) {
                            const current = resultsMap.get(h);
                            current.s = Math.max(current.s, stats.complete || 0);
                            current.l = Math.max(current.l, stats.incomplete || 0);
                        }
                    }
                }
                resolve(resultsMap);
            });
        } catch (e) {
            clearTimeout(timeout);
            resolve(resultsMap);
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

    const startTime = Date.now();
    let totalRemoved = 0;

    for (const csvFile of files) {
        const csvPath = path.resolve(process.cwd(), csvFile);
        console.log(`\nProcessing ${csvFile}...`);

        const content = fs.readFileSync(csvPath, 'utf8');
        const lines = content.trim().split('\n');
        if (lines.length <= 1) continue;

        const header = lines[0];
        const dataLines = lines.slice(1);
        const totalInFile = dataLines.length;
        
        console.log(`Checking ${totalInFile} torrents in ${csvFile}...`);
        const updatedLines = [];

        // Split into batches
        const batches = [];
        for (let i = 0; i < dataLines.length; i += BATCH_SIZE) {
            batches.push(dataLines.slice(i, i + BATCH_SIZE));
        }

        let processedInFile = 0;

        // Process batches with concurrency
        for (let i = 0; i < batches.length; i += CONCURRENCY) {
            const currentBatches = batches.slice(i, i + CONCURRENCY);
            
            await Promise.all(currentBatches.map(async (batch) => {
                const batchEntries = batch.map(line => {
                    const parts = line.split(';');
                    return { line, infohash: parts[0], name: parts[1], parts };
                }).filter(e => e.infohash);

                const infoHashes = batchEntries.map(e => e.infohash);
                if (infoHashes.length === 0) return;

                const batchResults = await scrapeBatch(infoHashes);

                for (const entry of batchEntries) {
                    const stats = batchResults.get(entry.infohash.toLowerCase());
                    if (stats && stats.s > 0) {
                        // Update with fresh stats and date
                        // Format: infohash;name;size_bytes;created_unix;seeders;leechers;completed;scraped_date
                        const p = entry.parts;
                        p[4] = stats.s; // seeders
                        p[5] = stats.l; // leechers
                        p[7] = Math.floor(Date.now() / 1000); // date
                        updatedLines.push(p.join(';'));
                    } else {
                        totalRemoved++;
                    }
                }
                
                processedInFile += batch.length;
            }));

            const percentage = ((processedInFile / totalInFile) * 100).toFixed(1);
            process.stdout.write(`\rProgress: ${processedInFile}/${totalInFile} (${percentage}%) - Removed so far: ${totalRemoved}   `);
        }

        const finalContent = [header, ...updatedLines].join('\n') + '\n';
        fs.writeFileSync(csvPath, finalContent);
        console.log(`\nFinished ${csvFile}. New size: ${updatedLines.length} torrents.`);
    }

    const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(2);
    console.log(`\nAll files updated in ${duration} minutes.`);
    console.log(`Total removed: ${totalRemoved} dead torrents.`);
}

run();
