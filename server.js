var http = require("http");
var url = require("url");
var fs = require("fs");
var index;
var musicroot = "/home/pi/Downloads/Music";
var musicpath = musicroot;
var child_process = require('child_process');
var exec = child_process.exec;
var trackNames = [];
var player = child_process.fork('./player');

player.on('message', function(message) {
	console.log('Received from child: ' + message);
});

// Populates trackNames as map from filename to track title,
// from id3v2 output.
function parseID3(id3Output) {
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

function displayPage(response) {
	response.writeHead(200, {"Content-Type": "text/html"});
	response.write(fs.readFileSync('pagetop.html'));
	// Display directory links...
	response.write("<p>");
	var linkPath = musicroot;
	var diffPath = musicpath.substr(linkPath.length+1).split('/');
	while (linkPath != musicpath)
	{
		response.write(libLink(linkPath));
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
		response.write('<p>' + libLink(musicpath + '/' + files[i]) + '</p>');
	}
	response.write('</div>');
	response.write(fs.readFileSync('pagebot.html'));
	response.end();
	
} // displayPage

// Display title and hyperlink(s) for one item in current directory.
function libLink(path) {
  var stat = fs.statSync(path);
  if (stat.isDirectory())
  {
	  // Display directory link(s)
	  var urlpath = path.split('/').pop();
	  // Display directory name in hyperlink to 'cd' to that directory.
	  var result = '<a href="./cd?dir=' + encodeURIComponent(path) + '">' + urlpath + '</a>';
	  // Check for any mp3 files in the directory...
	  var files = fs.readdirSync(path);
	  for (j = 0; j < files.length; j++)
	  {
		  // If any, include a 'playdir' link, to play all of them.
		if (/\.mp3$/.test(files[j])) {
			result += '<a href="./playdir?path=' + encodeURIComponent(path) + '"> (Play)</a>';
			break;
		} 
	  }
	  return result;
  }
  else if (/\.mp3$/.test(path))
  {
	  // MP3 file: display track name (or filename if none) in 'play' hyperlink.
	  return '<p><a href="./play?path=' + encodeURIComponent(path) + '">' + 
				(trackNames[path] || path) + '</a>';
  }
  else return ""; 
}

// escape path for passing to id3v2 as command-line parameter.
function escaped(path)
{
  return path.replace(/([ &'\(\)])/g, "\\$1");
}

// Request handler callback
function onRequest(request, response) {
	var requestURL = url.parse(request.url,true);
	var urlpath = requestURL.pathname.substr(1);
	console.log('urlpath = ' + urlpath);
	switch (urlpath)
	{
	case 'play':
	case 'playdir':
	case 'stop':
		player.send({command: urlpath, arg: decodeURIComponent(requestURL.query.path)});
		displayPage(response);
		break;
	case 'cd':
		musicpath = fs.realpathSync(decodeURIComponent(requestURL.query.dir));
		// Get id3 tags
		var cmd = "id3v2 -R " + escaped(musicpath) + "/*.mp3";
		exec(cmd, { timeout: 5000 },
			function (error, stdout, stderr) {
				// Get title tags for display
				parseID3(stdout);
				displayPage(response);
			}
		);
		break;
	default:
		// Just refresh the page.
		displayPage(response);
	}
} // onRequest

http.createServer(onRequest).listen(8889);
console.log("piPlayer server started.");