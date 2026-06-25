const ngrok = require('@ngrok/ngrok');

// 将 stderr 重定向到 stdout，避免 PowerShell 5.1 将 ngrok SDK 的日志误判为 NativeCommandError
const origStderrWrite = process.stderr.write.bind(process.stderr);
process.stderr.write = (chunk, encoding, callback) => {
  return process.stdout.write(chunk, encoding, callback);
};

const AUTHTOKEN = '3FaZfatIil5i745RwmVSuFCZ4Yg_4pwv1JPAkCmH7ey7ZzPfQ';
const PORT = 3001;

async function main() {
  console.log('Connecting to ngrok...');
  try {
    const listener = await ngrok.forward({
      addr: PORT,
      authtoken: AUTHTOKEN,
      authtoken_from_env: false,
    });
    const url = listener.url();
    console.log('========================================');
    console.log('TUNNEL_URL:', url);
    console.log('Forwarding to http://localhost:' + PORT);
    console.log('Press Ctrl+C to stop.');
    console.log('========================================');

    // Keep process alive
    process.on('SIGINT', async () => {
      console.log('\nClosing tunnel...');
      await listener.close();
      process.exit(0);
    });

    // Keep the event loop busy
    setInterval(() => {}, 1000);
  } catch (err) {
    console.error('Failed to start ngrok tunnel:', err.message);
    process.exit(1);
  }
}

main();
