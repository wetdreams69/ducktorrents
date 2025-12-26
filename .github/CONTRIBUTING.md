Thank you for your interest in contributing! This project is built to be serverless and community-driven. Adding new torrents is easy.

## How to add new torrents

### Method 1: GitHub Web Interface (Easiest)

1. **Fork** the repository to your own account.
2. Navigate to the latest `torrents_part_N.csv` file (the one with the highest number).
3. Click the **Edit** icon (pencil).
4. Scroll to the bottom and add your torrent following this format:
   ```csv
   infohash;name;size_bytes;created_unix;seeders;leechers;completed;scraped_date
   ```
   **Example entry:**
   ```csv
   00001389eaf0f351d327bde79e9a3ca2fc85c851;Example Torrent Name;1181647367;1588176060;10;0;635;1590740560
   ```
   *Note: Use semicolons (`;`) as delimiters. You can set seeders/leechers to 0; our weekly bot will update them automatically.*
5. **Commit changes** and create a **Pull Request**.

### Method 2: Command Line (For bulk/local developers)

1. **Fork and Clone** the repository:
   ```bash
   git clone https://github.com/YOUR_USERNAME/ssr.git
   cd ssr
   ```
2. Use the provided helper script to add a torrent (it automatically finds the right file):
   ```bash
   node scripts/add-torrent.js "YOUR_INFOHASH" "Torrent Name" 123456789
   ```
3. **Commit and Push**:
   ```bash
   git add .
   git commit -m "feat: add [torrent name]"
   git push origin main
   ```
4. Create a **Pull Request** on GitHub.

## Guidelines

- **Format**: Always use semicolon (`;`) as the separator.
- **Accuracy**: Ensure the `infohash` is correct (40 character hex string).
- **Files**: Do not modify `torrents.parquet` manually. It is automatically built by GitHub Actions when your CSV changes are merged.
- **Dead Torrents**: Don't worry about seeders. If a torrent is dead, our weekly cleanup bot will remove it eventually.

## What happens next?

Once your PR is merged:
1. GitHub Actions will trigger a build.
2. The `torrents.parquet` database will be updated.
3. The search engine will reflect your changes within minutes.

Thank you for keeping the library growing! 🚀
