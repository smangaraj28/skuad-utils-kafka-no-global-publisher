const Google = require('./google');
const Q = require('q');

class GoogleDriveApi extends Google {
  constructor(logger) {
    super();
    this.logger = logger;
  }

  getDriveObject() {
    return this.drive;
  }

  async listFiles() {
    this.drive.files.list({
      pageSize: 10,
      fields: 'nextPageToken, files(id, name)',
    }, (err, res) => {
      if (err) return console.log('The API returned an error: ' + err);
      const files = res.data.files;
      if (files.length) {
        console.log('Files:');
        files.map((file) => {
          console.log(`${file.name} (${file.id})`);
        });
      } else {
        console.log('No files found.');
      }
    });
  }

  downloadStreamFile(fileId, destStream, mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
    let deferred = Q.defer();

    // const drive = google.drive({version: 'v3', auth});

    this.logger.info(`Starting download for ${fileId} : ${mimeType}`);

    this.drive.files.export({
          fileId: fileId,
          mimeType
        },
        {responseType: 'stream'},
        (err, res) => {
          if (err) {
            deferred.reject(err);
            return;
          }
          this.logger.info(`Starting download Stream for ${fileId} : ${mimeType}`);
          res.data
              .pipe(destStream)
              .on('close', () => {
                this.logger.info(`Finished download for ${fileId} : ${mimeType}`);
                deferred.resolve(1);
              })
              .on('error', (err) => {
                deferred.reject(err);
                this.logger.error(`Error during download ${err}`);
              });
        });

    return deferred.promise;
  }
}

module.exports = GoogleDriveApi;
