# cpolar内网穿透线路列表

构建 `image`

```bash
docker build -t .
```

运行

```bash
docker run -d -p 3100:3000 -e CPOLAR_USER="user name or email" -e CPOLAR_PASS="password" --name cpolar-server-container cpolar-server
```
