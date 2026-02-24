const ContentScheduler = require('./scheduler');

const poster = new ContentScheduler();
poster.runTask('post').then(r => process.exit(r.success ? 0 : 1));
