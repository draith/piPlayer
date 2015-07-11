var omx = require('omx-manager');
var fs = require('fs');
var plist = [];
var nextIndex = 0;
var playDirPath = '';

function stop() {
	console.log("Request handler 'stop' was called.");
	plist = [];
	playDirPath = '';
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

function playnext() {
	console.log('playnext called, plist.length = ' + plist.length + ', nextIndex = ' + nextIndex);
	if (plist.length > nextIndex)
	{
		play(plist[nextIndex++]);
	}
}

function playdir(path) {
	console.log("Request handler 'playdir' was called.");
	var filename = '';
	if (/\.mp3$/.test(path)) {
		filename = path.split('/').pop();
		path = path.substr(0, path.lastIndexOf('/'));
	}
	nextIndex = 0;
	if (path != playDirPath)
	{
		// update plist with list of mp3 files in directory 
		playDirPath = path;
		var files = fs.readdirSync(path);
		plist = [];
		for (i = 0; i < files.length; i++)
		{
			if (/\.mp3$/.test(files[i])) {
				plist[i] = path + '/' + files[i];
				if (files[i] == filename) {
					nextIndex = i;
				}
			}
		}
	}
	else if (filename.length > 0)
	{
		// Set nextIndex to filename position in existing plist
		for (i = 0; i < plist.length; i++)
		{
			if (plist[i].split('/').pop() == filename) {
				nextIndex = i;
				break;
			}
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
	process.send('OK ' + message.command);
		break;
	case 'pause':
		pause();
		break;
	case 'stop':
		stop();
	process.send('OK ' + message.command);
		break;
	}
	
	
});
