import "dotenv/config";
import { app } from "./app";
import { env } from "./config";

app.listen(env.PORT, "0.0.0.0", () => {
  console.log(`API server running on http://localhost:${env.PORT}`);
});
