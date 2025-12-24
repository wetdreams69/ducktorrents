import fs from 'node:fs';
import path from 'node:path';
// @ts-expect-error - Metadata extraction library
import bittorrentTracker from 'bittorrent-tracker';

const csvPath = path.resolve(process.cwd(), 'torrents.csv');
const TRACKERS = [
    'udp://tracker.opentrackr.org:1337/announce',
    'udp://open.stealth.si:80/announce',
    'udp://tracker.torrent.eu.org:451/announce',
    'udp://exodus.desync.com:6969/announce'
];

async function scrape(infoHash) {
    return new Promise((resolve) => {
        const timeout = setTimeout(() => resolve({ s: 0, l: 0 }), 10000);
        try {
            bittorrentTracker.scrape({ infoHash, announce: TRACKERS }, (err, results) => {
                clearTimeout(timeout);
                if (err || !results) return resolve({ s: 0, l: 0 });
                let maxS = 0, maxL = 0;
                Object.values(results).forEach(res => {
                    if (res) {
                        maxS = Math.max(maxS, res.complete || 0);
                        maxL = Math.max(maxL, res.incomplete || 0);
                    }
                });
                resolve({ s: maxS, l: maxL });
            });
        } catch (e) {
            clearTimeout(timeout);
            resolve({ s: 0, l: 0 });
        }
    });
}

async function run() {
    if (!fs.existsSync(csvPath)) return;

    const content = fs.readFileSync(csvPath, 'utf8');
    const lines = content.trim().split('\n');
    const header = lines[0];
    const dataLines = lines.slice(1);

    console.log(`Checking ${dataLines.length} torrents...`);
    const updatedLines = [];

    for (const line of dataLines) {
        const [infohash, name, size, s, l, c, date] = line.split(',');
        const stats = await scrape(infohash);

        if (stats.s > 0) {
            // Update with fresh stats and date
            updatedLines.push([infohash, name, size, stats.s, stats.l, c, new Date().toISOString()].join(','));
            console.log(`✅ ${name} is alive (S: ${stats.s})`);
        } else {
            console.log(`🗑️ ${name} is dead. Removing.`);
        }
    }

    const finalContent = [header, ...updatedLines].join('\n') + '\n';
    fs.writeFileSync(csvPath, finalContent);
    console.log('Update complete.');
}

run();
