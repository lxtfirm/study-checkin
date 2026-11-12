# 自有服务器：考研打卡与锁屏推送

GitHub Pages 可以预览所有本地功能。后台推送需要同一个 HTTPS 站点同时提供页面和本目录的服务。以下以 Linux、Nginx 和 `study.xli-tong.cloud` 为例，把域名替换为实际已解析的子域名。博客继续使用原来的站点配置。

1. 在服务器上安装 Node.js 24 或更新版本。将项目取到临时目录，把 `index.html`、`css/`、`js/`、`icons/`、`fonts/`、`manifest.webmanifest`、`sw.js` 复制到新站点的公开目录（例如 `/var/www/study-checkin`）。把 `backend/` 放在站点目录之外（例如 `/opt/study-push`），进入该目录运行 `npm ci --omit=dev`。不要把配置、数据库或整个 Git 工作目录放到公开目录。
2. 在后端目录运行 `./node_modules/.bin/web-push generate-vapid-keys`。用 `openssl rand -hex 24` 生成个人连接码。建立只允许管理员与服务账号读取的配置文件（例如 `/etc/study-push.env`），内容如下。将 VAPID 密钥与数据库一起私下备份；更换 VAPID 密钥后设备须重新订阅。

   ```dotenv
   FOCUS_ORIGIN=https://study.xli-tong.cloud
   FOCUS_ENROLL_CODE=替换为生成的连接码
   VAPID_PUBLIC_KEY=替换为生成的公钥
   VAPID_PRIVATE_KEY=替换为生成的私钥
   VAPID_SUBJECT=mailto:替换为你的联系邮箱
   FOCUS_DB=/var/lib/study-push/focus.sqlite
   FOCUS_PORT=8787
   ```

3. 建立专用的无登录服务账号（下面示例为 `study-push`），赋予它对 `/var/lib/study-push` 的写权限。在 `/etc/systemd/system/study-push.service` 保存以下配置。先用 `command -v node` 核对 Node 的绝对路径，再运行 `sudo systemctl daemon-reload` 和 `sudo systemctl enable --now study-push`。用 `sudo journalctl -u study-push -n 50` 查看日志。服务只监听本机，推送需要服务器能向推送服务发出 HTTPS 请求。

   ```ini
   [Unit]
   Description=Study Check-in Focus Push
   After=network-online.target
   Wants=network-online.target

   [Service]
   User=study-push
   WorkingDirectory=/opt/study-push
   EnvironmentFile=/etc/study-push.env
   ExecStart=/usr/bin/node /opt/study-push/server.mjs
   Restart=on-failure
   StateDirectory=study-push
   UMask=0077
   NoNewPrivileges=true

   [Install]
   WantedBy=multi-user.target
   ```

4. 在宝塔或 Nginx 中为子域名建立独立网站，根目录指向步骤 1 的公开目录，为它申请 HTTPS 证书并开启 HTTP 跳转 HTTPS。只在这个新网站的 HTTPS 配置中添加以下反向代理。注意 `proxy_pass` 末尾不加斜杠，以便保留 API 路径。用 `sudo nginx -t` 检查通过后再重载 Nginx。打开新站点的 `/api/focus/config` 应只返回公开密钥。

   ```nginx
   location /api/focus/ {
       client_max_body_size 8k;
       proxy_pass http://127.0.0.1:8787;
   }
   ```

5. 从旧站点导出 JSON，在新站点导入；不同域名的数据不会自动转移。封面在新站点重新选择一次。iPhone 用 Safari 打开新网址，添加到主屏幕，再从主屏幕图标打开。进入「专注计时 → 提醒设置」，输入一次连接码并允许通知。以后只需选任务、设时间、点「开始专注」。
6. 真机先测试两轮：开始 1 分钟后锁屏，确认结束提醒；再开始 1 分钟，中途暂停后锁屏，确认原时间不弹，继续后在新时间提醒。提前结束也会撤销待发送提醒。若手机离线或系统将通知静音，送达或声音仍由系统决定。若提醒已经交给推送服务，暂停无法撤回这条通知。

服务只保存设备推送订阅、计时截止时间和调度状态，学习记录和封面仍在设备本地。设备连接码不等同于服务器密码，请不要公开。更新服务时先保留数据库和密钥，再更新文件并重启服务。

参考：[WebKit 的 iPhone Web Push 支持说明](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/) · [web-push 配置说明](https://github.com/web-push-libs/web-push)
