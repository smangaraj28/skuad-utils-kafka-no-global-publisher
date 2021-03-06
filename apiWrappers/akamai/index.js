const AkamaiLib = require('akamai-auth-token').default;

class Akamai {
    constructor(logger) {
        this.logger = logger;
    }

    getConfig(path) {
        return {
            algorithm : global.Config.akamai.algo,
            window : global.Config.akamai.window,
            acl: path.substr(0, 15) + '*',
            key : global.Config.akamai.encryption_key,

        };
    }

    getPathToken(path) {
        const akamai = new AkamaiLib(this.getConfig(path));
        return akamai.generateToken();
    }

    getCompleteUri(originalFilename) {
        let filename = originalFilename && originalFilename.replace('.mp4', '.m3u8');
        if (originalFilename.indexOf('.avi') > -1) filename = originalFilename && originalFilename.replace('.avi', '.m3u8');
        if (originalFilename.indexOf('.quicktime') > -1) filename = originalFilename && originalFilename.replace('.quicktime', '.m3u8');
        if (filename.split('-').length > 1) {
            filename = filename.split('-')[1];
        }
        if (!filename || !global.Config.akamai) {
            return null;
        }
        let path = `/${originalFilename.split('-').length > 1 ? 'video-'+originalFilename.split('-')[0] : 'm3u8'}/${filename.substr(0,1)}/${filename.substr(1,2)}/${filename.substr(3,4)}/${filename}`;
        const token = this.getPathToken(path);
        return global.Config.akamai.hls + path + "?hdnts=" + token;
    }
}

module.exports = Akamai;
