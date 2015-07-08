var omx = require('omx-manager');
var fs = require('fs');
var plist = [];
var nextIndex = 0;
var playDirPath = '';

function stop() {
	console.log("Request handler 'stop' was called.");
	plist = [];
	if (omx.isPlaying())
	{
		omx.stop();
	}
}

function play(path) {
	console.log("Request handler 'play' was called, path = " + path);
	omx.play(path,{'-o': 'local', '--vol': '-300'});
}

function playOne(path) {
	console.log("Request handler 'playOne' was called.");
	plist = [path];
	nextIndex = 0;
	stopAndPlayNext();
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

function playnext() {
	console.log('playnext called, plist.length = ' + plist.length + ', nextIndex = ' + nextIndex);
	if (plist.length > nextIndex)
	{
		play(plist[nextIndex++]);
	}
}

function playdir(path) {
	console.log("Request handler 'playdir' was called.");
	playDirPath = path;
	var files = fs.readdirSync(path);
	plist = [];
	for (i = 0; i < files.length; i++)
	{
		if (/\.mp3$/.test(files[i])) {
			plist[i] = path + '/' + files[i];
		}
	}
	nextIndex = 0;
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
		playOne(message.arg);
		break;
	case 'stop':
		stop();
		break;
	}
	
	process.send('OK ' + message.command);
	
});
