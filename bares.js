const yargs = require('yargs');

const config = require('./lib/config');
const zones = require('./lib/zones');
const cron = require('./lib/cron');
const backup = require('./lib/backup');
const restore = require('./lib/restore');
const notifier = require('./lib/notifier');
const logger = require('./lib/logging').Logger;

const backupOptions = {
  database: {
    alias: 'd',
    describe: 'Specify database name to be backed up',
    type: 'string',
    requiresArg: true,
    default: 'all'
  },
  db_only: {
    alias: 'b',
    describe: 'Backup databases only (except system database)',
    boolean: true,
    conflicts: 'files_only'
  },
  files_only: {
    alias: 'f',
    describe: 'Backup files only (excluding databases)',
    boolean: true,
    conflicts: 'db_only'
  },
  config: {
    alias: 'c',
    describe: 'Load configuration from YML file',
    string: true,
    requiresArg: true,
    default: '/etc/bares/backup_conf.yml'
  },
  debug: {
    alias: 'v',
    describe: 'Allow debug logs',
    boolean: true,
    default: false
  }
}

const restoreOptions = {
  up_to: {
    alias: 'u',
    describe: 'Specify point in time to which the environment will be recovered to',
    type: 'string'
  },
  restore_files: {
    alias: 'r',
    describe: 'Restore backup files only to the specified directory',
    type: 'string',
    default: '/tmp'
  },
  database: {
    alias: 'd',
    describe: 'Specify database name to be restored',
    type: 'string',
    requiresArg: true,
    default: 'all'
  },
  db_only: {
    alias: 'b',
    describe: 'Restore databases only (except system database)',
    boolean: true,
    conflicts: 'files_only'
  },
  files_only: {
    alias: 'f',
    describe: 'Restore app only (excluding databases)',
    boolean: true,
    conflicts: 'db_only'
  },
  debug: {
    alias: 'v',
    describe: 'Allow debug logs',
    boolean: true,
    default: false
  }
}

const argv = yargs
  .command(
    'crontab',
    "Deploy a crontab-scheduled backup"
  )
  .command(
    'restore',
    'Restore backup based on specification',
    restoreOptions
  )
  .command(
    'daily',
    'Run daily backup',
    backupOptions
  )
  .command(
    'weekly',
    'Run weekly backup',
    backupOptions
  )
  .command(
    'monthly',
    'Run monthly backup',
    backupOptions
  )
  .command(
    'incremental',
    'Run incremental backup',
    backupOptions
  )
  .command(
    'sample',
    'Run sample',
    backupOptions
  )
  .help()
  .alias('help', 'h')
  .argv;

const command = argv._[0];

if (command === 'crontab') {
    cron.schedule('/etc/bares/crontab.cfg');
} else if (command === 'restore') {
  restore.runRestore(argv.up_to, argv.restore_files, argv.database, argv.db_only, argv.files_only, (err, resp) => {
    if (err) {
      logger.debug('Base.error');
      logger.error(err.logtype, err.message, true);
    }
    //else console.log(resp);
  })
} else if (['daily', 'weekly', 'monthly', 'incremental'].indexOf(command) >= 0) {
  // Getting default values;
  if (argv.database !== 'all' && argv.files_only === true)
  {
    logger.info('bares','Ignoring --database flag...',true);
  }
  backup.runBackup(command, argv.config, argv.database, argv.db_only, argv.files_only, (err, resp) => {
    if (err) {
      logger.debug('Base.error'); 
      logger.error(err.logtype, err.message, true);
      notifier.notifyOnSlack(command, true);
    }
    else if (!err) {
      //console.log(resp);
      notifier.notifyOnSlack(command, false);
    }
  });
} else {
  console.log('Command not found.');
}