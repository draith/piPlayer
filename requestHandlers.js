var omx = require('omx-manager');
var fs = require('fs');
var util = require('util');
var radioOn = true;
var plist = [];

function stop() {
	console.log("Request handler 'stop' was called.");
	console.log("Status = " + util.inspect(omx.getStatus()));
	plist = [];
	if (omx.isPlaying())
	{
		try
		{
			omx.stop();
		}
		catch (err)
		{
			console.log('Caught error: ' + err.message);
		}
	console.log("Status = " + util.inspect(omx.getStatus()));
	}
}

function play(path) {
	console.log("Request handler 'play' was called.");
	omx.play(path,{'-o': 'local', '--vol': '-300'});
}

function playOne(path) {
	console.log("Request handler 'playOne' was called.");
	plist = [];
	play(path);
}

function pause() {
	console.log("Request handler 'pause' was called.");
	if (omx.isPlaying())
	{
		omx.pause();
	}
	else
	{
		console.log('Not playing: start again.');
		omx.play();
	}
}

function prevch() {
	console.log("Request handler 'prevch' was called.");
	omx.previousChapter();
}

function nextch() {
	console.log("Request handler 'nextch' was called.");
	omx.nextChapter();
}

function back30s() {
	console.log("Request handler 'back30s' was called.");
	omx.seekBackward();
}

function fwd30s() {
	console.log("Request handler 'fwd30s' was called.");
	omx.seekForward();
}

function back10m() {
	console.log("Request handler 'back10m' was called.");
	omx.seekFastBackward();
}

function fwd10m() {
	console.log("Request handler 'fwd10m' was called.");
	omx.seekFastForward();
}

function playnext() {
	console.log('playnext called, plist.length = ' + plist.length);
	if (plist.length > 0)
	{
		play(plist.shift());
	}
}

function playdir(path) {
	console.log("Request handler 'playdir' was called.");
	var files = fs.readdirSync(path);
	for (i = 0; i < files.length; i++)
	{
		if (/\.mp3$/.test(files[i])) {
			plist[plist.length] = path + '/' + files[i];
		}
	}
	playnext(plist);
}

omx.on('end', function() { playnext(); });

exports.stop = stop;
exports.play = playOne;
exports.prevch = prevch;
exports.nextch = nextch;
exports.back30s = back30s;
exports.fwd30s = fwd30s;
exports.back10m = back10m;
exports.fwd10m = fwd10m;
exports.playdir = playdir;
exports.pause = pause;
