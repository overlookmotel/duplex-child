/* --------------------
 * duplex-child module
 * Writable side
 * ------------------*/

'use strict';

// Symbols
const STREAM = Symbol(),
	WRITE_CALLBACK = Symbol(),
	STASHED_BUFFER = Symbol(),
	STASHED_CALLBACK = Symbol();

// Exports
module.exports = {
	init,
	spawn,
	destroy,
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
	duplex[WRITE_CALLBACK] = undefined;
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
	// Register event handlers on stdin
	const {stdin} = duplex.process;
	stdin[STREAM] = duplex;
	stdin.on('drain', onStdinDrain);
	stdin.on('error', onStdinError);

	// If data written already, write it to stdin
	writeStashedInput(duplex);
}

/**
 * Called on destroy
 * @param {Object} duplex - Stream object
 * @returns {undefined}
 */
function destroy(duplex) {
	// TODO Write this properly - what happens when you destroy a ZLIB stream?
	// TODO Call this func from within 'index.js'
	const cb = duplex[WRITE_CALLBACK];
	if (!cb) return;
	duplex[WRITE_CALLBACK] = undefined;
	cb(new Error('Stream destroyed'));
}

/**
 * Called on close
 * @param {Object} duplex - Stream object
 * @returns {undefined}
 */
function cleanup(duplex) {
	duplex[WRITE_CALLBACK] = undefined;
	clearStashedInput(duplex);

	duplex.removeListener('prefinish', onPrefinish);

	const {process} = duplex;
	if (!process) return;

	const {stdin} = process;
	stdin.removeListener('drain', onStdinDrain);
	stdin.removeListener('error', onStdinError);
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

/*
 * Write implementation
 */
function writeStdin(duplex, chunk, cb) {
	// Write to stdin
	const {stdin} = duplex.process;
	console.log('calling stdin.write()');
	const keepWriting = stdin.write(chunk);
	console.log('keepWriting:', keepWriting);

	// If stdin happy to receive more, callback
	if (keepWriting) return cb(null);

	// Stdin needs to drain - callback only once drained or stdin errors
	console.log('waiting for stdin drain before writing more');
	duplex[WRITE_CALLBACK] = cb;
}

function endStdin(duplex, cb) {
	console.log('calling stdin.end()');
	duplex.process.stdin.end();
	cb();
}

function onStdinDrain() {
	console.log('onStdinDrain() called');
	const duplex = this[STREAM]; // jshint ignore:line
	writeDone(duplex);
}

function onStdinError(err) {
	console.log('onStdinError() called');
	const duplex = this[STREAM]; // jshint ignore:line
	writeDone(duplex, err);
	// TODO Should error also be emitted on duplex stream?
	// What is effect of calling back with error here?
}

function writeDone(duplex, err) {
	const cb = duplex[WRITE_CALLBACK];
	if (!cb) return;

	duplex[WRITE_CALLBACK] = undefined;

	cb(err);
}

/*
 * Input stashing
 * Input is stashed if stream is written to before process is spawned.
 * Nowhere to write data to so it is stashed until process is ready to receive.
 */
function stashInput(duplex, chunk, cb) {
	console.log(`stashing input ${chunk ? `${chunk.length} bytes` : 'end'}`);
	duplex[STASHED_BUFFER] = chunk;
	duplex[STASHED_CALLBACK] = cb;
}

function writeStashedInput(duplex) {
	const cb = duplex[STASHED_CALLBACK];
	if (!cb) return;

	const chunk = duplex[STASHED_BUFFER];
	console.log(`unstashing input ${chunk ? `${chunk.length} bytes` : 'end'}`);
	clearStashedInput(duplex);

	if (chunk) {
		writeStdin(duplex, chunk, cb);
	} else {
		endStdin(duplex, cb);
	}
}

function clearStashedInput(duplex) {
	duplex[STASHED_BUFFER] = undefined;
	duplex[STASHED_CALLBACK] = undefined;
}

function noop() {}
