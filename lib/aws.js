const AWS = require('aws-sdk');
const config = require('./config');
const fs = require('fs');
const argv = require('yargs').argv;
const path = require('path');

var moment = require('moment');

const logger = require('./logging').Logger;

/*
    Parameters:
    backup type, db or app, database
*/

/*const cfg = config.getParams(argv.c, (err, data) => {
    if (err)
    {
        return err;
    }
    else return data;
});
*/
const cfg = config.getParamsV2(argv.c);
if (typeof cfg === 'string') return cfg;

AWS.config.update({
    accessKeyId: cfg.s3.access_key_id,
    secretAccessKey: cfg.s3.secret_access_key
});

var myBucket = cfg.s3.bucket;

var s3 = new AWS.S3();

const startDate = moment().format('YYYY-MM-DDTHH:mm:ss');

/*function downloadFile(file, filepath, response) {
    var params = {
        Bucket: myBucket, 
        Key: file
    };
    if (filepath === '') filepath = '/tmp';
    logger.debug('downloadFile.init ' + file);
    fileName = `${filepath}/${path.basename(file)}`;
    file = fs.createWriteStream(`${filepath}/${path.basename(file)}`);
    s3
    .getObject(params)
    .on('error', function (err) {
        return response(err);
    })
    .on('httpData', function (chunk) {
        file.write(chunk);
    })
    .on('httpDone', function () {
        file.end();
        return response(undefined,fileName);
    })
    .send();
}
*/
function downloadFile(filename, filepath, response) {
    var params = {
        Bucket: myBucket, 
        Key: filename
    };
    if (filepath === '') filepath = '/tmp';
    logger.debug('downloadFile.init ' + filename);
    filename = `${filepath}/${path.basename(filename)}`;
    var hasError = false;
    var fileStream = fs.createWriteStream(filename);
    var s3Stream = s3.getObject(params).createReadStream();
    
    s3Stream.on('error', (err) => {
        hasError = true;
        return response(err); // Timeouts happen here
    })

    s3Stream.pipe(fileStream)
    .on('error', (err) => {
        hasError = true;
        return response(err);
    })
    .on('finish', () => {
        if (hasError) return;
        else return response(undefined, filename);
    })
}

function listFiles(backup_type, bkpFlag, database, response) {
    var dbPrefix = ( database ? `${database}/` : '' );
    if (backup_type === 'incremental')
    {
        dbPrefix = '';
    }

    var params = {
        Bucket: myBucket, /* required */
        Prefix: `${cfg.s3.prefix}/${bkpFlag}_backup/${dbPrefix}${backup_type}`,  // Can be your folder name
        //MaxKeys: 2
    };
    //console.log(params);
    function getKeys(token, cb)
    {
        var allKeys = [];
        if(token) params.ContinuationToken = token;

        s3.listObjectsV2(params, function(err, data){
            if (err) return response(err);
            else {
                allKeys = allKeys.concat(data.Contents);
                if(data.IsTruncated) getKeys(data.NextContinuationToken, cb);
                else cb(allKeys);
            }
        });
    }

    getKeys(null, (data) => {
       // console.log(data);
        var fileArr = [];
        if (data.length > 0) {
            data.forEach( (file) => {
                fileArr.push(file.Key);
            });
        }
        return response(undefined,fileArr);
    })
}

function getExpiredFiles(backup_type, bkpFlag, database, response) {

    var sliceNum = ( bkpFlag === 'db' ? (backup_type === 'incremental' ? -1 : -3) : -2 );
    //var sliceNum = ( bkpFlag === 'db' ? -3 : -2 );
    var retentionObj = cfg.retention[backup_type]; // Returns object?
    
    var retention = {
        unit: Object.keys(retentionObj),
        value: parseInt(Object.values(retentionObj))
    }

    listFiles(backup_type, bkpFlag, database, (err, data) => {
        fileArr = [];
        if (err) response(err);
        else if (data.length > 0) {
            data.forEach((file) => {
                fileDate = file.split('.').slice(sliceNum)[0];
                fileDate = moment(fileDate,moment.ISO_8601);
                unitsBeforeExpire = retention.value + fileDate.diff(startDate,`${retention.unit}`);
                if (unitsBeforeExpire <= 0)
                {
                    fileArr.push(file);
                }
            })
            return response(undefined, fileArr);
        }
        else {
            return response('No expired backups found.');
        }
    })
}

function deleteExpiredFiles(backup_type, bkpFlag, database, response)
{
    getExpiredFiles(backup_type, bkpFlag, database, (err, data) => {
        if (err) response(err);
        else if (data.length > 0) {
            var keyObj = [];
            data.forEach((file) => {
                keyObj.push({ Key: file });
            })
            var params = {
                Bucket: myBucket, 
                Delete: {
                 Objects: keyObj, 
                 Quiet: false
                }
            };
            s3.deleteObjects(params, (err, data) => {
                if (err) response(err);
                else {
                    response(err, data.Deleted);
                }
            })
        }
    })
}

function uploadFile(bkpFileFullPath, bkpFile, backup_type, bkpFlag, callback) {

    if (bkpFile === null) bkpFile = path.basename(bkpFileFullPath);
    var bkpPrefix = null;
    if (typeof bkpFlag === 'object')
    {
        if (backup_type !== 'incremental')
        {
            bkpPrefix = Object.keys(bkpFlag)[0] + '_backup/' + bkpFlag.db;
        }
        else bkpPrefix = Object.keys(bkpFlag)[0] + '_backup';
    }
    else if (typeof bkpFlag === 'string')
    {
        bkpPrefix = bkpFlag + '_backup';
    }
    
    var myKey = `${cfg.s3.prefix}/${bkpPrefix}/${backup_type}/${bkpFile}`;

    var options = { Bucket: myBucket };

    const checkBucketExists = async myBucket => { 
        try {
          await s3.headBucket(options).promise();
          checkAndPutObject();
        } catch (error) {
          if (error.statusCode === 404) {
            s3.createBucket({
                Bucket: myBucket
            }, function (err, data) {
                if ((err) && (err.code != 'BucketAlreadyOwnedByYou')) {
                    return callback(err);
                } else {
                    checkAndPutObject();
                }
            });
          }
          else callback(error);
        }
    };

    checkBucketExists();

    function checkAndPutObject() {
        var body = fs.createReadStream(bkpFileFullPath);
        params = {
            Bucket: myBucket,
            Key: myKey,
            Body: body
        }
        var opts = { queueSize: 2, partSize: 1024 * 1024 * 20};
        s3.upload(params, opts, function (err,data) {
            if (err) callback(err);
            else {
                callback(undefined, `Successfully uploaded ${myKey} to ${myBucket}`); 
            }
        })
    }
}

module.exports = {
    downloadFile,
    listFiles,
    getExpiredFiles,
    deleteExpiredFiles,
    uploadFile
}