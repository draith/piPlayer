var http = require("http");
var url = require("url");
var fs = require("fs");
var path = require("path");
var mimetypes = require("mime-types");
var pagetop = fs.readFileSync('pagetop.html');
var pagebot = fs.readFileSync('pagebot.html');
var index;
var musicroot = "/home/pi/usbdrv/Music";
var invalidUTF8char = String.fromCharCode(0xfffd);
var musicpath = musicroot;
var playingfile = false;
var searchroot;
var searchstring = '';
var child_process = require('child_process');
var exec = child_process.exec;
var trackNames = [];
var trackNumbers = [];
var tracksByNumber = [];
var playList = [];
var uniqueTrackNumbers = 0;
var player = child_process.fork('./player');
var urlpath;

const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8080 });

wss.on('connection', function connection(ws) {
  console.log('Connection open');

  // Pass commands from browser through to player
  ws.on('message', function incoming(msg) {
      console.log('received: %s', msg);
      commandObj = JSON.parse(msg);
      switch (commandObj.command)
      {
      case 'play': // commandObj.arg holds file path
      case 'playdir':
        // First, copy file play list to player
        sendPlist(); 
      case 'pause':
      case 'stop':
      case 'prev':
      case 'next':
      case 'start':
      case 'playmix':
        // Pass command to player.
        player.send(commandObj);
        break;
      default:
      console.log('Unknown command %', msg);
      };
  });
});

