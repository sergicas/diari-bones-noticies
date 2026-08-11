#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { createWriteStream } = require('fs');
const archiver = require('archiver');

// Create output directory if it doesn't exist
const outputDir = path.join(__dirname, '..', 'dist');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Create output file stream
const output = createWriteStream(path.join(outputDir, 'diari-bones-noticies.zip'));

// Create archiver instance
const archive = archiver('zip', {
  zlib: { level: 9 } // Maximum compression
});

// Handle stream events
output.on('close', () => {
  console.log(`✓ ZIP file created successfully: ${archive.pointer()} bytes`);
  console.log(`✓ Location: ${path.join(outputDir, 'diari-bones-noticies.zip')}`);
});

archive.on('error', (err) => {
  throw err;
});

// Pipe archive to output
archive.pipe(output);

// Get the root directory
const rootDir = path.join(__dirname, '..');

// Files and directories to exclude
const excludePatterns = [
  'node_modules',
  '.git',
  'dist',
  '.DS_Store',
  'ios/App/Pods',
  'ios/Podfile.lock'
];

// Add files to archive
const addFilesRecursive = (dir, archivePath) => {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const relativePath = path.relative(rootDir, filePath);
    
    // Check if file should be excluded
    const shouldExclude = excludePatterns.some(pattern => 
      relativePath.includes(pattern)
    );
    
    if (shouldExclude) {
      return;
    }
    
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      addFilesRecursive(filePath, path.join(archivePath, file));
    } else {
      archive.file(filePath, { name: path.join(archivePath, file) });
    }
  });
};

console.log('Creating ZIP file...');
addFilesRecursive(rootDir, 'diari-bones-noticies');

archive.finalize();
