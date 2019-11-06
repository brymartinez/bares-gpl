const fs = require('fs');
const path = require('path');
const moment = require('moment');

const siteBackup = require('./site-backup');
const dbBackup = require('./db-backup');
const AWS = require('./aws');

const argv = require('yargs').argv;
const config = require('./config');

const logger = require('./logging').Logger;

var timeStamp = moment().format('YYYY-MM-DDTHH:mm:ss');

// NOTE: This is already a GOLD version. No modifications required.

const runBackup = (backup_type, config_file, database, db_only, files_only, response) => {

    logger.info('bares', `Fetching details from '${config_file}'...`, true);
    // Set Variables
    var backupID = randHex(20).toString();
    var tmp_dir =  '/tmp/' + backupID + '/';

    const cfg = config.getParamsV2(argv.c);
    if (typeof cfg === 'string') return response(cfg);

    logger.info('bares',`Backup ID: ${backupID}`, true);
    
    fs.mkdir(tmp_dir, { recursive: true }, (err) => {
        if (err) return response(err);
    });

    // Case switching
    if (files_only === true)
    {
        siteBackup.run(backup_type, cfg, timeStamp, tmp_dir, (err, resp) => {
            if (err) {
                returnErr = {
                    logtype: 'app',
                    message: `Backup failed: ${err}`
                }
                return response(returnErr);
            }
            else {
                deleteTempFiles(resp);
                deleteAWSFiles(backup_type, 'app', undefined);
                return response(undefined, resp);
            }
        });
    }
    else if (db_only === true)
    {
        dbBackup.run(backup_type, cfg, timeStamp, tmp_dir, database, (err, resp) => {
            if (err) {
                returnErr = {
                    logtype: 'db',
                    message: `Backup failed: ${err}`
                }
                return response(returnErr);
            }
            else {
                deleteTempFiles(resp);
                dbBackup.prepareDatabases(cfg, database, (err,resp) => {
                    if (err) {
                        returnErr = {
                            logtype: 'db',
                            message: `Backup failed: ${err}`
                        }
                        return response(returnErr);
                    }
                    else if (resp) {
                        resp.forEach((db) => {
                            deleteAWSFiles(backup_type, 'db', db);
                        })
                        return response(undefined, resp);
                    }
                })
            }
        });
    }
    else if (db_only !== true && files_only !== false)
    {
        siteBackup.run(backup_type, cfg, timeStamp, tmp_dir, (err, resp) => {
            if (err) {
                returnErr = {
                    logtype: 'app',
                    message: `Backup failed: ${err}`
                }
                return response(returnErr);
            }
            else {
                deleteTempFiles(resp);
                deleteAWSFiles(backup_type, 'app', undefined);
                return response(undefined, resp);
            }
        });
        dbBackup.run(backup_type, cfg, timeStamp, tmp_dir, database, (err, resp) => {
            if (err) {
                returnErr = {
                    logtype: 'db',
                    message: `Backup failed: ${err}`
                }
                return response(returnErr);
            }
            else {
                deleteTempFiles(resp);
                dbBackup.prepareDatabases(cfg, database, (err,resp) => {
                    if (err) {
                        returnErr = {
                            logtype: 'db',
                            message: `Backup failed: ${err}`
                        }
                        return response(err);
                    } else if (resp) {
                        resp.forEach((db) => {
                            deleteAWSFiles(backup_type, 'db', db);
                        })
                        return response(undefined, resp);
                    }
                })
            }
        }); 
    }

    function deleteTempFiles(filePath)
    {
        fs.unlink(filePath, (delErr) => {
            if(delErr && delErr.code !== 'EISDIR') return response({ logtype: 'tmp', message: delErr});
            else {
                fs.rmdir(tmp_dir, (delErr) => {
                    if (delErr && (delErr.code !== 'ENOTEMPTY' && delErr.code !== 'ENOENT')) return response({ logtype: 'tmp', message: delErr});
                })
            }
        })
    }

    function deleteAWSFiles(backup_type, app_or_db, db) {
        AWS.deleteExpiredFiles(backup_type, app_or_db, db, (err, data) => {   
            if (data) { // returns Obj
                data.forEach((file) => {
                    logger.info(app_or_db,`Deleted: ${file.Key}`,true);
                })
            }
            else if (err) {
                return response({ logtype: 'aws', message: err});
            }
        });
    }
} // Main function END

/***** BEGIN Usable function declaration *****/
const randHex = (len) => {
    var maxlen = 8,
        min = Math.pow(16,Math.min(len,maxlen)-1) 
        max = Math.pow(16,Math.min(len,maxlen)) - 1,
        n   = Math.floor( Math.random() * (max-min+1) ) + min,
        r   = n.toString(16);
    while ( r.length < len ) {
       r = r + randHex( len - maxlen );
    }
    return r;
};

module.exports = {
    runBackup
}