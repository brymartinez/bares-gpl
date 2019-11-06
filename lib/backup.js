/* 
    Staging area for backups. Determines whether to throw to db-backup or site-backup, depending on parameters

*/
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

/**
 * Runs the appropriate backup given the parameters.
 * 
 * @param  {} backup_type daily, weekly, monthly, incremental
 * @param  {} config_file path to config file
 * @param  {} database Database name to be backed up. Can be set to all
 * @param  {} db_only -b flag
 * @param  {} files_only -f flag
 * @param  {} response callback function containing (error, response)
 */
const runBackup = (backup_type, config_file, database, db_only, files_only, response) => {

    logger.info('bares', `Fetching details from '${config_file}'...`, true);
    
    // PENDING - BLM
    // Generate 20 random hex numbers as backup ID.
    // May not be needed in the future, because there's no way to track it outside of the backup runs.
    // Also, there's no guarantee that the backupID will not duplicate.
    var backupID = randHex(20).toString();
    var tmp_dir =  '/tmp/' + backupID + '/';

    // If return of getParamsV2 is a string, then it's an error code.
    // Useful when checking the -c flag, which may have a custom config file other than /etc/bares/backup_conf.yml
    const cfg = config.getParamsV2(argv.c);
    if (typeof cfg === 'string') return response(cfg);

    logger.info('bares',`Backup ID: ${backupID}`, true);
    
    // Create tmp_dir directory
    fs.mkdir(tmp_dir, { recursive: true }, (err) => {
        if (err) return response(err);
    });

    // By this time, prechecks have been made.
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

    /**
     * Deletes temporary files on a given file path.
     * @param  {} filePath
     */
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
    /** Calls AWS lib to delete expired files based on 
     * @param  {} backup_type daily, weekly, monthly, incremental
     * @param  {} app_or_db app or db
     * @param  {} db database name, if app_or_db === 'db'
     */
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
} // function runBackup END

/** Creates a random 20-char hex code. WARNING: Does not check for duplicates.
 * It only *wishes* to not have duplicates due to 20-char hex.
 * @param  {} len
 */
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