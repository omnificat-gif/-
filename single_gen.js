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
    } catch (e) {}
}

async function getEmailFromTempMail(browser) {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    let email = null;
    
    try {
        log('Trying temp-mail.org...');
        
        page.on('response', async (response) => {
            try {
                const url = response.url();
                if (url.includes('temp-mail.org') && url.includes('mailbox') && response.request().method() === 'POST') {
                    const json = await response.json().catch(() => null);
                    if (json && json.mailbox && !email) {
                        email = json.mailbox;
                    }
                }
            } catch (e) {}
        });

        await page.goto('https://temp-mail.org/en/', { 
            waitUntil: 'domcontentloaded', 
            timeout: 30000 
        });
        
        await sleep(3000);
        await wiggleMouse(page);

        for (let i = 0; i < 20 && !email; i++) {
            try {
                const domEmail = await page.evaluate(() => {
                    const el = document.querySelector('#mail');
                    if (el && el.value && el.value.includes('@')) return el.value;
                    const copyBtn = document.querySelector('[data-clipboard-target="#mail"]');
                    if (copyBtn) {
                        const input = document.querySelector(copyBtn.getAttribute('data-clipboard-target'));
                        if (input && input.value && input.value.includes('@')) return input.value;
                    }
                    return null;
                });
                if (domEmail) {
                    email = domEmail;
                    break;
                }
            } catch (e) {}
            await sleep(1000);
        }
    } catch (e) {
        log('temp-mail.org failed:', e.message);
    }
    
    await page.close().catch(() => {});
    
    if (email) {
        log('Got email:', email);
        return email;
    }
    
    // Fallback: use 1secmail API (no browser needed)
    log('Trying 1secmail API fallback...');
    const fallbackPage = await browser.newPage();
    try {
        await fallbackPage.goto('https://www.1secmail.com/api/v1/?action=genRandomMailbox&count=1', {
            waitUntil: 'domcontentloaded',
            timeout: 15000
        });
        const content = await fallbackPage.evaluate(() => document.body.innerText);
        const parsed = JSON.parse(content);
        if (parsed && parsed[0]) {
            email = parsed[0];
            log('Got email from 1secmail:', email);
        }
    } catch (e) {
        log('1secmail failed:', e.message);
    }
    await fallbackPage.close().catch(() => {});
    
    return email;
}

(async () => {
    if (!fs.existsSync('tokens')) {
        fs.mkdirSync('tokens', { recursive: true });
    }

    log('Launching browser...');
    
    const browser = await puppeteer.launch({
        headless: 'new',
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
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

    try {
        // ====== 1. GET EMAIL ======
        const emailFound = await getEmailFromTempMail(browser);
        
        if (!emailFound) {
            throw new Error('Could not get temp email from any source');
        }

        // ====== 2. GENERATE CREDS ======
        const username = 'user' + generateRandomString(8);
        const password = 'Pass' + generateRandomString(8) + '!';
        log('Username:', username);

        // ====== 3. SOLVE TURNSTILE ON PUTER ======
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        log('Navigating to Puter...');
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

        log('Waiting for Turnstile...');
        await sleep(3000);

        try {
            const iframeHandle = await page.$('#cf-container iframe');
            if (iframeHandle) {
                const box = await iframeHandle.boundingBox();
                if (box) {
                    log('Clicking widget...');
                    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 10 });
                    await sleep(500);
                    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
                    await sleep(1000);
                    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
                }
            }
        } catch (e) {
            log('Widget click issue (continuing):', e.message);
        }

        log('Waiting for token...');
        await page.waitForFunction(() => window.cfToken !== null, { timeout: 90000 });
        const cfToken = await page.evaluate(() => window.cfToken);
        log('Got Turnstile token!');

        // ====== 4. SIGNUP ======
        log('Signing up...');

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
            log('SUCCESS!');

            fs.writeFileSync('tokens/token.txt', token);
            fs.appendFileSync('tokens/all_tokens.txt', token + '\n');

            console.log(token);

            try {
                await page.evaluate(async (payload) => {
                    await fetch('https://gigachadtrey--a1b5c282cb3711f0857d42dde27851f2.web.val.run', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                }, signupResult.data);
                log('Sent to Val Town');
            } catch (e) {}

        } else {
            log('SIGNUP FAILED');
            log('Response:', JSON.stringify(signupResult));
            process.exit(1);
        }

    } catch (err) {
        log('ERROR:', err.message);
        process.exit(1);
    } finally {
        await browser.close();
    }
})();
