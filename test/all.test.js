/* --------------------
 * duplex-child module
 * Tests
 * ------------------*/

'use strict';

// Modules
const chai = require('chai'),
	{expect} = chai,
	fs = require('fs'),
	pathJoin = require('path').join,
	DuplexChild = require('../lib/');

// Init
chai.config.includeStack = true;

// Tests
const pathIn = pathJoin(__dirname, 'files'),
	pathOut = pathJoin(__dirname, 'filesOut');

/* jshint expr: true */
/* global describe, it */

describe('Tests', function() {
	it('check', function(cb) {
		const filename = '100KB.txt';

		console.log(`test with file: ${filename}`);

		console.log('creating DuplexChild');
		const cat = new DuplexChild();
		console.log('spawning');
		cat.spawn('cat');
		console.log('spawned');

		const input = fs.createReadStream(pathJoin(pathIn, filename)),
			output = fs.createWriteStream(pathJoin(pathOut, filename));

		console.log('piping input');
		input.pipe(cat);
		console.log('piped input');

		console.log('piping output');
		cat.pipe(output);
		console.log('piped output');

		expect(true).to.be.true;

		output.on('close', cb);
	});
});
