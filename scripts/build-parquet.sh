#!/bin/bash
cd "$(dirname "$0")/.."

echo "Downloading DuckDB CLI..."
wget -q https://github.com/duckdb/duckdb/releases/download/v1.1.3/duckdb_cli-linux-amd64.zip
unzip -q duckdb_cli-linux-amd64.zip
chmod +x ./duckdb

echo "Converting CSV parts to Parquet..."

# Build SQL query to union all CSV parts
sql_query="COPY (SELECT * FROM ("

first=true
for csv_file in torrents_part_*.csv; do
    if [ -f "$csv_file" ]; then
        if [ "$first" = true ]; then
            sql_query="${sql_query}SELECT * FROM read_csv_auto('${csv_file}', ignore_errors=true)"
            first=false
        else
            sql_query="${sql_query} UNION ALL SELECT * FROM read_csv_auto('${csv_file}', ignore_errors=true)"
        fi
    fi
done

sql_query="${sql_query})) TO 'torrents.parquet' (FORMAT PARQUET, COMPRESSION ZSTD);"

echo "Executing DuckDB query..."
./duckdb -c "$sql_query"

echo "Cleaning up..."
rm duckdb_cli-linux-amd64.zip duckdb

echo "✅ Parquet file created successfully from CSV parts!"
