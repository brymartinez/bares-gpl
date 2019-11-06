// Firstly we'll need to import the fs library
var fs = require('fs');
const argv = require('yargs').argv;
const config = require('./config');

const cfg = config.getParamsV2(argv.c);
if (typeof cfg === 'string') return cfg;

// next we'll want make our Logger object available
// to whatever file references it.
var Logger = exports.Logger = {};


// Create 3 sets of write streams for the 3 levels of logging we wish to do
// every time we get an error we'll append to our error streams, any debug message
// to our debug stream etc...
//var infoStream = fs.createWriteStream(s3.logging.logfile_path, { flags: 'a' });
// Notice we set the path of our log files in the first parameter of 
// fs.createWriteStream. This could easily be pulled in from a config
// file if needed.
//var errorStream = fs.createWriteStream(s3.logging.logfile_path, { flags: 'a' });
// createWriteStream takes in options as a second, optional parameter
// if you wanted to set the file encoding of your output file you could
// do so by setting it like so: ('logs/debug.txt' , { encoding : 'utf-8' });
//var debugStream = fs.createWriteStream(s3.logging.logfile_path, { flags: 'a' });

var logStream = fs.createWriteStream(cfg.logging.logfile_path, { flags: 'a' });

// Finally we create 3 different functions
// each of which appends our given messages to 
// their own log files along with the current date as an
// iso string and a \n newline character
Logger.info = function(logtype, msg, verbose) {
  var message = "[ " + logtype + " ] " + new Date().toISOString() + " : " + msg + "\n";
  logStream.write(message);
  if (verbose) {
    console.log(message);
  }
};

Logger.debug = function(msg, verbose = true) {
  if (argv.v) {
    logtype = 'DEBUG';
    var message = "[ " + logtype + " ] " + new Date().toISOString() + " : " + msg + "\n";
    logStream.write(message);
    if (verbose) {
      console.log(message);
    }
  }
};

Logger.error = function(logtype, msg, verbose) {
  var message = "[ " + logtype + " ] " + new Date().toISOString() + " : " + msg + "\n";
  logStream.write(message);
  if (verbose) {
    console.log(message);
  }
};