// Broadcast to all.
wss.broadcast = function broadcast(data) {
  console.log('broadcast: ' + data);
  wss.clients.forEach(function each(client) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
};

// Pass messages from player back to client if it's waiting for an XMLresponse..
player.on('message', function(message) {
	console.log('Received from child: ' + message);
	// Keep track of currently playing filename.
	if (message == 'end' || message == 'stop') {
		playingfile = false;
	} else {
		var splitResponse = message.split(':');
		if (splitResponse.length > 1 && splitResponse[0] == 'playing')
		{
			playingfile = message.substr(message.indexOf(':') + 1);
		}
	}
  wss.broadcast(message);
});

// Populates trackNames as map from filename to track title,
// from id3v2 output.
function parseID3(id3Output) 
{
	var lines = id3Output.split('\n');
	var filename = false;
	var filepath = false;
	trackNames = [];
  trackNumbers = [];
  tracksByNumber = [];
  uniqueTrackNumbers = 0;
	var i;
	for (i = 0; i < lines.length; i++)
	{
		// Get filename from Filename value.
		if (/^Filename: /.test(lines[i]))
		{
			filepath = lines[i].substr(10);
		}
    // Get track number from TRCK: tag.
    else if (/^TRCK: /.test(lines[i]))
    {
      var trackNum = parseInt(lines[i].substr(6));
      trackNumbers[filepath] = trackNum;
      if (trackNum > 0)
      {
        if (tracksByNumber[trackNum] == null)
        {
          tracksByNumber[trackNum] = filepath;
          uniqueTrackNumbers += 1;
        }
      }
    }
		// Get track name from TIT2 value.
		else if (filepath && /^TIT2: /.test(lines[i]))
		{
			var j = 0;
			var nonAsciiChar = false;
			var trackName = lines[i].substr(6);
			// Check trackName for non-ASCII characters..
			for (j = 0; j < trackName.length; j++)
			{
				if (trackName.charCodeAt(j) & 0x80)
				{
					nonAsciiChar = trackName.charAt(j);
					break;
				}
			}
			// id3v2 doesn't always output non-ASCII tracknames as UTF8 - it masks out
			// bit 8, resulting in ASCII-fied track names, or outputs in Latin-1.
			// Workaround: If the trackname or filename contains non-ASCII characters, 
			// then use the corresponding part of the (non-ASCII) filename as
			// the track name.
			var trackNameOffset = -1;
			filename = path.basename(filepath,'.mp3');
			if (nonAsciiChar == invalidUTF8char)
			{
				// Search for match in filename, modulo invalid UTF8 in trackname.
				for (trackNameOffset = filename.length - trackName.length; 
					 trackNameOffset >= 0; trackNameOffset--)
				{
					for (j = 0; j < trackName.length; j++)
					{
						if (trackName.charAt(j) != invalidUTF8char &&
							trackName.charAt(j) != filename.charAt(trackNameOffset + j)) 
						{
							break; // Not a match
						}
					}
					if (j == trackName.length) {
						break; // Found a match at trackNameOffset.
					}
				}
			}
			else if (!nonAsciiChar)
			{
				// trackname is ASCII - see if it is an ASCII-fied version of part of
				// a non-ASCII filename...
				var asciiFilename = '';
				for (j = 0; j < filename.length; j++)
				{
					asciiFilename = asciiFilename + String.fromCharCode(filename.charCodeAt(j) & 0x7f);
				}
				if (asciiFilename != filename)
				{
					// filename contains non-ASCII characters: look for trackName in asciiFilename
					trackNameOffset = asciiFilename.indexOf(trackName);
				}
			}
			
			if (trackNameOffset >= 0)
			{
				trackName = filename.substr(trackNameOffset,trackName.length);
			}
			trackNames[filepath] = trackName;
		}
	}
} // parseID3

function startPage(response)
{
	response.writeHead(200, {"Content-Type": "text/html"});
	response.write(pagetop);
	// Display directory links...
	if (urlpath == 'cdplaydir') {
		response.write('<body onload="sendCommand(\'playdir\')">');
	} else if (playingfile) {
		response.write('<body playing="' + quotEscaped(playingfile) +
		'" onload="initPlaying()">');
	} else {
		response.write('<body>');
	}
	response.write("<div id='top'>"); // +
	// "<a href='./'>Refresh</a>" +
	// '<span class="active" id="prev" onclick="sendCommand(\'prev\')">&lt;&lt;</span>' +
	// '<span class="active" id="start" onclick="sendCommand(\'start\')">&lt;</span>' +
	// '<span class="active" id="pause" onclick="sendCommand(\'pause\')">Pause</span>' +
	// '<span class="active" id="stop" onclick="sendCommand(\'stop\')">Stop</span>' +
	// '<span class="active" id="next" onclick="sendCommand(\'next\')">&gt;&gt;</span>' +
	// '<br/>');
	response.write("<p>");
	var linkPath = musicroot;
	var diffPath = path.relative(musicroot, musicpath).split('/');
	while (linkPath != musicpath)
	{
		response.write(dirLink(linkPath));
		linkPath = linkPath + '/' + diffPath.shift();
		if (linkPath != musicpath)
		{
			response.write('>');
		}
	}
	// Write title of current directory
	response.write('</p><p class="title">' + path.basename(musicpath) + '</p>');
	response.write('</div>\n<div id=scrolling>');
}

function endPage(response) 
{
	response.write('<br/></div>');
	response.write(pagebot);
	response.end();
}

function displayDirPage(response) 
{
  startPage(response);
	// Display contents of current directory in scrolling div.
	var files = fs.readdirSync(musicpath);
  var addedSearch = false;
  var trackCount = 0;
	for (i = 0; i < files.length; i++)
	{
    var pathname = path.join(musicpath, files[i]);
    var stat = fs.statSync(pathname);
    if (stat.isDirectory())
    {
      if (!addedSearch) {
        response.write(searchField(musicpath));
        addedSearch = true;
      }
      response.write(libLinkDir(pathname));
    }
    else if (/\.mp3$/.test(pathname))
    {
      trackCount += 1;
    }
	}
  
  playList = [];
  
  // Sort tracks by number if each has a unique track number.
  if (uniqueTrackNumbers == trackCount)
  {
    for (i = 1; i < tracksByNumber.length; i++)
    {
      if (tracksByNumber[i] != null) 
      {
        response.write(libLink(tracksByNumber[i]));
        playList.push(tracksByNumber[i]);
      }
    }
  }
  else for (i = 0; i < files.length; i++)
	{
    var pathname = path.join(musicpath, files[i]);
    var stat = fs.statSync(pathname);
    if (!stat.isDirectory())
    {
      response.write(libLink(pathname));
      playList.push(pathname);
    }
	}
	endPage(response);
  
} // displayDirPage

function getTracksAndDisplayPage(response)
{
	// Get id3 tags and refresh page.
	var cmd = "id3v2 -R " + bashEscaped(musicpath) + "/*.mp3";
	exec(cmd, { timeout: 10000 },
		function (error, stdout, stderr) {
			// Get title tags for display
			parseID3(stdout);
			displayDirPage(response);
		}
	);
}

function displaySearchResults(response)
{
	// Get search result and refresh page.
	var cmd = "find " + bashEscaped(searchroot) + ' -iname *' + searchstring.replace(/\s/g, '*') + '*';
  console.log('exec command: ' + cmd);
	exec(cmd, { timeout: 3000 },
		function (error, stdout, stderr) {
      // Display search results
      startPage(response);
      response.write(searchField(musicpath));
      var paths = stdout.split('\n');
      console.log('found ' + paths.length + ' matches');
      if (paths.length > 1) { // Ignore empty last entry
        playList = [];
      }
			for (i = 0; i < paths.length - 1; i++)
      {
        console.log('match: ' + paths[i]);
        if (/\.mp3$/.test(paths[i]))
        {
          // MP3 file: display filename in 'play' hyperlink.
          response.write('<p class="active" id="' + quotEscaped(paths[i]) + 
                         '" onclick="sendCommand(\'play\', this.id)">' + 
                         path.basename(paths[i],'.mp3') + '</p>');
          // Add to playlist
          playList.push(paths[i]);
        }
        else
        {
          response.write(dirLink(paths[i]));
        }
      }
      endPage(response);
		}
	);
  
}

function dirLink(pathname)
{
  // Display directory name in hyperlink to 'cd' to that directory.
  return '<a href="./cd?path=' + encodeURIComponent(pathname) + '">' + path.basename(pathname) + '</a>';
}

function searchField(pathname)
{
  // Display directory name in hyperlink to 'cd' to that directory.
  return '<form action="./search">' +
         '<input type="hidden" name="path" value="' + pathname + '">' +
         '<input type="text" name="searchString" value="' + searchstring + '">' +
         '<input type="submit" value="Search">' +
         '</form>';
}


// Display title and hyperlink(s) for one directory in current directory.
function libLinkDir(pathname) 
{
  // Display directory name in hyperlink to 'cd' to that directory.
  var result = (playingfile && playingfile.indexOf(pathname) == 0 ?
				'<p class="playing">' : '<p>')
				+ dirLink(pathname);
  // Check for any mp3 files in the directory...
  var files = fs.readdirSync(pathname);
  for (j = 0; j < files.length; j++)
  {
	  // If any, include a 'cdplaydir' link, to play all of them.
     if (/\.mp3$/.test(files[j])) {
       result += '<a href="./cdplaydir?path=' + encodeURIComponent(pathname) + '"> (Play)</a>';
       break;
     } 
  }
  result += '<span class="active" onclick="sendCommand(\'playmix\', \'' + bashEscaped(pathname) + '\')">(Mix)</span>';
  result += '</p>';
  return result;
}

// Display title and hyperlink(s) for one mp3 file in current directory.
function libLink(pathname) {
  if (/\.mp3$/.test(pathname))
  {
	  // MP3 file: display track name (or filename if none) in 'play' hyperlink.
	  var pclass = (pathname == playingfile ? 'active playing' : 'active');
	  return '<p class="' + pclass + '" id="' + quotEscaped(pathname) + '" onclick="sendCommand(\'play\', this.id)">' + 
				(trackNumbers[pathname] > 0 ? trackNumbers[pathname] + " : " : '') + (trackNames[pathname] || path.basename(pathname,'.mp3')) + '</p>';
  }
  else return ""; 
}

// escape path for passing to id3v2 as command-line parameter.
function bashEscaped(pathname)
{
  return pathname.replace(/([ &'\(\)])/g, "\\$1");
}

// encode quotation characters in literal html string 
function quotEscaped(pathname)
{
  return pathname.replace(/"/g, "&quot;");
}

function sendPlist()
{
  player.send({command: 'clearPlist'});
  for (i = 0; i < playList.length; i++)
  {
    player.send({command: 'addToPlist', arg: playList[i]});
  }
}

// Request handler callback
function onRequest(request, response) 
{
	var requestURL = url.parse(request.url,true);
	urlpath = requestURL.pathname.substr(1);
	console.log('urlpath = ' + urlpath);
	xmlResponse = false;
	switch (urlpath)
	{
	case 'cd':
	case 'cdplaydir':
		musicpath = fs.realpathSync(decodeURIComponent(requestURL.query.path));
		getTracksAndDisplayPage(response);
		break;
  case 'search':
    searchroot = fs.realpathSync(decodeURIComponent(requestURL.query.path));
    searchstring = decodeURIComponent(requestURL.query.searchString);
    console.log('root = ' + searchroot);
    console.log('string = ' + searchstring);
    displaySearchResults(response);
    break;
	case '':
		// Refresh the page.
		if (playingfile)
		{	// Display currently-playing directory, if any..
			musicpath = path.dirname(playingfile);
		}
		getTracksAndDisplayPage(response);
		break;
	default:
		// Handle requests for files (e.g. icons): return them if they exist.
		var filename = path.join(process.cwd(), unescape(urlpath));
		var stats;
		var mimeType;

		try {
			stats = fs.lstatSync(filename); // throws if path doesn't exist
			mimeType = mimetypes.lookup(filename);
		} catch (e) {
			console.log('Non-existent file request: ' + filename);
			response.writeHead(404, {'Content-Type': 'text/plain'});
			response.write('404 Not Found\n');
			response.end();
			return;
		}

		if (stats.isFile() && mimeType) {
			response.writeHead(200, {"Content-Type": mimeType});
			var fileStream = fs.createReadStream(filename);
			fileStream.pipe(response);
		} else {
			console.log('Bad file request: ' + filename);
			response.writeHead(500, {'Content-Type': 'text/plain'});
			response.write('500 Internal server error\n');
			response.end();
		}
		break;
	}
} // onRequest

process.on('exit', function() {
	console.log('Shutting down: killing player.');
	player.kill();
});

http.createServer(onRequest).listen(8889);
console.log("piPlayer server started.");
