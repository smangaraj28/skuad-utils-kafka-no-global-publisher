const fs = require('fs');
const readline = require('readline');
let { google } = require('googleapis');
const Q = require('q');


const TOKEN_PATH = 'token.json';
const SCOPES = ['https://www.googleapis.com/auth/drive'];

class Google {
  /**
   * Authorize with Google
   * @returns {Promise<Compute | JWT | UserRefreshClient>}
   */
  async googleAuth() {
    const auth = await google.auth.getClient({
      // Scopes can be specified either as an array or as a single, space-delimited string.
      scopes: [
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/spreadsheets'
      ]
    });
    auth.subject = global.Config.gcp.adminEmail;
    return auth;
  }

  async init() {
    if (this.auth) {
      return;
    }
    this.auth = await this.googleAuth();
    this.drive = google.drive({version: 'v3', auth: this.auth});
    this.sheets = google.sheets({version: 'v4', auth: this.auth});
  }

  driveAuth() {
    let deferred = Q.defer();
    let content = fs.readFileSync('credentials.json', 'utf8');
    let credentials = JSON.parse(content);
    const {client_secret, client_id, redirect_uris} = credentials.installed;
    const oAuth2Client = new google.auth.OAuth2(
        client_id, client_secret, redirect_uris[0]);

    // Check if we have previously stored a token.
    fs.readFile(TOKEN_PATH, (err, token) => {
      if (err) return this.getAccessToken(oAuth2Client, deferred);
      oAuth2Client.setCredentials(JSON.parse(token));
      deferred.resolve(oAuth2Client);
    });

    return deferred.promise;
  }

  getAccessToken(oAuth2Client, promise) {
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
    });
    console.log('Authorize this app by visiting this url:', authUrl);
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question('Enter the code from that page here: ', (code) => {
      rl.close();
      oAuth2Client.getToken(code, (err, token) => {
        if (err) return console.error('Error retrieving access token', err);
        oAuth2Client.setCredentials(token);
        // Store the token to disk for later program executions
        fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
          if (err) return promise.reject(err);
          console.log('Token stored to', TOKEN_PATH);
        });
        promise.resolve(oAuth2Client);
      });
    });
  }
}

module.exports = Google;
