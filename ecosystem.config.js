// PM2 ecosystem config — used by deploy.yml
// Ensures the process always starts from the correct directory.
module.exports = {
  apps: [
    {
      name: "portal",
      script: "pnpm",
      args: "start",
      cwd: "/var/www/portal",
      instances: 1,
      exec_mode: "fork",
      watch: false,
      autorestart: true,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
