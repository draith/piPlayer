var http = require("http");
var url = require("url");
var fs = require("fs");
var path = require("path");
var mimetypes = require("mime-types");
var pagetop = fs.readFileSync('pagetop.html');
var pagebot = fs.readFileSync('pagebot.html');
var index;
var musicroot = "/home/pi/Downloads/Music";
var musicpath = musicroot;
var playingfile = false;
var child_process = require('child_process');
var exec = child_process.exec;
var trackNames = [];
var player = child_process.fork('./player');
var xmlResponse;
var urlpath;

// Pass messages from player back to client if it's waiting for an XMLresponse..
player.on('message', function(message) {
	console.log('Received from child: ' + message);
	if (xmlResponse)
	{
		// Keep track of currently playing filename.
		if (message == 'end' || message == 'stop') {
			playingfile = false;
		} else {
			var splitResponse = message.split(':');
			if (splitResponse.length == 2 && splitResponse[0] == 'playing')
			{
				playingfile = splitResponse[1];
			}
		}
		console.log('Sending xml response.');
		xmlResponse.writeHead(200, {"Content-Type": "text/plain"});
		xmlResponse.end(message);
		// Ensure we don't respond twice.
		xmlResponse = null;
	}
});

// Populates trackNames as map from filename to track title,
// from id3v2 output.
function parseID3(id3Output) 
{
	var lines = id3Output.split('\n');
	var filename = false;
	trackNames = [];
	var i;
	for (i = 0; i < lines.length; i++)
	{
		// Get filename from Filename value.
		if (/^Filename: /.test(lines[i]))
		{
			filename = lines[i].substr(10);
		}
		// Get track name from TIT2 value.
		else if (filename && /^TIT2: /.test(lines[i]))
		{
			var j = 0;
			var trackName = lines[i].substr(6);
			// id3v2 doesn't output non-ASCII tracknames correctly - it masks out
			// bit 8, resulting in ASCII-fied track names.
			// Workaround: If the filename contains non-ASCII characters, 
			// and the returned trackname is found in the ASCII-fied filename,
			// then use the corresponding part of the (non-ASCII) filename as
			// the track name.
			var asciiFilename = '';
			for (j = 0; j < filename.length; j++)
			{
				asciiFilename = asciiFilename + String.fromCharCode(filename.charCodeAt(j) & 0x7f);
			}
			if (asciiFilename != filename)
			{
				// filename must contain non-ASCII characters..
				var trackNameOffset = asciiFilename.indexOf(trackName);
				if (trackNameOffset >= 0)
				{
					trackName = filename.substr(trackNameOffset,trackName.length);
				}
			}
			trackNames[filename] = trackName;
		}
	}
}

function displayPage(response) 
{
	response.writeHead(200, {"Content-Type": "text/html"});
	response.write(fs.readFileSync('pagetop.html'));
	// Display directory links...
	if (urlpath == 'cdplaydir') {
		response.write('<body onload="xmlrequest(\'playdir\')">');
	} else if (playingfile) {
		response.write('<body playing="' + quotEscaped(encodeURIComponent(playingfile)) +
		'" onload="initPlaying()">');
	} else {
		response.write('<body>');
	}
	response.write("<div id='top'>" +
	"<a href='./'>Refresh</a>" +
	'<span class="active" id="pause" onclick="xmlrequest(\'pause\')">Pause</span>' +
	'<span class="active" id="stop" onclick="xmlrequest(\'stop\')">Stop</span>' +
	'<br/>');
	response.write("<p>");
	var linkPath = musicroot;
	var diffPath = musicpath.substr(linkPath.length+1).split('/');
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
	var dirName = musicpath.split('/').pop();
	response.write('</p><p class="title">' + dirName + '</p>');
	// Display contents of current directory in scrolling div.
	response.write('</div>\n<div id=scrolling>');
	var files = fs.readdirSync(musicpath);
	for (i = 0; i < files.length; i++)
	{
		response.write(libLink(musicpath + '/' + files[i]));
	}
	response.write('</div>');
	response.write(pagebot);
	response.end();
	
} // displayPage

function getTracksAndDisplayPage(response)
{
	// Get id3 tags and refresh page.
	var cmd = "id3v2 -R " + bashEscaped(musicpath) + "/*.mp3";
	exec(cmd, { timeout: 5000 },
		function (error, stdout, stderr) {
			// Get title tags for display
			parseID3(stdout);
			displayPage(response);
		}
	);
}

function dirLink(pathname)
{
  // Display directory name in hyperlink to 'cd' to that directory.
  var name = pathname.split('/').pop();
  return '<a href="./cd?path=' + encodeURIComponent(pathname) + '">' + name + '</a>';
}

// Display title and hyperlink(s) for one item in current directory.
function libLink(pathname) {
  var stat = fs.statSync(pathname);
  if (stat.isDirectory())
  {
	  // Display directory name in hyperlink to 'cd' to that directory.
	  var result = '<p>' + dirLink(pathname);
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
	  result += '</p>';
	  return result;
  }
  else if (/\.mp3$/.test(pathname))
  {
	  // MP3 file: display track name (or filename if none) in 'play' hyperlink.
	  var pclass = (pathname == playingfile ? 'active playing' : 'active');
	  return '<p class="' + pclass + '" id="' + quotEscaped(encodeURIComponent(pathname)) + '" onclick="xmlrequest(\'./play?path=\' + this.id)">' + 
				(trackNames[pathname] || pathname) + '</p>';
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

// Request handler callback
function onRequest(request, response) 
{
	var requestURL = url.parse(request.url,true);
	urlpath = requestURL.pathname.substr(1);
	console.log('urlpath = ' + urlpath);
	xmlResponse = false;
	switch (urlpath)
	{
	case 'pause':
	case 'stop':
		player.send({command: urlpath, arg: decodeURIComponent(requestURL.query.path)});
		xmlResponse = response;
		break;
	case 'play':
		player.send({command: urlpath, arg: decodeURIComponent(requestURL.query.path)});
		xmlResponse = response;
		break;
	case 'monitor':
		// Request to pass back next signal from player.
		xmlResponse = response;
		break;
	case 'cd':
	case 'cdplaydir':
		musicpath = fs.realpathSync(decodeURIComponent(requestURL.query.path));
		getTracksAndDisplayPage(response);
		break;
	case 'playdir':
		player.send({command: urlpath, arg: musicpath});
		xmlResponse = response;
		break;
	case '':
		// Refresh the page.
		if (playingfile)
		{	// Display currently-playing directory, if any..
			musicpath = playingfile.substr(0,playingfile.lastIndexOf('/'));
		}
		getTracksAndDisplayPage(response);
		break;
	default:
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
