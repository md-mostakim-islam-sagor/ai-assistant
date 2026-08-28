const express = require("express");
const path = require("path");

const app = express();
const publicDir = path.join(__dirname, "src", "public");
const dashboardDir = path.join(__dirname, "src", "dashboard");

app.use(express.static(publicDir, { index: false }));
app.use("/dashboard", express.static(dashboardDir, { index: false }));

app.get("/", (req, res) => {
  if (Object.prototype.hasOwnProperty.call(req.query, "admin")) {
    return res.sendFile(path.join(dashboardDir, "login.html"));
  }
  return res.sendFile(path.join(publicDir, "index.html"));
});

const port = Number(process.env.PORT || 3000);
app.listen(port, "0.0.0.0", () => {
  console.log(`Frontend running on port ${port}`);
});
