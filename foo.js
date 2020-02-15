'use strict';

const fs = require('fs');
const pathJoin = require('path').join;
const DuplexChild = require('./lib/');

const pathIn = pathJoin(__dirname, 'test/files/'),
	pathOut = pathJoin(__dirname, 'test/filesOut/');

const filename = '100KB.txt';

console.log(`test with file: ${filename}`);

console.log('creating DuplexChild');
const cat = new DuplexChild();
console.log('spawning');
cat.spawn('cat');
console.log('spawned');

const input = fs.createReadStream(pathIn + filename);
const output = fs.createWriteStream(pathOut + filename);

console.log('piping input');
input.pipe(cat);
console.log('piped input');

console.log('piping output');
cat.pipe(output);
console.log('piped output');
