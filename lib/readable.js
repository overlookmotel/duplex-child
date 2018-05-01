/* --------------------
 * duplex-child module
 * Readable side
 * ------------------*/

'use strict';

// Imports
const {ENDED, DONE} = require('./symbols');

// Symbols
const STREAM = Symbol(),
	READING = Symbol(),
	READABLE_REQUESTED = Symbol();

// Exports
module.exports = {
	init,
	spawn,
	cleanup,
	_read
};

/**
 * Called within constructor
 * @param {Object} duplex - Stream object
 * @returns {undefined}
 */
function init(duplex) {
	// Init
	duplex[READING] = false;
	duplex[ENDED] = false;
	clearStashedOutput(duplex);
}

/**
 * Called after spawn
 * @param {Object} duplex - Stream object
 * @returns {undefined}
 */
function spawn(duplex) {
	const {stdout} = duplex.process;
	stdout[STREAM] = duplex;

	// stdout handlers
	stdout.on('end', onEnd);
	stdout.on('error', onEnd);

	// If data requested already, read from stdout
	readStashedOutput(duplex);
}

/**
 * Called on close
 * @param {Object} duplex - Stream object
 * @returns {undefined}
 */
function cleanup(duplex) {
	clearStashedOutput(duplex);

	const {process} = duplex;
	if (!process) return;

	const {stdout} = duplex.process;
	stdout.removeListener('end', onEnd);
	stdout.removeListener('error', onEnd);
}

function onEnd() {
	 // TODO Change this to handle error
	// Called on stdout if 'end' or 'error' event emitted
	const duplex = this[STREAM]; // jshint ignore:line

	// Flag as ended
	duplex[ENDED] = true;

	// End
	duplex[DONE]();
}

function _read(size) {
	console.log(`_read() called: size ${size}`);
	// jshint validthis:true
	// If process not started yet, stash read request
	if (!this.process) return stashOutput(this, size);

	// Read from stdout
	readStdout(this, size);
}

function readStdout(duplex, size) {
	console.log('------------');
	console.log(`readStdout() called: size ${size}`);

	// If currently reading, exit
	if (duplex[READING]) {
		console.log('ANOTHER CALL TO READ BEFORE READING COMPLETED');
		return;
	}

	// If stdout ended, exit
	if (duplex[ENDED]) return;

	// Read from stdout until exhausted or readable side doesn't want any more
	duplex[READING] = true;
	const {stdout} = duplex.process;

	while (true) {
		// Read from stdout
		console.log(`calling stdout read: size ${size}`);
		const data = stdout.read(size);
		console.log(`read ${data == null ? data : `${data.length} bytes`}`);

		// No data available - wait for more
		if (!data) break;

		// Data returned - push out of stream
		console.log(`calling duplex push: ${data.length} bytes`);
		const wantsMore = duplex.push(data);
		console.log('wantsMore:', wantsMore);

		// If readable side of stream does not want more, exit
		if (!wantsMore) {
			duplex[READING] = false;
			return;
		}
	}

	duplex[READING] = false;

	// Need more data - wait until readable again
	console.log('listening for stdout readable');
	stdout.once('readable', () => {
		console.log(`stdout readable - reading again: size ${size}`);
		readStdout(duplex, size);
	});
}

function stashOutput(duplex, size) {
	duplex[READABLE_REQUESTED] = size;
}

function readStashedOutput(duplex) {
	const size = duplex[READABLE_REQUESTED];
	if (size === undefined) return;

	clearStashedOutput(duplex);

	readStdout(duplex, size);
}

function clearStashedOutput(duplex) {
	duplex[READABLE_REQUESTED] = undefined;
}
