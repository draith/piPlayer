var omx = require('omx-manager');
var fs = require('fs');
var path = require('path');
var plist = [];
var nextIndex = 0;
var playDirPath = '';
var started = false;

function stop() {
	console.log("Request handler 'stop' was called.");
	plist = [];
	playDirPath = '';
	if (omx.isPlaying())
	{
		omx.stop();
	}
	process.send('stop');
}

function pause() {
	console.log("Request handler 'pause' was called.");
	var status = omx.getStatus();
	if (status.playing)
	{
		omx.pause();
		process.send('paused');
	}
	else if (status.current)
	{
		console.log('Not playing: start again.');
		omx.play();
		process.send('unpaused');
	}
}

function playFile(filepath) {
	if (!started)
	{
		omx.enableHangingHandler();
		started = true;
	}
	omx.play(filepath,{'-o': 'local', '--vol': '-300'});
}

function playnext() {
	console.log('playnext called, plist.length = ' + plist.length + ', nextIndex = ' + nextIndex);
	if (nextIndex < plist.length)
	{
		var filename = plist[nextIndex++];
		playFile(filename);
		process.send('playing:' + filename);
	}
	else
	{
		process.send('end');
	}
}

function updatePlist(dirpath) 
{
	console.log('updatePlist(' + dirpath + ')');
	// update plist with list of mp3 files in directory 
	if (dirpath != playDirPath)
	{
		playDirPath = dirpath;
		var files = fs.readdirSync(dirpath);
		plist = [];
		for (i = 0; i < files.length; i++)
		{
			if (/\.mp3$/.test(files[i])) {
				plist[i] = path.join(dirpath, files[i]);
			}
		}
	}
}

function stopAndPlayNext()
{
	if (omx.isPlaying())
	{
		console.log('stopAndPlayNext calling stop');
		omx.stop();
	}
	else
	{
		console.log('stopAndPlayNext calling playnext');
		playnext();
	}
}

function playdir(dirpath) 
{
	console.log("player: playdir(" + dirpath + ") called.");
	updatePlist(dirpath);
	nextIndex = 0;
	stopAndPlayNext();
}

function play(filepath) 
{
	console.log("Request handler 'play' was called.");
	var filename = path.basename(filepath);
	console.log('filename = ' + filename);
	updatePlist(path.dirname(filepath));
	// Set nextIndex to filename position in existing plist
	nextIndex = 0;
	for (i = 0; i < plist.length; i++)
	{
		if (path.basename(plist[i]) == filename) {
			nextIndex = i;
			break;
		}
	}
	stopAndPlayNext();
}

omx.on('end', function() { console.log('end event...'); playnext(); });

process.on('message', function(message) {
	console.log('Child received command: ' + message.command + ', arg: ' + message.arg);
	switch (message.command) {
	case 'playdir':
		playdir(message.arg);
		break;
	case 'play':
		play(message.arg);
		break;
	case 'pause':
		pause();
		break;
	case 'stop':
		stop();
		break;
	}
});
