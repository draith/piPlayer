var omx = require('omx-manager');
var fs = require('fs');
var path = require('path');
var plist = [];
var nextIndex = 0;
var playDirPath = '';
var started = false;

function playFile(filepath) {
	if (!started)
	{
		omx.enableHangingHandler();
		started = true;
	}
	console.log('Calling playFile(' + filepath + ')');
	omx.play(filepath,{'-o': 'local', '--vol': '-300', '--no_keys': ''});
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

// add paths of all mp3 files under dirpath to plist
function addToPlist(dirpath)
{
	var files = fs.readdirSync(dirpath);
	var i;
	for (i = 0; i < files.length; i++)
	{
		var filepath = path.join(dirpath,files[i]);
		if (/\.mp3$/.test(files[i])) {
			// add mp3 files to plist
			plist.push(filepath);
		}
		else if (fs.statSync(filepath).isDirectory()) {
			// recursively add directory contents
			addToPlist(filepath);
		}
	}
}

function updatePlist(dirpath) 
{
	// update plist with list of mp3 files in directory 
	if (dirpath != playDirPath)
	{
		playDirPath = dirpath;
		plist = [];
		addToPlist(dirpath);
	}
}

var commandFunctions = 
{
	stop: function() 
	{
		plist = [];
		playDirPath = '';
		if (omx.isPlaying())
		{
			omx.stop();
		}
		process.send('stop');
	}
	,
	pause: function() 
	{
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
	,
	next: function() 
	{
		if (!omx.isPlaying())
		{
			process.send('end');
		}
		else if (nextIndex < plist.length)
		{
			stopAndPlayNext();
		}
		else 
		{	// Stay on current (last) track
			process.send('playing:' + plist[nextIndex-1]);
		}
	}
	,
	start: function() 
	{
		if (!omx.isPlaying())
		{
			process.send('end');
		}
		else 
		{	// Move nextIndex back one to start current track again.
			nextIndex -= 1;
			stopAndPlayNext();
		}
	}
	,
	prev: function() 
	{
		if (!omx.isPlaying())
		{
			process.send('end');
		}
		else if (nextIndex > 1)
		{	// Move nextIndex back 2 to start previous track.
			nextIndex -= 2;
			stopAndPlayNext();
		}
		else 
		{	// Stay on current (last) track
			process.send('playing:' + plist[nextIndex-1]);
		}
	}
	,
	playdir: function(dirpath) 
	{
		nextIndex = 0;
		stopAndPlayNext();
	}
	,
	playmix: function(dirpath) 
	{
		updatePlist(dirpath);
		// Randomise plist...
		var currentIndex = plist.length, swap, randomIndex;
		while (currentIndex > 0) {
			randomIndex = Math.floor(Math.random() * currentIndex);
			currentIndex -= 1;
			swap = plist[currentIndex];
			plist[currentIndex] = plist[randomIndex];
			plist[randomIndex] = swap;
		}
		nextIndex = 0;
		stopAndPlayNext();
	}
	,
	play: function(filepath) 
	{
		var filename = path.basename(filepath);
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
  ,
  clearPlist: function(ignore)
  {
    plist = [];
  }
  ,
  addToPlist: function(filepath)
  {
    plist.push(filepath);
  }
}; // commandFunctions

// At the end of each track, play the next track in the playlist, if there is one.
omx.on('end', function() { console.log('end event...'); playnext(); });

// Process incoming messages from server.js
process.on('message', function(message) {
	console.log('Child received command: ' + message.command + ', arg: ' + message.arg);
	if (message.command in commandFunctions) {
		console.log("Calling command function " + message.command);
		commandFunctions[message.command](message.arg);
	}
	else
	{
		console.log("COMMAND " + message.command + " NOT FOUND!");
	}
});
