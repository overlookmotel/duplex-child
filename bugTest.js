'use strict';

const {Readable} = require('stream');

const stream = new Readable();

let called = false;
stream._read = function(size) {
	console.log(`_read() called: ${size} bytes`);

	if (called) return this.push(null);
	called = true;

	const wantsMore = this.push( Buffer.alloc(1000, 'a') );
	console.log(`wantsMore: ${wantsMore}`);
};

stream.resume();
