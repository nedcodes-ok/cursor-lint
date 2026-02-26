const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

const PRODUCT_ID = 'IlErCQxex46U8kXSE12IJw==';
const LICENSE_FILE = '.cursor-doctor-license';
const SALT = 'cursor-doctor-v1';

function getLicensePath() {
  const home = process.env.HOME || process.env.USERPROFILE || '.';
  return path.join(home, LICENSE_FILE);
}

function isLicensed() {
  var p = getLicensePath();
  if (!fs.existsSync(p)) return false;
  try {
    var stored = fs.readFileSync(p, 'utf-8').trim();
    return stored.length === 64 && /^[a-f0-9]+$/.test(stored);
  } catch (e) { return false; }
}

function verifyWithGumroad(key) {
  return new Promise(function(resolve) {
    var postData = 'product_id=' + encodeURIComponent(PRODUCT_ID) + '&license_key=' + encodeURIComponent(key.trim());

    var options = {
      hostname: 'api.gumroad.com',
      path: '/v2/licenses/verify',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    var req = https.request(options, function(res) {
      var body = '';
      res.on('data', function(chunk) { body += chunk; });
      res.on('end', function() {
        try {
          var json = JSON.parse(body);
          if (json.success === true && json.purchase && !json.purchase.refunded && !json.purchase.chargebacked) {
            resolve({ valid: true });
          } else if (json.success === false) {
            resolve({ valid: false, error: 'Invalid license key' });
          } else {
            resolve({ valid: false, error: 'Key is refunded or chargebacked' });
          }
        } catch (e) {
          resolve({ valid: false, error: 'Could not parse Gumroad response' });
        }
      });
    });

    req.on('error', function(e) {
      resolve({ valid: false, error: 'Could not reach Gumroad: ' + e.message });
    });

    req.write(postData);
    req.end();
  });
}

async function activateLicense(dir, key) {
  if (!key || key.trim().length < 8) {
    return { ok: false, error: 'Key too short' };
  }

  var result = await verifyWithGumroad(key);

  if (!result.valid) {
    return { ok: false, error: result.error };
  }

  var hash = crypto.createHash('sha256').update(SALT + ':' + key.trim()).digest('hex');
  var homePath = getLicensePath();

  try {
    fs.writeFileSync(homePath, hash + '\n', 'utf-8');
    return { ok: true, path: homePath };
  } catch (e) {
    return { ok: false, error: 'Failed to save license: ' + e.message };
  }
}

module.exports = { isLicensed, activateLicense };
