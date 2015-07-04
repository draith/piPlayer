var server = require("./server");
var router = require("./router");
var requestHandlers = require("./requestHandlers");
var omx = require('omx-manager');

var handle = {};
handle["/start"] = requestHandlers.start;
handle["/stop"] = requestHandlers.stop;
handle["/play"] = requestHandlers.play;
handle["/playvid"] = requestHandlers.playvid;
handle["/playdir"] = requestHandlers.playdir;
handle["/pause"] = requestHandlers.pause;
handle["/prevch"] = requestHandlers.prevch;
handle["/nextch"] = requestHandlers.nextch;
handle["/back30s"] = requestHandlers.back30s;
handle["/fwd30s"] = requestHandlers.fwd30s;
handle["/back10m"] = requestHandlers.back10m;
handle["/fwd10m"] = requestHandlers.fwd10m;

server.start(router.route, handle);
