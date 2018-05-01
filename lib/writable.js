/* --------------------
 * duplex-child module
 * Writable side
 * ------------------*/

'use strict';

// Symbols
const WRITEABLE_BUFFER = Symbol(),
	WRITEABLE_CALLBACK = Symbol();

// Exports
module.exports = {
	init,
	spawn,
	cleanup,
	_write,
	_final
};

/**
 * Called within constructor
 * @param {Object} duplex - Stream object
 * @returns {undefined}
 */
function init(duplex) {
	// If `._final()` not supported natively (before Node 8.0.0), call it on 'prefinish' event
	// NB 'prefinish' event only fires once `._write()` has called back
	if (duplex._writableState.finalCalled == null) duplex.once('prefinish', onPrefinish);

	// Init
	clearStashedInput(duplex);
}

function onPrefinish() {
	// jshint validthis:true
	this._final(noop);
}

/**
 * Called after spawn
 * @param {Object} duplex - Stream object
 * @returns {undefined}
 */
function spawn(duplex) {
	// If data written already, write it to stdin
	writeStashedInput(duplex);
}

/**
 * Called on close
 * @param {Object} duplex - Stream object
 * @returns {undefined}
 */
function cleanup(duplex) {
	clearStashedInput(duplex);

	duplex.removeListener('prefinish', onPrefinish);

	const {process} = duplex;
	if (!process) return;

	const {stdin} = duplex.process;
	stdin.removeAllListeners('drain');
	stdin.removeAllListeners('error');
	// TODO Remove individual listeners instead of all
}

/**
 * `._write()` prototype method
 * @param {Buffer} chunk
 * @param {String} encoding - Should always be `null`
 * @param {Function} cb
 * @returns {undefined}
 */
function _write(chunk, encoding, cb) { // jshint ignore:line
	console.log(`_write() called: ${chunk.length} bytes`);
	// jshint validthis:true
	// If process not spawned yet, cache input and callback
	// Will be fed to stdin once spawned and callback called then
	if (!this.process) return stashInput(this, chunk, cb);

	// Write to stdin
	writeStdin(this, chunk, cb);
}

/**
 * `._final()` prototype method
 * @param {Function} cb
 * @returns {undefined}
 */
function _final(cb) {
	console.log('_final() called');
	// jshint validthis:true
	// If process not spawned yet, cache callback
	// Will be fed to stdin once spawned and callback called then
	if (!this.process) return stashInput(this, null, cb);

	// Write to stdin
	endStdin(this, cb);
}

function writeStdin(duplex, chunk, cb) {
	// Write to stdin
	const {stdin} = duplex.process;
	console.log('calling stdin write');
	const keepWriting = stdin.write(chunk);
	console.log('keepWriting:', keepWriting);

	// If stdin happy to receive more, callback
	if (keepWriting) return cb(null);

	// Stdin needs to drain - callback only once drained or stdin errors
	// TODO Move listeners to be global rather than adding and removing
	function done(err) {
		stdin.removeListener('drain', done);
		stdin.removeListener('error', done);
		cb(err ? err : null);
	}

	console.log('waiting for stdin drain before writing more');
	stdin.on('drain', done);
	stdin.on('error', done);
}

function endStdin(duplex, cb) {
	console.log('calling stdin end');
	duplex.process.stdin.end();
	cb();
}

function stashInput(duplex, chunk, cb) {
	console.log(`stashing input ${chunk ? `${chunk.length} bytes` : 'end'}`);
	duplex[WRITEABLE_BUFFER] = chunk;
	duplex[WRITEABLE_CALLBACK] = cb;
}

function writeStashedInput(duplex) {
	const cb = duplex[WRITEABLE_CALLBACK];
	if (!cb) return;

	const chunk = duplex[WRITEABLE_BUFFER];
	console.log(`unstashing input ${chunk ? `${chunk.length} bytes` : 'end'}`);
	clearStashedInput(duplex);

	if (chunk) {
		writeStdin(duplex, chunk, cb);
	} else {
		endStdin(duplex, cb);
	}
}

function clearStashedInput(duplex) {
	duplex[WRITEABLE_BUFFER] = undefined;
	duplex[WRITEABLE_CALLBACK] = undefined;
}

function noop() {}
