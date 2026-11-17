// Startup file for hosting panels (Webuzo / Passenger) that run `node server.js`
// with no CLI arguments. Equivalent to `next start`; run `npm run build` first.
const { createServer } = require("http");
const next = require("next");

const port = parseInt(process.env.PORT || "30003", 10);
const app = next({ dev: false, dir: __dirname });
const handle = app.getRequestHandler();

app
  .prepare()
  .then(() => {
    createServer((req, res) => handle(req, res)).listen(port, () => {
      console.log(`> Daily Food Hut frontend ready on port ${port}`);
    });
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
