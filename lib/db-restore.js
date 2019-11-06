const AWS = require('./aws');
const logger = require('./logging').Logger;
const moment = require('moment');
const argv = require('yargs').argv;
const config = require('./config');
const fs = require('fs');
const path = require('path');

const cfg = config.getParamsV2(argv.c);

function run(up_to, restore_files, database, response) {
    //basefiles = [ '/tmp/db.wordpress.daily.2018-12-16T16:18:21.sql.gz', '/tmp/db.employees.daily.2018-12-16T16:18:21.sql.gz' ];
    //incremental_files = ['/tmp/mysql-bin.000270.2018-12-16T16:18:57', '/tmp/mysql-bin.000271.2018-12-16T16:19:22'];
    //doSomething(basefiles, incremental_files);
    //return;
    if (up_to === undefined) up_to = moment().format('YYYY-MM-DDTHH:mm:ss');
    const listDbs = require('./db-backup').prepareDatabases;

    listDbs(cfg, database, (err, dbnames) => {
        dbCount = dbnames.length;
        dlDbBaseFiles = [];
        dbnames.forEach( (dbname) => {
            checkBackup( up_to, 'db', dbname, false, (err, dbbasefile) => {
                logger.debug(`checkBackup.dbbasefile_${dbname} ${dbbasefile}`);
                if (err) return response({ logtype: 'db', message: err});
                else 
                {
                    AWS.downloadFile(dbbasefile, restore_files, (err, dlDbBaseFile) => {
                        logger.debug(`checkBackup.download ${dbbasefile}`);
                        if (err) return response({ logtype: 'aws', message: err});
                        else if (dlDbBaseFile) // Once downloaded, can be unzipped
                        {
                            dbCount--;
                            fileName = restore_files + '/' + path.basename(dbbasefile);
                            dlDbBaseFiles.push(fileName);
                            logger.info('db', `Downloaded ${dbbasefile}`, true);
                            if (dbCount === 0)
                            {
                                getIncrFiles(up_to, restore_files, dbname, (err, incremental_files) => {
                                    if (err) return response(err);
                                    else if (typeof incremental_files === 'object')
                                    {
                                        unzipAndRename(dlDbBaseFiles, incremental_files, (err, dbbasefiles, incremental_files) => {
                                            if (err) return response({ logtype: 'db', message: err});
                                            else {
                                                appendToSQL(up_to, dbbasefiles, incremental_files, (err, appendedfiles) => {
                                                    if (err) return response({ logtype: 'db', message: err});
                                                    else {
                                                        dumpToDB(dbbasefiles, (err, resp) => {
                                                            if (err) return response({ logtype: 'db', message: err});
                                                            else return response(undefined, true);
                                                        })
                                                    }
                                                });
                                            }
                                        });
                                    }
                                    else { // no incremental backups
                                        unzipBackup(dlDbBaseFiles, (err, unzippedfiles) => {
                                            if (err) return callback(err);
                                            else if (unzippedfiles)
                                            {
                                                dumpToDB(unzippedfiles, (err, resp) => {
                                                    if (err) return response({ logtype: 'db', message: err});
                                                    else return response(undefined, true);
                                                })
                                            }
                                        })
                                    }
                                })
                            }
                        }  
                    })
                }
            })
        })

    })

    function getIncrFiles(up_to, restore_files, dbname, callback) {
        dlIncrFiles = [];
        checkBackup( up_to, 'db', dbname, true, (err, dbbasefile, incremental_files) => {
            if (err) return callback({ logtype: 'db', message: err});
            else if (incremental_files) {
                incrCount = incremental_files.length;
                incremental_files.forEach( (incrFile) => {
                    AWS.downloadFile(incrFile, restore_files, (err, dlIncrFile) => {
                        if (err)
                        {
                            return callback({logtype: 'aws', message: err});
                        }
                        else if (dlIncrFile)
                        {
                            incrCount--;
                            incrFileName = restore_files + '/' + path.basename(incrFile);
                            dlIncrFiles.push(incrFileName);
                            logger.info('db', `Downloaded ${incrFile}`, true);
                            if (incrCount === 0)
                            {
                                return callback(undefined, dlIncrFiles);
                            }
                        }
                    })
                })
            }
            else {
                return callback(undefined, undefined);
            }
        })
    }

    function unzipAndRename(dbbasefiles, incrfiles, callback)
    {
        unzipBackup(dbbasefiles, (err, unzippedfiles) => {
            if (err) return callback(err);
            else if (unzippedfiles)
            {
                renameBinLogs(incrfiles, (err, renamedfiles) => {
                    if (err) return callback(err);
                    else if (renamedfiles)
                    {
                        return callback(undefined, unzippedfiles, renamedfiles);
                    }
                })
            }
        })
    }
    
    function appendToSQL(up_to, dbbasefiles, incrfiles, callback) {
        incrfiles.sort();
        i = dbbasefiles.length;
        dbbasefiles.forEach( (dbbasefile) => {
            // Get DB name
            dbname = path.basename(dbbasefile);
            dbname = dbname.split('.')[1];
            j = incrfiles.length;
            incrfiles.forEach ( (incrfile) => {
                appendCmd = `${cfg.mysql.bin_path}mysqlbinlog --skip-gtids --stop_datetime='${up_to}' --database=${dbname} ${incrfile} >> ${dbbasefile}`;
                const exec = require('child_process').execSync;
                try {
                    exec(appendCmd);
                    j--;
                    if (j === 0)
                    {
                        logger.info('db','Completed for: ' + dbname, true);
                        i--;
                        if (i === 0)
                        {
                            // Delete binary logs
                            incrfiles.forEach( (incrfile) => {
                                fs.unlinkSync(incrfile);
                            })
                            return callback(undefined, dbbasefiles);
                        }
                    }
                }
                catch (e)
                {
                    return callback(e);
                }
            })
        })
    }

    function dumpToDB(dbbasefiles, callback) {
        i = dbbasefiles.length;
        dbbasefiles.forEach ( (dbbasefile) => { // Iterate through each database and perform restore
            // Get DB name
            dbname = path.basename(dbbasefile);
            dbname = dbname.split('.')[1];
            logger.info('db', 'Starting restore for ' + dbname, true);

        var cliOptions = (cfg.mysql.user ? ' -u ' + cfg.mysql.user : ' ') + (cfg.mysql.password ? ' -p' + cfg.mysql.password : ' ') + ' -h ' + cfg.mysql.host + ' ' + dbname;
            restoreCmd = `${cfg.mysql.bin_path}mysql ${cliOptions} < ${dbbasefile}`;
            const exec = require('child_process').execSync;
            try {
                exec(restoreCmd);
                logger.info('db','Completed restore for ' + dbname, true);
                i--;
                if (i === 0)
                {
                    dbbasefiles.forEach( (dbbasefile) => {
                        fs.unlinkSync(dbbasefile);
                    })

                    restorePoint = (up_to ? up_to : 'latest backup');
                    logger.info('app', `Successfully restored app to ${restorePoint}`, true);
                    return callback(undefined, true);
                }
            }
            catch (e)
            {
                return callback(e);
            }
        })
    }
}


