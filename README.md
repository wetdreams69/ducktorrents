# DuckTorrents

🦆 **Serverless Torrent Search Engine** powered by DuckDB-WASM

## Features

- 🚀 **Blazing Fast**: Client-side search using DuckDB-WASM
- 🔒 **Private**: All searches happen in your browser
- 📦 **Serverless**: No backend required, runs entirely on GitHub Pages
- 💾 **Efficient**: Parquet format for optimal data compression
- 📱 **PWA**: Install as a native app on any device
- 🌐 **Offline Support**: Works without internet after first load

## How It Works

1. **Data Source**: Torrents are stored in `torrents.csv`
2. **Build Process**: GitHub Actions converts CSV to optimized Parquet format
3. **Client-Side Engine**: DuckDB-WASM loads and queries data in your browser
4. **Smart Caching**: Service Worker caches data for instant subsequent loads

## Contributing

Want to add a torrent? Simply:

1. Fork this repository
2. Add your torrent to the last `torrents_part_N.csv` file:
   ```csv
   infohash;name;size_bytes;created_unix;seeders;leechers;completed;scraped_date
   YOUR_INFOHASH;Torrent Name;1234567890;1735221072;0;0;0;1735221072
   ```
   *Note: Use `;` as delimiter.*
3. Submit a Pull Request

The GitHub Action will automatically:
- Validate your submission
- Convert CSV to Parquet
- Update the live site

## Weekly Maintenance

A scheduled workflow runs every Sunday to:
- Check torrent health (seeders/leechers)
- Remove dead torrents (0 seeders)
- Update stats for active torrents

## Local Development

```bash
# Install dependencies (optional, only for http-server)
npm install

# Start local server
npm run dev

# Build parquet file locally
bash scripts/build-parquet.sh
```

## Tech Stack

- **DuckDB-WASM**: In-browser analytical database
- **Parquet**: Columnar storage format
- **Service Workers**: Offline support and caching
- **GitHub Actions**: Automated CI/CD pipeline

## License

GNU Affero General Public License v3.0 or later

---

Made with 🦆 and ❤️
