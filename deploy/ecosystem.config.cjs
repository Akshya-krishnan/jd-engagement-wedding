// PM2 keeps the invitation server running and restarts it after crashes or a VPS reboot.
//   pm2 start deploy/ecosystem.config.cjs && pm2 save
module.exports = {
  apps: [
    {
      name: 'jd-invitation',
      script: 'server.js',
      cwd: __dirname + '/..',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        HOST: '127.0.0.1'
      },
      max_memory_restart: '200M'
    }
  ]
};