function unzipBackup(dbbasefiles, callback) {
    const exec = require('child_process').exec;
    i = dbbasefiles.length;
    unzippedFiles = [];
    dbbasefiles.forEach( (dbbasefile) => {
        unzipCmd = 'gunzip ' + dbbasefile; // Pending 
        exec(unzipCmd, (err, resp) => {
            if (err) {
                return callback(err);
            }
            else {
                dbbasefile = dbbasefile.slice(0, -3);
                unzippedFiles.push(dbbasefile);
                logger.info('db','Unzipped to ' + dbbasefile, true);
                i--;
                if (i === 0) return callback(undefined, unzippedFiles);
            }
        })
    })
}

function renameBinLogs(incremental_files, callback) {
    i = incremental_files.length;
    renamedFiles = [];
    incremental_files.forEach ( (incremental_file) => {
        incrFileArr = incremental_file.split('.');
        incrDate = incrFileArr[2];
        incrFileArr.splice(-1);
        incrFileName = incrFileArr.join('.');
        fs.rename(incremental_file, incrFileName, (err, resp) => {
            if (err) return callback({ logtype: 'db', msg: err});
            {
                incrFileArr = incremental_file.split('.');
                incrDate = incrFileArr[2];
                incrFileArr.splice(-1);
                incrFileName = incrFileArr.join('.');
                renamedFiles.push(incrFileName);
                logger.info('db',`Renamed ${incremental_file} to ${incrFileName}`,true);
                i--;
                if (i === 0) {
                    return callback(undefined, renamedFiles);
                }
            }
        })
    })
}

 
/* PENDING:
1. mysqldump restore
            cmd = "#{config.mysql_bin} --silent --skip-column-names #{cli_options}"
            logger.debug "Executing raw SQL against #{ database}\n#{cmd}"
2. db delete
3. callback cleanup
*/
function checkBackup(up_to, bkpFlag, database, isIncremental, callback) {
    var sliceNum = -3;
    if (up_to === undefined) up_to = moment().format('YYYY-MM-DDTHH:mm:ss');
    AWS.listFiles('', bkpFlag, database, (err, data) => {
        if (err) return callback(err);
        else if (data.length > 0)
        {
            //console.log(data);
            baseFile = getBaseBackupFile(data, up_to); // contains incremental backups
            baseFileDate = baseFile.split('.').slice(sliceNum)[0];
            baseFileDate = moment(baseFileDate, moment.ISO_8601);
            //incrFiles = getIncrBackupFiles(bkpFlag, data, baseFileDate, up_to);
            if (isIncremental === true)
            {
                getIncrBackupFiles(bkpFlag, data, sliceNum, baseFileDate, up_to, (incrFiles) => {
                    if (incrFiles.length === 0) incrFiles = undefined;
                    callback(undefined, baseFile, incrFiles);
                })
            }
            else return callback(undefined, baseFile);
        }
        else if (data.length === 0) return callback('No backups found.');
    })

    function getBaseBackupFile(files, up_to) {
        fileDifference = -604800;
        restorableFile = undefined;
        files.forEach( (file) => {
            fileBkpType = file.split('.').slice(sliceNum-1)[0];
            if (fileBkpType !== 'incremental')
            {
                fileDate = file.split('.').slice(sliceNum)[0];
                fileDate = moment(fileDate,moment.ISO_8601);
                currFileDiff = fileDate.diff(up_to,'seconds');
                if (currFileDiff >= fileDifference && currFileDiff < 0)
                {
                    restorableFile = file;
                    fileDifference = currFileDiff;
                }
            }
        })
        if (restorableFile) return restorableFile;
    }

    function getIncrBackupFiles(bkpFlag, nullfiles, sliceNum, startTime, endTime, response) {
        restorableFiles = [];

        AWS.listFiles('incremental', bkpFlag, database, (err, data) => {
            logger.debug('getIncr.db ' + JSON.stringify(data));
            if (err) callback(err);
            if (data.length > 0)
            {
                return fetchIncrBackupFiles(data, sliceNum, startTime, endTime);
            }
            else return response(restorableFiles);
        })

        function fetchIncrBackupFiles(files, sliceNum, startTime, endTime)
        {
            files.forEach( (file) => {
                fileBkpType = file.split('.').slice(sliceNum-1)[0];
                sliceNum = -1;
                fileDate = file.split('.').slice(sliceNum)[0];
                fileDate = moment(fileDate,moment.ISO_8601);
                if (fileDate.isBetween(startTime, endTime, 'seconds','[]'))
                {
                    restorableFiles.push(file);
                }
            })
            return response(restorableFiles);
        }
    }

}

module.exports = {
    run
}