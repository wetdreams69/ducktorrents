#!/bin/bash
# Script to split large CSV into chunks under 20MB

INPUT_FILE="../torrents.csv"
OUTPUT_PREFIX="torrents_part_"
CHUNK_SIZE=200000  # Number of lines per chunk (adjust based on your data)

# Check if input file exists
if [ ! -f "$INPUT_FILE" ]; then
    echo "Error: $INPUT_FILE not found"
    exit 1
fi

# Get header
header=$(head -n 1 "$INPUT_FILE")

# Split the file (excluding header)
tail -n +2 "$INPUT_FILE" | split -l $CHUNK_SIZE - temp_chunk_

# Add header to each chunk and rename
counter=1
for chunk in temp_chunk_*; do
    output_file="${OUTPUT_PREFIX}${counter}.csv"
    echo "$header" > "$output_file"
    cat "$chunk" >> "$output_file"
    rm "$chunk"
    
    size=$(du -h "$output_file" | cut -f1)
    echo "Created $output_file (Size: $size)"
    
    counter=$((counter + 1))
done

echo "✅ CSV split into $((counter - 1)) parts"
