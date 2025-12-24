#!/bin/bash
cd "$(dirname "$0")/.."

echo "Downloading DuckDB CLI..."
wget -q https://github.com/duckdb/duckdb/releases/download/v1.1.3/duckdb_cli-linux-amd64.zip
unzip -q duckdb_cli-linux-amd64.zip
chmod +x ./duckdb

echo "Converting CSV to Parquet..."
./duckdb -c "COPY (SELECT * FROM read_csv_auto('torrents.csv', ignore_errors=true)) TO 'torrents.parquet' (FORMAT PARQUET, COMPRESSION ZSTD);"


echo "Cleaning up..."
rm duckdb_cli-linux-amd64.zip duckdb

echo "✅ Parquet file created successfully!"
