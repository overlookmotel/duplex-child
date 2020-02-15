'use strict';

const fs = require('fs');
const pathJoin = require('path').join;

const path = pathJoin(__dirname, 'test/files/');

console.log('path:', path);

function makeFile(path, length, cb) {
	const stream = fs.createWriteStream(path);

	for (let i = 0; i < length / 10; i++) {
		let line = `${i}\n`;
		line = '0'.repeat(10 - line.length) + line;

		stream.write(line, 'utf8');
	}

	stream.end(cb);
}

makeFile(path + '1KB.txt', 1000);
makeFile(path + '10KB.txt', 10 * 1000);
makeFile(path + '100KB.txt', 100 * 1000);
makeFile(path + '1MB.txt', 1000 * 1000);
makeFile(path + '10MB.txt', 10 * 1000 * 1000);
