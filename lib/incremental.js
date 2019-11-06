const fs = require('fs');
const glob = require('glob');
const AWS = require('./aws');
const path = require('path');
const logger = require('./logging').Logger;

function run(cfg, timeStamp, tmp_dir, callback) {
    // Step 1 - Check contained items on S3
    // Step 1b - Put non-existent logs
    // Pre-checks: read access on folder as bares user.
    // options is optional
    glob(`${cfg.mysql.bin_log}*`, null, function (err, files) { // Returns array
        if (err) callback(err);
        else if (files) {
            files.splice(-2); // Remove index and last log being written
            var validFiles = files;
            var binLogPath = path.dirname(cfg.mysql.bin_log);
            AWS.listFiles('incremental', 'db', undefined, (err, data) => {
                if (err) callback(err);
                else if (data.length > 0) {
                    // Compare files that exist on S3 to the files that you have
                    data.forEach((s3file) => {
                        fileArr = s3file.split('.');
                        fileArr.pop();
                        fileName = path.basename(fileArr.join('.'));
                        // Compare now
                        validFiles = validFiles.filter( (obj) => { return obj !== `${binLogPath}/${fileName}`; });
                    })                    
                }
                // Upload files
                validFiles.forEach((file) => {
                    AWS.uploadFile(file, path.basename(file) + '.' + timeStamp,'incremental', { 'db': 'all' }, (err, data) => {
                        if (err) return callback(err);
                        else {
                            logger.info(`db`,data, true);
                        }
                    });
                })
                return callback(undefined, tmp_dir);
            })
        }
    })
}

module.exports = {
    run
}