const AWS = require('./aws');
const logger = require('./logging').Logger;
const moment = require('moment');

function run(up_to, restore_files, response) {
    if (up_to === undefined) up_to = moment().format('YYYY-MM-DDTHH:mm:ss');
    checkBackup( up_to, 'app', undefined, true, (err, appbasefile, appincrfiles) => {
        logger.debug('checkBackup.files');
        if (err) return response({ logtype: 'app', message: err});
        else {
            dlAppBaseFiles = [];
          AWS.downloadFile(appbasefile, restore_files, (err, dlAppBaseFile) => {
            logger.debug(`checkBackup.download ${appbasefile}`);
            if (dlAppBaseFile) {
                dlAppBaseFiles.push(dlAppBaseFile);
                logger.info('app', `Downloaded ${appbasefile}`, true);
                if (typeof appincrfiles === 'object')
                {
                    incrCount = appincrfiles.length;
                    dlAppIncrFiles = [];
                    appincrfiles.forEach( (appincrfile) => {
                    AWS.downloadFile(appincrfile, restore_files, (err, dlAppIncrFile) => {
                      logger.debug(`checkBackup.download ${appincrfile}`);
                      if (dlAppIncrFile) {
                        const path = require('path');
                        fileName = restore_files + '/' + path.basename(appincrfile);
                        dlAppIncrFiles.push(fileName);
                        logger.info('app', `Downloaded ${appincrfile}`, true);
                        incrCount--;

                        if (incrCount === 0)
                        {
                            backupCurrentDir();
                            restoreFiles(dlAppBaseFiles, dlAppIncrFiles, (err, success) => {
                                if (err) {
                                    return response({ logtype: 'app', message: err });
                                }
                                else if (success) {
                                    restorePoint = (up_to ? up_to : 'latest backup');
                                    logger.info('app', `Successfully restored app to ${restorePoint}`, true);
                                    return;
                                }
                            });
                        }
                      }
                      else if (err) return response({ logtype: 'aws', message: err});
                    })
                    })
                }
                else {
                    backupCurrentDir();
                    restoreFiles(dlAppBaseFiles, [], (err, success) => {
                        if (err) {
                            return response({ logtype: 'app', message: err });
                        }
                        else if (success) {
                            restorePoint = (up_to ? up_to : 'latest backup');
                            logger.info('app', `Successfully restored app to ${restorePoint}`, true);
                            return;
                        }
                    });
                }
            }
            else if (err) return response({ logtype: 'aws', message: err});
          })

        }
    })
    
    const fs = require('fs');

    function backupCurrentDir() {
        const config = require('./config');
        const argv = require('yargs').argv;
        const cfg = config.getParamsV2(argv.c);

        backupdir = cfg.file_location + '.backup';
        logger.info('app', `Creating backup of ${cfg.file_location} to ${backupdir} ...`, true);
        logger.info('app', `You may need to remove this dir manually.`, true);
        fs.renameSync(cfg.file_location, backupdir);
    }

    function restoreFiles(appbasefile, appincrfile, resp) {
        appincrfile.unshift(appbasefile[0]);
        fileArr = appincrfile;
        //console.log(fileArr);
        
        fileArr.forEach( (file) => {
            //fileName = path.basename(file);
            fileName = file;
            logger.info('app',`Restoring ${file} ...`, true);
            var resCmd = `tar zxp -C '/' --listed-incremental=/dev/null \
            --no-check-device --force-local \
            --file=${fileName}`;
            //console.log(resCmd);
            exec = require('child_process').execSync;
            try { // Restore and cleanup
                exec(resCmd);
                fs.unlinkSync(fileName);
            } catch (e) {
                return resp(e);
            }
        })
        return resp(undefined, true);
    }
}

function checkBackup(up_to, bkpFlag, database, isIncremental = true, callback) {
    var sliceNum = -2;
    if (up_to === undefined) up_to = moment();
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
                    return callback(undefined, baseFile, incrFiles);
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
                //console.log(fileDate + ' ' + currFileDiff);
                if (currFileDiff >= fileDifference && currFileDiff < 0)
                {
                    restorableFile = file;
                    fileDifference = currFileDiff;
                }
            }
        })
        if (restorableFile) return restorableFile;
        else return undefined;
    }

    function getIncrBackupFiles(bkpFlag, files, sliceNum, startTime, endTime, response) {
        restorableFiles = [];
        files.forEach( (file) => {
            fileBkpType = file.split('.').slice(sliceNum-1)[0];
            if (fileBkpType === 'incremental')
            {
                fileDate = file.split('.').slice(sliceNum)[0];
                fileDate = moment(fileDate,moment.ISO_8601);
                if (fileDate.isBetween(startTime, endTime, 'seconds','[]'))
                {
                    restorableFiles.push(file);
                }
            }
        })
        return response(restorableFiles);
    }
}

module.exports = {
    run
}