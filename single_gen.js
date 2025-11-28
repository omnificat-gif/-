const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');

puppeteer.use(StealthPlugin());

const log = (...args) => console.error('[LOG]', ...args);

function generateRandomString(length) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

async function wiggleMouse(page) {
    try {
        await page.mouse.move(100, 100);
        await page.mouse.move(200, 150, { steps: 5 });
        await page.mouse.move(150, 200, { steps: 5 });
        await page.mouse.move(300, 250, { steps: 5 });
    } catch (e) {}
}

async function clickTurnstileIfPresent(page) {
    await sleep(2000);
    try {
        const frames = page.frames();
        for (const frame of frames) {
            const url = frame.url();
            if (url.includes('challenges.cloudflare.com')) {
                log('Found Cloudflare challenge frame');
                const checkbox = await frame.$('input[type="checkbox"]');
                if (checkbox) {
                    await checkbox.click();
                    log('Clicked checkbox');
                    await sleep(3000);
                    return;
                }
                const body = await frame.$('body');
                if (body) {
                    const box = await body.boundingBox();
                    if (box) {
                        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
                        log('Clicked challenge frame center');
                        await sleep(3000);
                    }
                }
            }
        }
    } catch (e) {
        log('Turnstile click error (non-fatal):', e.message);
    }
}

(async () => {
    const chromePath = process.env.CHROME_PATH || '/usr/bin/chromium-browser';
    log('Chrome path:', chromePath);
    log('DISPLAY:', process.env.DISPLAY);

    // Ensure tokens dir exists
    if (!fs.existsSync('tokens')) {
        fs.mkdirSync('tokens', { recursive: true });
    }

    log('Launching browser...');
    
    const browser = await puppeteer.launch({
        headless: false,
        executablePath: chromePath,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
            '--disable-background-networking',
            '--disable-default-apps',
            '--disable-extensions',
            '--disable-sync',
            '--disable-translate',
            '--hide-scrollbars',
            '--metrics-recording-only',
            '--mute-audio',
            '--safebrowsing-disable-auto-update',
            '--window-size=1280,800'
        ],
        ignoreDefaultArgs: ['--enable-automation'],
        defaultViewport: { width: 1280, height: 800 }
    });

    const page = await browser.newPage();

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    try {
        // ====== 1. GET EMAIL ======
        log('Getting temp email...');

        let emailFound = null;

        page.on('response', async (response) => {
            try {
                if (response.url().includes('temp-mail.org') && response.url().includes('mailbox')) {
                    const json = await response.json().catch(() => null);
                    if (json && json.mailbox && !emailFound) {
                        emailFound = json.mailbox;
                        log('Got email from network:', emailFound);
                    }
                }
            } catch (e) {}
        });

        await page.goto('https://temp-mail.org/', { waitUntil: 'networkidle2', timeout: 60000 });
        await wiggleMouse(page);
        await clickTurnstileIfPresent(page);

        // Wait for email via DOM
        for (let i = 0; i < 30 && !emailFound; i++) {
            const domEmail = await page.evaluate(() => {
                const el = document.querySelector('#mail');
                return el ? el.value : null;
            });
            if (domEmail && domEmail.includes('@')) {
                emailFound = domEmail;
                log('Got email from DOM:', emailFound);
                break;
            }
            await sleep(1000);
        }

        if (!emailFound) {
            throw new Error('Could not get temp email after 30 seconds');
        }

        // ====== 2. GENERATE CREDS ======
        const username = 'user' + generateRandomString(8);
        const password = 'Pass' + generateRandomString(8) + '!';
        log('Username:', username);

        // ====== 3. SOLVE TURNSTILE ON PUTER ======
        log('Navigating to Puter for captcha...');
        await page.goto('https://puter.com/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
        await wiggleMouse(page);

        const sitekey = '0x4AAAAAABvMyOLo9EwjFVzC';

        await page.evaluate((sk) => {
            document.body.innerHTML = `
                <div id="wrapper" style="display:flex;justify-content:center;align-items:center;height:100vh;background:#111;">
                    <div id="cf-container"></div>
                </div>
            `;
            window.cfToken = null;
            const script = document.createElement('script');
            script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
            script.onload = () => {
                const int = setInterval(() => {
                    if (window.turnstile) {
                        clearInterval(int);
                        window.turnstile.render('#cf-container', {
                            sitekey: sk,
                            callback: (token) => { window.cfToken = token; }
                        });
                    }
                }, 100);
            };
            document.head.appendChild(script);
        }, sitekey);

        log('Waiting for Turnstile widget...');
        await sleep(3000);

        // Click the widget
        try {
            const iframeHandle = await page.$('#cf-container iframe');
            if (iframeHandle) {
                const box = await iframeHandle.boundingBox();
                if (box) {
                    log('Clicking Turnstile widget...');
                    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 10 });
                    await sleep(500);
                    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
                    await sleep(1000);
                    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
                }
            }
        } catch (e) {
            log('Widget click issue:', e.message);
        }

        log('Waiting for cfToken...');
        await page.waitForFunction(() => window.cfToken !== null, { timeout: 90000 });
        const cfToken = await page.evaluate(() => window.cfToken);
        log('Got Turnstile token!');

        // ====== 4. SIGNUP ======
        log('Sending signup request...');

        const signupResult = await page.evaluate(async (data) => {
            try {
                const res = await fetch('https://puter.com/signup', {
                    method: 'POST',
                    headers: {
                        'Accept': '*/*',
                        'Content-Type': 'application/json',
                        'Origin': 'https://puter.com',
                        'Referer': 'https://puter.com/'
                    },
                    body: JSON.stringify({
                        username: data.username,
                        email: data.email,
                        password: data.password,
                        referrer: 'https://docs.puter.com/',
                        send_confirmation_code: false,
                        p102xyzname: '',
                        'cf-turnstile-response': data.cfToken
                    })
                });
                const text = await res.text();
                try {
                    return { ok: true, status: res.status, data: JSON.parse(text) };
                } catch (e) {
                    return { ok: false, status: res.status, raw: text };
                }
            } catch (e) {
                return { ok: false, error: e.message };
            }
        }, { username, email: emailFound, password, cfToken });

        if (signupResult.ok && signupResult.data && signupResult.data.token) {
            const token = signupResult.data.token;
            log('SUCCESS! Got token.');

            fs.writeFileSync('tokens/token.txt', token);
            fs.appendFileSync('tokens/all_tokens.txt', token + '\n');

            // Print token to stdout (for capture by multi_gen)
            console.log(token);

            // Send to val.town
            try {
                await page.evaluate(async (payload) => {
                    await fetch('https://gigachadtrey--a1b5c282cb3711f0857d42dde27851f2.web.val.run', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                }, signupResult.data);
                log('Sent to Val Town');
            } catch (e) {
                log('Val Town send failed (non-critical)');
            }

        } else {
            log('SIGNUP FAILED');
            log('Status:', signupResult.status);
            log('Response:', JSON.stringify(signupResult.data || signupResult.raw || signupResult.error));
            process.exit(1);
        }

    } catch (err) {
        log('ERROR:', err.message);
        process.exit(1);
    } finally {
        await browser.close();
    }
})();
