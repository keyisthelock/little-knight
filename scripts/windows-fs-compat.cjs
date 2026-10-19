// Windows runtime compatibility: the sandbox supports synchronous realpath,
// while libuv's asynchronous realpath returns EPERM even for writable files.
// Both resolve the same paths with the same filesystem permissions.
if (process.platform === 'win32') {
  const fs = require('node:fs');
  fs.promises.realpath = async (path, options) => fs.realpathSync(path, options);
}
