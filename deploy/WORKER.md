# Run the prebuilt podcast worker

Extract the entire worker archive into a private directory. With Node.js 24 LTS on your PATH, run the following command from that directory.

```sh
node --env-file-if-exists=.env.podcast server/main.mjs
```

Open [the local Library](http://127.0.0.1:8787/). The service starts without a provider key. The browser can play and restore saved episodes. For paid production, enter a project key under Settings, then explicitly consent to a request in Studio. The key entered there expires when the process exits. If FFmpeg with libmp3lame is available on the worker's PATH, the worker can also export MP3.

For continuous service, run the same foreground command under the host's service manager with this directory as its working directory. Keep the machine awake. Set `PODCAST_DATA_DIR` to a durable private directory on a local disk and restrict any `.env.podcast` file to the service account. One process owns the data directory at a time. Use a separate directory and port for rehearsals. On restart, interrupted jobs retain their checkpoints for an explicit retry.

For an upgrade, keep the previous archive, pause Automation, let active jobs settle, export browser episodes as private `.kps` files, then stop the worker and back up the whole data directory. Extract the new distribution into a separate directory and start it using the same data directory, port and origin. Keep the data directory outside both release directories. Test a rollback with an isolated data copy and no provider credentials before resuming the schedule.

The public Pages site hosts the browser app. The worker listens on loopback. Private HTTPS access requires an exact public origin, a separate owner token and a trusted reverse proxy. Consult the [worker runbook](https://github.com/yapweijun1996/PWA-Knowledge-Podcast-OpenAI-TTS/blob/main/docs/V2-FACTORY.md) for these settings and the [release checklist](https://github.com/yapweijun1996/PWA-Knowledge-Podcast-OpenAI-TTS/blob/main/docs/PRODUCTION-READINESS.md) for acceptance evidence.
