# bares

This is the open source version of bares - a **BA**ckup and **RES**tore utility for MySQL/Apache-based systems.

Borrows heavily from https://github.com/tylergannon/rtbackup, but is a node implementation. It backs up a specified project folder (in Apache deployments, most projects are under /var/www/html) and the databases under MySQL.


## Features:
 - Can backup all databases and any project folder
 - Integrated Slack notification via webhooks
 - Allows debugging through command line options
 - Automated scheduling based on crontab.cfg
 - Automated cleanup for files that are out of the retention policy
 - Automated restore of project, database, or both
 

## Requirements:

 - Account running the program should have permissions to the following:
   - the project folder
   - MySQL databases (see [my.cnf configuration](#my.cnf configuration))
 - For incremental backups, binary logging must be enabled. See [Binary Logging Configuration](#Configure Mysql Binary Logging) below.
 - The **GNU** (not BSD) version of _tar_.  The GNU version includes --listed-incremental, which is needed for incremental backups.
 - Node & NPM installed


## Installation
 - After cloning this repository, you must issue 'npm install' on the folder so it can install all the required modules.
 - After editing the backup_conf.sample.yml to your liking (see [backup_conf.yml Configuration](#backup_conf.yml Configuration), you can have it read by the program automatically if you put it on `/etc/bares/backup_conf.yml`. Otherwise, it would have to be explicitly stated on each command being executed. See the [Usage](#Usage) section for more details.

## Usage

### Scheduling
`node bares crontab`
 - Deploys the crontab.cfg schedule to your crontab. For more information, visit https://help.ubuntu.com/community/CronHowto

### Backups
`node bares <daily|weekly|monthly|incremental>`
 - Runs the specified backup. The naming convention for daily, weekly, & monthly matters only during backup cleanup, but incremental backups are actually performed through MySQL binary logs and GNU tar's --listed-incremental flag.
   #### Flags

   `-f`
   - Backup files/project folder only. Mutually exclusive with `-d` flag.
   
   `-b`
   - Backup databases only (except system databases). Defaults to all. Mutually exclusive with `-f` flag.
    
   `-d <database_name>`
   - Backup a specific database only. Can be used alone or with the `-b` flag, e.g. `node bares daily -b -d joomladb`
   
   `-c <config_file>`
   - Use the specified config file. Default value is `/etc/bares/default_conf.yml`. If the file does not exist, it will throw an error.
   
   `-v`
   - Enable verbose debugging.

### Restore
`node bares restore [--up_to='2018-12-25T00:00:00']`
  - Restores the project folder and the database on the time specified. Note that it will attempt to restore it on the specified time based on the backups that are available.
  - The restore process backs up the project directory first by renaming it as projectdir.backup.
  - Automatically cleans up the restore directory.
  - `-up_to` is optional. If there's no value specified, it will attempt to restore based on the latest backups on the S3 Bucket.
  - `-up_to` follows ISO 8601 time format (YYYY-MM-DDTHH24:mi:ss). The time part can be ommitted, but will default to 00:00:00 (12AM) based on the ISO format.
  - `-up_to` follows the servers time.
   
    #### Other Flags
  
   `-f`
   - Restore files/project folder only. Mutually exclusive with `-d` flag.
   
   `-b`
   - Restore databases only (except system databases). Defaults to all. Mutually exclusive with `-f` flag.
    
   `-d <database_name>`
   - Restore a specific database only. Can be used alone or with the `-b` flag, e.g. `node bares restore -b -d joomladb`
   
   `-r`
   - The directory where the files from S3 bucket will be restored. Default value is `/tmp`. Useful when making sure the restored backups will fit the specified directory.
   
   `-v`
   - Enable verbose debugging.

## Future Plans
  - Remove callback hell.
  - Allow folder backup if AWS S3 is does not exist.
  - Add JSDoc.

## Other Information

### Configure Mysql Binary Logging

Make sure that binary logging is enabled on your mysql server.  The following settings need to be enabled in mysql configuration files. On Debian-based Linux distros this means editing `/etc/mysql/mysql.conf.d/mysqld.cnf`, though Alpine Linux and others will involve editing `/etc/mysql/my.cnf`.

```
[mysqld]
# ...
#  Make sure that you know how to use this setting properly if you're using replication.
server-id               = 1
log_bin                 = /var/log/mysql/mysql-bin  #  Make sure this matches the
                                                    #  bin_log setting in your backup_conf.yml file.
```


### backup_conf.yml Configuration:

 - #### mysql:host
 The hostname where the MySQL service is running. Usually `localhost`
 - #### mysql:user, mysql:password
 Bares will use this information to log in to MySQL. IT IS ARGUABLY BETTER TO FILL OUT USERNAME AND PASSWORD USING ~/.my.cnf, but if you enjoy insecure environments fill these out and they will be read. See https://easyengine.io/tutorials/mysql/mycnf-preference/ for more details.
 - #### mysql:bin_path
 The executable path of mysql. Can be found by issuing `which mysql` on the server. Must have a trailing slash `/`.
 - #### mysql:bin_log
 If you are using MySql binary logging, this is the path to the binary logs. It should match the log_bin option in your `my.cnf`.

 - #### s3.access_key_id, s3.secret_access_key
 Taken from AWS whenever you create a new S3 Bucket and assign a user to it.
 - #### s3.bucket
 The bucket name to store backups to.
 - #### s3.prefix
 The prefix/subfolder where you'd like to place your backups.

 - #### file_location
 Your project folder file. Defaults to `/var/www/html`.

 - #### logging:logfile_path
 The logfile where bares writes everything as it's executing. Defaults to `/tmp/bares.log`.

 - #### slack:webhook
 Set up a new webhook at https://slack.com/apps
 Once configured, put the address here.
 - #### slack:notify_on_success
 Set to `true` if you want to be notified whenever a backup completes successfully.
 - #### slack:mention_users_on_failure
 Array of Slack User IDs to mention when backups fail.
 - #### slack:mention_users_on_success
 Array of Slack User IDs to mention when backups succeed. Will not get triggered when slack.notify_on_success is set to `false`.

 - #### retention
    - #### incremental:hours
    Number of hours to keep incremental backups. Defaults to 48.
    - #### daily:days
    Number of daily backups to keep. Defaults to 6.
    - #### weekly:weeks
    Number of weekly backups to keep. Defaults to 3.
    - #### monthly:months
    Number of monthly backups to keep. Defaults to 11.

 - The abovementioned retention policy makes sure that the project/server can be restored to a point-in-time 48 hrs ago. It can also restore daily backups for up to 7 days ago, although not incrementally/point-in-time. If you are adjusting the retention policies, make sure they make sense and don't overlap so you have less $ to pay for keeping them on S3 bucket.


### my.cnf Configuration
In your home folder, add .my.cnf with the following lines:

```
[client]
user=mysqluser
password=password
```

and restart mysql service. This allows a "passwordless" login for the current user.