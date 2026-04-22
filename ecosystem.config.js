// PM2 ecosystem config
module.exports = {
  apps: [
    {
      name: "portal",
      // Use local next binary — no dependency on pnpm being installed globally
      script: "node_modules/next/dist/bin/next",
      args: "start -H 127.0.0.1 -p 3000",
      cwd: "/var/www/portal",
      instances: 1,
      exec_mode: "fork",
      watch: false,
      autorestart: true,
      max_memory_restart: "512M",
      // Wait before restart to prevent flapping
      restart_delay: 4000,
      exp_backoff_restart_delay: 100,
      env: {
        NODE_ENV: "production",
        PORT: "3000",
      },
      out_file: "/var/log/pm2/portal-out.log",
      error_file: "/var/log/pm2/portal-error.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
    },
  ],
};
