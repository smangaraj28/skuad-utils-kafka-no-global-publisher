const admin = require('firebase-admin');
// This can be provided as:
// 1) JSON (stringified) in process.env.FIREBASE_CONFIG
// 2) Path to JSON file in process.env.FIREBASE_CONFIG
// 3) JSON object in global.Config.firebase
var instance = null;
if (!!global.Config && !!global.Config.firebase)
  instance = admin.initializeApp({credential: admin.credential.cert(global.Config.firebase)});
else if (!!process.env.FIREBASE_CONFIG)
  instance = admin.initializeApp();

module.exports = instance;
