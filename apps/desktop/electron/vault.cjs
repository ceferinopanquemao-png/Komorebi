const crypto = require('node:crypto');
const {promisify} = require('node:util');
const derive = promisify(crypto.scrypt);
async function keyFor(password, salt) {
  if (typeof password !== 'string' || password.length < 10) throw new Error('Use a password of at least 10 characters.');
  return derive(password, salt, 32, {N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024});
}
function seal(data, key, salt) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
  return JSON.stringify({version: 1, salt: salt.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64')});
}
async function open(raw, password) {
  const v = JSON.parse(raw);
  if (v.version !== 1) throw new Error('Unsupported vault version.');
  const salt = Buffer.from(v.salt, 'base64');
  if (salt.length !== 16) throw new Error('Invalid vault.');
  const key = await keyFor(password, salt);
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(v.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(v.tag, 'base64'));
    const data = JSON.parse(Buffer.concat([decipher.update(Buffer.from(v.ciphertext, 'base64')), decipher.final()]).toString('utf8'));
    return {data, key, salt};
  } catch { key.fill(0); throw new Error('Incorrect password or damaged vault.'); }
}
module.exports = {keyFor, seal, open};
