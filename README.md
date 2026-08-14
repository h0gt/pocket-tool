<h1 align="center">
  <a href="https://discord.com/oauth2/authorize?client_id=1489362526880796903" target="_blank">
      Pocket Tool Discord App
  </a>
</h1>

> A lightweight utility Discord app made to be used anywhere at any time!

## Why use Pocket Tool?

Pocket Tool is a **lightweight, fast, and versatile Discord app** designed to be your all-in-one utility companion. Whether you're looking to enhance productivity, access handy tools anywhere on Discord, or add fun features, Pocket Tool has you covered.

## How do I self-host Pocket Tool?

- [Bun](https://bun.com/)
- A Discord app token
- A publicly accessible URL to receive interactions (e.g. via a reverse proxy, [ngrok](https://ngrok.com/), or a hosting provider)

1. Clone the repository:

```bash
git clone https://github.com/mloetta/pocket-tool
cd pocket-tool
```

2. Install dependencies:

```bash
bun install
```

3. Set up environment variables:

```bash
cp .env.example .env
```

4. Edit the `.env` file to add your app token and other configuration options.
5. Build and run the app:

```bash
bun run start
```

6. In the [Discord Developer Portal](https://discord.com/developers/applications), open your application, go to **General Information**, and set the **Interactions Endpoint URL** to your public URL (e.g. `https://yourdomain.com/interactions`). Discord will send a verification request — make sure the bot is running before you save it, or the URL won't validate.

> If you prefer an easier setup, you can simply [add Pocket Tool](https://discord.com/oauth2/authorize?client_id=1489362526880796903)!
