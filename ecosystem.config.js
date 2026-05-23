module.exports = {
  apps: [{
    name: 'dmrxai',
    script: 'npm',
    args: 'start',
    cwd: '/home/ubuntu/dmrxai',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '512M'
  }]
}
