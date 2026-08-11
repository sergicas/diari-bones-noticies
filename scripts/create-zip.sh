#!/bin/bash

# Create ZIP file of the repository using git archive
cd "$(dirname "$0")/.."

# Use git to create a clean archive - this is more reliable
git archive --format=zip --output="diari-bones-noticies.zip" HEAD

echo "✓ ZIP file created: diari-bones-noticies.zip"
ls -lh diari-bones-noticies.zip
