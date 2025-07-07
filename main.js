// cpolar-server.js
import express from "express";
import axios from "axios";
import * as cheerio from "cheerio";
import { wrapper } from "axios-cookiejar-support";
import { CookieJar } from "tough-cookie";
import qs from "qs";
import fs from "fs/promises";
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// 注册 favicon 目录为静态目录
app.use('/favicon', express.static(path.join(__dirname, 'favicon')));
const port = 3000;
const baseUrl = "https://dashboard.cpolar.com";
const COOKIE_FILE = "./cookies.json";

const user = process.env.CPOLAR_USER;
const password = process.env.CPOLAR_PASS;
if (!user || !password) {
  console.error("请通过环境变量设置 CPOLAR_USER 和 CPOLAR_PASS");
  process.exit(1);
}

function sleep(delay) {
  return new Promise((resolve) => setTimeout(resolve, delay));
}

function analysisData(arr) {
  return arr.map(({ name, url, local }) => {
    const regex = /\/\/(?<host>[^:/\s]+):(?<port>\d+)/;
    let newUrl = url;
    if (url.startsWith("tcp://")) {
      const match = url.match(regex);
      if (match && match.groups) {
        const { host, port } = match.groups;
        newUrl = `ssh ao@${host} -p${port}`;
      }
    }
    return {
      name,
      url: newUrl,
      local,
    };
  });
}

async function loadCookieJar() {
  try {
    const data = await fs.readFile(COOKIE_FILE, "utf8");
    const json = JSON.parse(data);

    // 校验 cookie 文件结构
    if (!json || typeof json !== "object" || !Array.isArray(json.cookies)) {
      console.warn(
        "Invalid cookies.json structure, falling back to new CookieJar"
      );
      return new CookieJar();
    }

    return CookieJar.fromJSON(json)
  } catch {
    return new CookieJar(); // fallback
  }
}

async function saveCookieJar(jar) {
  const json = jar.toJSON();
  await fs.writeFile(COOKIE_FILE, JSON.stringify(json, null, 2));
}

async function performLogin(client) {
  const loginPage = await client.get(`${baseUrl}/login`);
  const $ = cheerio.load(loginPage.data);
  const csrf_token = $('input[name="csrf_token"]').val();

  await client.post(
    `${baseUrl}/login`,
    qs.stringify({
      login: user,
      password: password,
      csrf_token,
    }),
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      },
      maxRedirects: 0,
      validateStatus: (status) => status < 400,
    }
  );
}

async function fetchStatusPage(client) {
  const statusPage = await client.get(`${baseUrl}/status`);
  const $ = cheerio.load(statusPage.data);
  const rows = $("table.table.table-sm tbody tr");
  const result = [];

  rows.each((i, el) => {
    const columns = $(el).find("td, th");
    result.push({
      name: $(columns[0]).text().trim(),
      url: $(columns[1]).text().trim(),
      region: $(columns[2]).text().trim(),
      local: $(columns[3]).text().trim(),
      created_at: $(columns[4]).text().trim(),
    });
  });

  // await client.get(`${baseUrl}/logout`);
  return analysisData(result);
}

async function fetchTunnelsWithLoginCache() {
  const jar = await loadCookieJar();
  const client = wrapper(axios.create({ jar }));

  try {
    const test = await client.get(`${baseUrl}/status`, {
      maxRedirects: 0,
      validateStatus: (status) => status < 400,
    });
    if (test.data === '<a href="/login">Found</a>.\n\n') throw new Error("Session expired");
    console.debug("Cookies有效，获取数据中...", new Date().toString());
    return await fetchStatusPage(client);
  } catch (err) {
    console.debug("Cookies失效，尝试登录中...", new Date().toString());
    await performLogin(client);
    await saveCookieJar(jar);
    return await fetchStatusPage(client);
  }
}

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/data", async (req, res) => {
  try {
    const tunnels = await fetchTunnelsWithLoginCache();
    res.json(tunnels);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(port, () => {
  console.log(`🚀 Server running at http://localhost:${port}`);
});
