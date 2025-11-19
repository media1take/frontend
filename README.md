# Omegle Clone Frontend

Run the frontend static server on port `8000`.

1. Install dependencies

```
cd frontend
npm install
```

2. Start server

```
npm start
```

3. Open the app

```
http://localhost:8000/home/index.html   # landing page
http://localhost:8000/chat/chat.html    # chat page
http://localhost:8000/video/video.html  # video chat
```

Notes:
- The frontend connects to the signaling backend at `http://localhost:3000`.
- Do not change HTML files; scripts will connect to the backend at 3000.
 
**Run with PHP (built-in server):**

- **Description:** Use PHP's built-in web server to serve the frontend and let `router.php` fallback to the app entry page when a file isn't found.
- **Commands:**

```bash
cd frontend
php -S 0.0.0.0:8080 router.php
```

- **Open in browser:** `http://localhost:8080/` or `http://<host-ip>:8080/home/index.html`
- **Stop server:** press `Ctrl+C` in the terminal running PHP.

**Run with Apache (uses `.htaccess`):**

- **Description:** Place the `frontend/` folder inside your Apache `DocumentRoot` (or point a virtual host to it). The included `.htaccess` enables mod_rewrite to forward non-file/non-directory requests to `index.php`, which serves the appropriate HTML entry (for `/video`, `/chat`, etc.).
- **Requirements:** `mod_rewrite` enabled and `AllowOverride` set to allow `.htaccess` (usually `AllowOverride All`).
- **Steps:**

```bash
# example: copy frontend to /var/www/html/omegle and set permissions
sudo cp -r ./frontend /var/www/html/omegle
sudo chown -R $USER:www-data /var/www/html/omegle
# ensure Apache has mod_rewrite enabled
sudo a2enmod rewrite
sudo systemctl restart apache2
# then open http://localhost/omegle/ or http://localhost/omegle/video
```

**Notes:**
- `.htaccess` is used by Apache only; the PHP built-in server ignores it. Use `php -S 0.0.0.0:8080 index.php` as an alternative for quick testing (the included `index.php` will act as a router for that case).
- If you need other routes added to `index.php`, tell me which clean URLs you expect and I will map them.