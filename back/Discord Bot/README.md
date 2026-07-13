# War Archive Discord Bot Monitor

This monitor reads NAS pipeline state and writes actionable monitoring logs.
If `DISCORD_BOT_TOKEN` and `DISCORD_CHANNEL_ID` are set, it posts alerts with the Discord bot account.
When the monitor is running without `--once`, it also keeps a Discord Gateway session open so the bot appears online.
If those bot settings are not set, `DISCORD_WEBHOOK_URL` remains available as a fallback.

## Discord bot setup

1. Create a Discord application and bot in the Discord Developer Portal.
2. Invite the bot to the target server with `Send Messages` permission for the target channel.
   Invite URL format: `https://discord.com/oauth2/authorize?client_id=CLIENT_ID&permissions=2048&scope=bot`
3. Enable Developer Mode in Discord, copy the target channel ID, and set it as `DISCORD_CHANNEL_ID`.
4. Store the bot token only in `back/.env` as `DISCORD_BOT_TOKEN`.

## Run

```sh
node "Discord Bot/monitor.mjs" --once
node "Discord Bot/monitor.mjs"
```

`--once` sends one check and exits, so the bot will not stay online. Use the long-running command or `npm run monitor:discord` for online presence.

## Outputs

- Log file: `back/Discord Bot/logs/monitoring.log`
- Discord bot alert when `DISCORD_BOT_TOKEN` and `DISCORD_CHANNEL_ID` are configured
- Optional Discord webhook fallback

## Detected cases

- Collection failure
- GitHub publish auth failure
- GitHub conflict
- GitHub rate limit
- GitHub validation or branch protection failure
- Collector stalled
- Publisher stalled
- Low quality or outlier spike
- Same URL content update detected
- Missing or incomplete Discord delivery configuration
