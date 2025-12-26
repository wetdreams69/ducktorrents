import fs from 'node:fs';
import path from 'node:path';

const infohash = process.argv[2];
const name = process.argv[3];
const size = process.argv[4] || 0;

if (!infohash || !name) {
    console.error('Usage: node scripts/add-torrent.js <infohash> <name> [size_bytes]');
    process.exit(1);
}

const files = fs.readdirSync(process.cwd())
    .filter(f => f.startsWith('torrents_part_') && f.endsWith('.csv'))
    .sort((a, b) => {
        const numA = parseInt(a.match(/\d+/)[0]);
        const numB = parseInt(b.match(/\d+/)[0]);
        return numA - numB;
    });

if (files.length === 0) {
    console.error('No torrents_part_*.csv files found.');
    process.exit(1);
}

const MAX_PART_SIZE = 25 * 1024 * 1024; // 25MB
let lastFile = files[files.length - 1];
let filePath = path.resolve(process.cwd(), lastFile);

// Check if we need to start a new part
const stats = fs.statSync(filePath);
if (stats.size > MAX_PART_SIZE) {
    const lastNum = parseInt(lastFile.match(/\d+/)[0]);
    const nextNum = lastNum + 1;
    lastFile = `torrents_part_${nextNum}.csv`;
    filePath = path.resolve(process.cwd(), lastFile);

    // Create new file with header
    const header = "infohash;name;size_bytes;created_unix;seeders;leechers;completed;scraped_date\n";
    fs.writeFileSync(filePath, header);
    console.log(`🚀 Created new part: ${lastFile}`);
}

// default stats
const created = Math.floor(Date.now() / 1000);
const seeders = 0;
const leechers = 0;
const completed = 0;
const scraped_date = created;

// Format: infohash;name;size_bytes;created_unix;seeders;leechers;completed;scraped_date
const newLine = `${infohash};${name};${size};${created};${seeders};${leechers};${completed};${scraped_date}\n`;

fs.appendFileSync(filePath, newLine);

console.log(`✅ Added torrent to ${lastFile}`);
