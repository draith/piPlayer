# piPlayer
Node.js-based web application for the Raspberry Pi to play mp3 files under browser control.

NOTE:  Won't work properly (stopping/multi-track play) unless stdin is /dev/null.
(To run interactively for test/debug: 'node index.js < /dev/null')

Dependencies: 
id3v2 : for extracting and displaying track names in music library.

NODE.JS modules:
omx-manager: omx player control wrapper
http:  Web server functionality.
fs:    File system access (for music library)
child_process: To execute shell commands (omxplayer, id3v2, etc.)
url:   To parse URIs from browser.
