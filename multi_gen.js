const { connect } = require("puppeteer-real-browser");
const fs = require('fs');

const log = (...args) => console.error(...args);
const chromePath = process.env.CHROME_PATH || '/usr/bin/chromium-browser';

function generateRandomString(length) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

async function wiggleMouse(page) {
    try {
        await page.mouse.move(100, 100);
        await page.mouse.move(200, 200, { steps: 10 });
        await page.mouse.move(150, 250, { steps: 10 });
    } catch (e) {}
}

async function generateSingleToken(iteration, totalRuns) {
    log(`\n>>> [${iteration}/${totalRuns}] Starting...`);
    
    let browser, page;
    try {
        const conn = await connect({
            headless: false,
            turnstile: true,
            executablePath: chromePath,
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-blink-features=AutomationControlled",
                "--window-size=1280,800",
                "--disable-gpu",
                "--disable-application-cache"
            ]
        });
        browser = conn.browser;
        page = conn.page;
    } catch (e) {
        log(">>> Launch failed:", e.message);
        return null;
    }

    try {
        // Clear state
        log(`>>> [${iteration}] Clearing cookies...`);
        try {
            const client = await page.target().createCDPSession();
            await client.send('Network.clearBrowserCookies');
            await client.send('Network.clearBrowserCache');
            await page.goto('about:blank');
            await page.evaluate(() => {
                localStorage.clear();
                sessionStorage.clear();
            });
        } catch (e) {}

        // Get email
        log(`>>> [${iteration}] Getting email...`);
        
        const emailPromise = new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error("Email timeout")), 35000);
            page.on('response', async (response) => {
                if (response.url().includes('temp-mail.org/mailbox') && response.request().method() === 'POST') {
                    try {
                        const json = await response.json();
                        if (json.mailbox) {
                            clearTimeout(timeout);
                            resolve(json.mailbox);
                        }
                    } catch (e) {}
                }
            });
        });

        await page.goto("https://temp-mail.org/", { waitUntil: "networkidle2", timeout: 50000 });
        await wiggleMouse(page);
        
        let email;
        try {
            email = await emailPromise;
        } catch (e) {
            // Fallback to DOM
            for (let i = 0; i < 15; i++) {
                const domEmail = await page.evaluate(() => {
                    const input = document.querySelector('#mail');
                    return input ? input.value : null;
                });
                if (domEmail && domEmail.includes('@')) {
                    email = domEmail;
                    break;
                }
                await new Promise(r => setTimeout(r, 1000));
            }
        }
        
        if (!email) throw new Error("No email");
        log(`>>> [${iteration}] Email: ${email}`);

        // Credentials
        const username = "user" + generateRandomString(8);
        const password = "Pass" + generateRandomString(8) + "!";

        // Captcha
        log(`>>> [${iteration}] Captcha...`);
        await page.goto("https://puter.com/login", { waitUntil: "domcontentloaded", timeout: 30000 });
        await wiggleMouse(page);

        const sitekey = "0x4AAAAAABvMyOLo9EwjFVzC";

        await page.evaluate((sk) => {
            document.body.innerHTML = '<div id="wrapper" style="display:flex;justify-content:center;align-items:center;height:100vh;"><div id="cf-container"></div></div>';
            window.cfToken = null;
            const script = document.createElement('script');
            script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
            script.onload = () => {
                const int = setInterval(() => {
                    if (window.turnstile) {
                        clearInterval(int);
                        window.turnstile.render("#cf-container", { sitekey: sk, callback: (t) => { window.cfToken = t; } });
                    }
                }, 100);
            };
            document.head.appendChild(script);
        }, sitekey);

        try {
            await page.waitForSelector("#cf-container iframe", { timeout: 10000 });
            await new Promise(r => setTimeout(r, 1500));
            const el = await page.$("#cf-container iframe");
            const box = await el.boundingBox();
            if (box) {
                await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 10 });
                await page.mouse.down();
                await new Promise(r => setTimeout(r, 100));
                await page.mouse.up();
            }
        } catch (e) {}

        await page.waitForFunction(() => window.cfToken !== null, { timeout: 45000 });
        const cfToken = await page.evaluate(() => window.cfToken);

        // Signup
        log(`>>> [${iteration}] Signup...`);
        
        const responseData = await page.evaluate(async (payload) => {
            const res = await fetch("https://puter.com/signup", {
                method: "POST",
                headers: {
                    "accept": "*/*",
                    "content-type": "application/json",
                    "origin": "https://puter.com",
                    "referer": "https://puter.com/"
                },
                body: JSON.stringify({
                    username: payload.username,
                    email: payload.email,
                    password: payload.password,
                    referrer: "https://docs.puter.com/",
                    send_confirmation_code: false,
                    p102xyzname: "",
                    "cf-turnstile-response": payload.cfToken
                })
            });
            const text = await res.text();
            try { return JSON.parse(text); } catch (e) { return { error: text }; }
        }, { username, email, password, cfToken });

        await browser.close();

        if (responseData.token) {
            log(`>>> [${iteration}] SUCCESS!`);
            return responseData.token;
        } else {
            log(`>>> [${iteration}] Failed:`, JSON.stringify(responseData));
            return null;
        }

    } catch (err) {
        log(`>>> [${iteration}] Error:`, err.message);
        if (browser) await browser.close();
        return null;
    }
}

(async () => {
    const runs = parseInt(process.env.NUM_RUNS) || 5;
    log(`>>> Starting ${runs} runs...`);
    
    // Ensure tokens directory exists
    if (!fs.existsSync('tokens')) fs.mkdirSync('tokens');
    
    const tokens = [];
    
    for (let i = 1; i <= runs; i++) {
        const token = await generateSingleToken(i, runs);
        if (token) {
            tokens.push(token);
            fs.appendFileSync('tokens/all_tokens.txt', token + '\n');
            console.log(token); // stdout
            
            try {
                await fetch("https://gigachadtrey--a1b5c282cb3711f0857d42dde27851f2.web.val.run", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ token, batch_index: i })
                });
            } catch (e) {}
        }
        await new Promise(r => setTimeout(r, 3000));
    }
    
    log(`\n>>> Complete. ${tokens.length}/${runs} tokens generated.`);
    log(">>> Saved to: tokens/all_tokens.txt");
})();
